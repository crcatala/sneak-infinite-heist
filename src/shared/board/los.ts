// Line of sight (analysis §4.6): orthogonal rays from the viewer's cell that stop at the first wall.
// Doorways, pawns, paintings and cameras never block. The viewer's own cell is included (a camera sees
// the thief standing on it). Rays are precomputed per cell in `Board.sight`.

import type { Board, Cell } from "./model";

export function sightline(board: Board, from: Cell): Cell[] {
  return board.sight[from] ?? [];
}

export function canSee(board: Board, from: Cell, target: Cell): boolean {
  return board.sight[from]?.includes(target) ?? false;
}

/** Every cell seen by at least one of the viewers. */
export function coverage(board: Board, viewers: Iterable<Cell>): Set<Cell> {
  const out = new Set<Cell>();
  for (const v of viewers) for (const c of board.sight[v] ?? []) out.add(c);
  return out;
}
