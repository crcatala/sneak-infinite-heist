// Offline solo mode: the same `Room` engine the Durable Object runs, hosted in this tab instead.
// The screens can't tell the difference: messages go through `store.send`, views come back through
// the store. Nothing is persisted; closing the tab ends the game.

import type { ClientMessage, ServerMessage } from "../shared/protocol";
import type { Room } from "../shared/room";
import { captureOptions } from "./capture";
import { loadName } from "./identity";
import { createSoloRoom, type SoloOptions } from "./soloRoom";
import { useStore } from "./store";

export type { SoloOptions };

interface LocalSession {
  room: Room;
  playerId: string;
  now: () => number;
  timer?: ReturnType<typeof setTimeout>;
}

let session: LocalSession | null = null;

export function startLocal(opts: SoloOptions) {
  stopLocal();
  const capture = captureOptions();
  const { room, playerId, clock, now } = createSoloRoom(opts, loadName() || "You", capture);
  session = { room, playerId, now };
  useStore.setState({
    mode: "solo",
    status: "open",
    fatal: null,
    claimSeats: [],
    clockOffset: clock.ahead,
    view: viewOf(room, playerId),
    sendImpl: (msg) => queueMicrotask(() => deliver(msg)),
  });
  // A capture that starts the game itself has bots to wake.
  if (capture?.start) schedule(session);
}

/** Ms since the solo room opened, by its own clock (what scripts/capture-scan.mjs times events by), or null. */
export function soloRoomTime(): number | null {
  return session ? session.now() - session.room.state.createdAt : null;
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
  if (msg.t === "pin") useStore.getState().showPin(msg.by, msg.x, msg.y);
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
