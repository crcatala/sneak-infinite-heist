// Offline solo mode: the same `Room` engine the Durable Object runs, hosted in this tab instead.
// The screens can't tell the difference: messages go through `store.send`, views come back through
// the store. Nothing is persisted; closing the tab ends the game.

import { createRoomState, Room } from "../shared/room";
import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { loadName } from "./identity";
import { useStore } from "./store";

export interface SoloOptions {
  role: "thief" | "detectives";
  /** Detective pawns when you play the thief (1–3), or bot teammates when you're a detective (0–2). */
  bots: number;
}

interface LocalSession {
  room: Room;
  playerId: string;
  timer?: ReturnType<typeof setTimeout>;
}

let session: LocalSession | null = null;

export function startLocal(opts: SoloOptions) {
  stopLocal();
  const room = new Room(createRoomState("SOLO", Date.now()), { now: () => Date.now(), rng: Math.random, cheats: true });
  const { playerId } = room.join({ name: loadName() || "You" });
  const bots = opts.role === "thief" ? Math.max(1, Math.min(3, opts.bots)) : Math.max(1, Math.min(3, opts.bots + 1));
  for (let i = 0; i < bots; i++) room.handle(playerId, { t: "addBot" });
  room.handle(playerId, { t: "settings", patch: { thiefSelection: "host" } });
  const thief = opts.role === "thief" ? playerId : room.state.players[room.state.players.length - 1].id;
  room.handle(playerId, { t: "setThief", playerId: thief });
  session = { room, playerId };
  useStore.setState({
    mode: "solo",
    status: "open",
    fatal: null,
    claimSeats: [],
    clockOffset: 0,
    view: viewOf(room, playerId),
    sendImpl: (msg) => queueMicrotask(() => deliver(msg)),
  });
}

export function stopLocal() {
  if (session) clearTimeout(session.timer);
  session = null;
  useStore.setState({ status: "idle", view: null, mode: "online", sendImpl: () => {} });
}

/**
 * A snapshot of the room as the player sees it. `viewFor` shares arrays with the live room state
 * (the event log), so without a copy React selectors could see "no change"; online, every view is
 * freshly parsed JSON, and cloning gives solo mode the same guarantee.
 */
function viewOf(room: Room, playerId: string) {
  return structuredClone(room.viewFor(playerId));
}

function deliver(msg: ClientMessage) {
  const s = session;
  if (!s) return;
  const result = s.room.handle(s.playerId, msg);
  for (const out of result.outbound) if (out.to === "self") receive(out.msg);
  if (result.changed) publish();
}

function receive(msg: ServerMessage) {
  if (msg.t === "error") useStore.getState().toast(msg.message, "error");
  if (msg.t === "emote") useStore.getState().showEmote(msg.by, msg.emote);
}

function publish() {
  const s = session;
  if (!s) return;
  useStore.setState({ view: viewOf(s.room, s.playerId) });
  schedule(s);
}

/** Timers and bot moves: the browser's setTimeout stands in for Durable Object alarms. */
function schedule(s: LocalSession) {
  clearTimeout(s.timer);
  const at = s.room.nextAlarm();
  if (at === null) return;
  s.timer = setTimeout(() => {
    if (session !== s) return;
    if (s.room.tick()) publish();
    // Timers can fire a hair early; only retry for a deadline that's still ahead.
    else if ((s.room.nextAlarm() ?? 0) > Date.now()) schedule(s);
  }, Math.max(20, at - Date.now()));
}
