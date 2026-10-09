// Round-end replay data: for each thief turn, where every detective stood afterwards and the moves
// they made in reply. Pure functions over the (omniscient) round-over GameView, so they're unit
// testable. Entry k is "the thief's turn k, then the detective who answers it before turn k+1".

import type { Cell } from "../../shared/board/model";
import { buildLog, type Ctx, type LogLine } from "./narrate";

export interface DetectiveMove {
  pawn: string;
  from: Cell;
  to: Cell;
  path: Cell[];
}

export interface ReplayRound {
  /** Thief turn this round follows (0 = before the thief entered). */
  turn: number;
  /** The detective move(s) after that thief turn (turns alternate, so normally one). */
  moves: DetectiveMove[];
  /** Every pawn's cell once the round has played out. */
  positions: Record<string, Cell>;
  /** What the detective did and found in reply, as case-note lines (no thief-only lines). */
  lines: LogLine[];
}

/** One entry per thief turn, index 0 being "before entry" (the detectives' starting posts). */
export function buildReplay(ctx: Ctx): ReplayRound[] {
  const { game } = ctx;
  const start: Record<string, Cell> = {};
  for (const e of game.events) if (e.type === "playStarted") Object.assign(start, e.detectives);

  const turns = (game.thief.trail ?? []).length;
  const rounds: ReplayRound[] = Array.from({ length: turns + 1 }, (_, turn) => ({ turn, moves: [], positions: {}, lines: [] }));

  let turn = 0;
  for (const e of game.events) {
    if (e.type === "thiefTurn") turn = e.turn;
    else if (e.type === "detectiveMoved" && rounds[turn]) rounds[turn].moves.push({ pawn: e.pawn, from: e.from, to: e.to, path: e.path });
  }
  for (const l of buildLog(ctx)) if (l.pawn !== null && rounds[l.turn]) rounds[l.turn].lines.push(l);

  const at = { ...start };
  for (const r of rounds) {
    for (const m of r.moves) at[m.pawn] = m.to;
    r.positions = { ...at };
  }
  return rounds;
}

/** The pawns' cells after thief turn `turn` (clamped to the replay). */
export function positionsAt(rounds: ReplayRound[], turn: number): Record<string, Cell> {
  return rounds[Math.max(0, Math.min(turn, rounds.length - 1))]?.positions ?? {};
}

/** Moves of rounds 0..turn, for drawing on the pad: older ones fade, the latest round is bold. */
export function movesUpTo(rounds: ReplayRound[], turn: number): { move: DetectiveMove; latest: boolean }[] {
  return rounds
    .filter((r) => r.turn <= turn)
    .flatMap((r) => r.moves.map((move) => ({ move, latest: r.turn === turn })));
}
