// The solo room, set up the same way in the browser (local.ts) and in Node (scripts/capture-scan.mjs),
// so a capture seed scanned in Node plays the same game, at the same times, as it does on screen.

import { createRoomState, Room } from "../shared/room";
import { mulberry32 } from "../shared/rng";
import type { CaptureOptions } from "./capture";

export interface SoloOptions {
  role: "thief" | "detectives";
  /** Detective pawns when you play the thief (1–3), or bot teammates when you're a detective (0–2). */
  bots: number;
}

export interface SoloRoom {
  room: Room;
  playerId: string;
  /** How far the room's clock runs ahead of the page's (capture mode's fast-forward), in ms. */
  clock: { ahead: number };
  /** The room's own clock. */
  now: () => number;
}

export function createSoloRoom(opts: SoloOptions, name: string, capture: CaptureOptions | null, pageNow: () => number = Date.now): SoloRoom {
  const clock = { ahead: 0 };
  const now = () => pageNow() + clock.ahead;
  const rng = capture?.seed != null ? mulberry32(capture.seed) : Math.random;
  const room = new Room(createRoomState("SOLO", now()), { now, rng, cheats: true });
  const { playerId } = room.join({ name });
  const bots = opts.role === "thief" ? Math.max(1, Math.min(3, opts.bots)) : Math.max(1, Math.min(3, opts.bots + 1));
  for (let i = 0; i < bots; i++) room.handle(playerId, { t: "addBot" });
  room.handle(playerId, { t: "settings", patch: { thiefSelection: "host" } });
  const thief = opts.role === "thief" ? playerId : room.state.players[room.state.players.length - 1].id;
  room.handle(playerId, { t: "setThief", playerId: thief });
  if (capture) applyCapture(room, playerId, capture, now, clock);
  return { room, playerId, clock, now };
}

/**
 * Capture mode (dev builds, see capture.ts): bots on every seat, a start without the lobby, and a
 * fast-forward that plays the bots' moves instantly by running the room's clock ahead of the page's.
 */
function applyCapture(room: Room, playerId: string, capture: CaptureOptions, now: () => number, clock: { ahead: number }) {
  if (capture.skill) room.handle(playerId, { t: "settings", patch: { botSkill: capture.skill } });
  // A seat the bots play for its human: the room only offers this for someone who has left.
  const me = room.state.players.find((p) => p.id === playerId);
  if (capture.watch && me) me.botTakeover = true;
  if (capture.as) room.handle(playerId, { t: "debug", cmd: "viewAs", as: capture.as });
  if (capture.start) room.handle(playerId, { t: "debug", cmd: "startNow" });
  if (capture.turn === null && !capture.end) return;

  // turn=n stops as the thief is about to take turn n; end, at the round-over.
  const done = () => {
    const g = room.state.game;
    if (!g || g.phase === "roundOver") return true;
    return capture.turn !== null && g.phase === "play" && g.turn.kind === "thief" && g.thief.turns >= capture.turn - 1;
  };
  for (let guard = 0; guard < 5000 && !done(); guard++) {
    const at = room.nextAlarm();
    if (at === null) break;
    clock.ahead += Math.max(0, at - now());
    room.tick();
  }
}
