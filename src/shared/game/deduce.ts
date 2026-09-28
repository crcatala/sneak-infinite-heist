// Where could the thief be? Computed from PUBLIC events only (the detectives' view), so it's safe to
// show as an overlay and to drive detective bots. Forward filtering over the event log:
//
//   - each hidden thief move spreads every possible cell 1–3 steps (never onto a detective);
//   - every answer prunes: eyes/cameras "no" remove their sightlines, "yes" keeps only them, a scan
//     does both per camera, motion keeps one floor colour, a detective ending somewhere without an
//     arrest clears that cell;
//   - a painting vanishing, a lock flip or a reveal pins the thief to one cell;
//   - no painting vanishing at the start of a thief turn means they didn't end on a painting.
//
// Weights count how many ways each cell can be reached (normalised), for the heat overlay and bots.

import { canSee } from "../board/los";
import { colourOf, getBoard, type Board, type BoardDef, type Cell } from "../board/model";
import type { GameEvent } from "./state";

export interface Deduction {
  /** The thief has entered the museum. */
  entered: boolean;
  /** Possible cells with normalised weights (sum 1). Empty before entry. */
  weights: Map<Cell, number>;
  /** Exactly one possible cell. */
  pinned: Cell | null;
  /** Thief turns since the possible set was last a single cell (0 = pinned now). */
  sincePinned: number | null;
}

export function deduce(boardDef: BoardDef, events: GameEvent[]): Deduction {
  const board = getBoard(boardDef);
  let w = new Map<Cell, number>();
  let entered = false;
  let sincePinned: number | null = null;
  const dets = new Map<string, Cell>();
  const cameraCell = new Map<number, Cell>();
  const hanging = new Map<number, Cell>();
  let vanishedSinceMove = false;
  let moves = 0;

  const pin = (cell: Cell) => {
    w = new Map([[cell, 1]]);
    sincePinned = 0;
  };
  const keep = (pred: (c: Cell) => boolean) => {
    const next = new Map<Cell, number>();
    for (const [c, v] of w) if (pred(c)) next.set(c, v);
    w = next;
  };

  for (const e of events) {
    switch (e.type) {
      case "playStarted":
        for (const [id, c] of Object.entries(e.detectives)) dets.set(id, c);
        for (const [id, c] of Object.entries(e.paintings)) hanging.set(Number(id), c);
        for (const [n, c] of Object.entries(e.cameras)) cameraCell.set(Number(n), c);
        break;
      case "thiefTurn":
        // A thief who ended on a painting would have had it vanish just now.
        if (moves > 0 && !vanishedSinceMove) {
          const painted = new Set(hanging.values());
          keep((c) => !painted.has(c));
        }
        break;
      case "paintingVanished":
        hanging.delete(e.painting);
        vanishedSinceMove = true;
        if (entered) pin(e.cell);
        break;
      case "paintingStolen":
        hanging.delete(e.painting);
        pin(e.cell);
        break;
      case "thiefMoved": {
        moves++;
        vanishedSinceMove = false;
        if (sincePinned !== null) sincePinned++;
        if (e.path && e.path.length) {
          entered = true;
          pin(e.path[e.path.length - 1]);
          break;
        }
        const sources = entered ? w : new Map(board.slots.map((s) => [s.inside, 1 / board.slots.length]));
        entered = true;
        w = spread(board, sources, new Set(dets.values()));
        break;
      }
      case "detectiveMoved":
        dets.set(e.pawn, e.to);
        w.delete(e.to);
        break;
      case "eye":
        if (!e.seen) keep((c) => !canSee(board, e.from, c));
        break;
      case "thiefRevealed":
        entered = true;
        pin(e.cell);
        break;
      case "camera": {
        const cam = cameraCell.get(e.n);
        if (cam === undefined) break;
        if (e.result === "sees") keep((c) => canSee(board, cam, c));
        if (e.result === "clear") keep((c) => !canSee(board, cam, c));
        break;
      }
      case "scan":
        if (e.result !== "ok") break;
        for (const n of e.checked) {
          const cam = cameraCell.get(n);
          if (cam === undefined) continue;
          const sees = e.seeing.includes(n);
          keep((c) => canSee(board, cam, c) === sees);
        }
        break;
      case "motion":
        if (e.result === "answered" && e.colour) keep((c) => colourOf(board, c) === e.colour);
        break;
      case "lockTried":
        entered = true;
        pin(e.cell);
        break;
    }
    if (entered && w.size === 0) {
      // Shouldn't happen with honest answers; fall back to "anywhere" rather than nothing.
      w = new Map(board.walkable.map((c) => [c, 1]));
    }
  }

  const total = [...w.values()].reduce((a, b) => a + b, 0) || 1;
  const weights = new Map([...w].map(([c, v]) => [c, v / total]));
  return { entered, weights, pinned: weights.size === 1 ? [...weights.keys()][0] : null, sincePinned: weights.size === 1 ? 0 : sincePinned };
}

/** One hidden thief move: every cell 1–3 steps from a possible cell, minus detective cells. */
function spread(board: Board, from: Map<Cell, number>, detectives: Set<Cell>): Map<Cell, number> {
  const out = new Map<Cell, number>();
  for (const [s, v] of from) {
    for (const c of board.reach3[s]) if (!detectives.has(c)) out.set(c, (out.get(c) ?? 0) + v);
  }
  return out;
}
