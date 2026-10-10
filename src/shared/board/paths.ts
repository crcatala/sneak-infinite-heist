// Movement rules as pure functions over a Board.
//
// Thief (analysis §4.3): 1–3 orthogonal steps through openings, never visiting a cell twice in one
// turn (including the start, so they must end somewhere new), passing through anything, never ending
// on a detective. Any cell at distance 1–3 is reachable by a simple path of that length (its shortest
// path), and nothing farther is, so the legal ends are exactly those cells.
//
// Detective (§4.4, R5): up to N steps with backtracking, passing through anything, never ending on a
// painting or another detective. Legal ends are the cells at distance 1..N, plus the start cell when
// N ≥ 2 (step out and back) or when the zero-move house rule is on.

import { distance, type Board, type Cell } from "./model";

export const THIEF_MAX_STEPS = 3;

/** Cells at step distance 1..max from `start`. */
function within(board: Board, start: Cell, max: number): Cell[] {
  const out: Cell[] = [];
  for (const c of board.walkable) {
    const d = distance(board, start, c);
    if (d >= 1 && d <= max) out.push(c);
  }
  return out;
}

/** Where the thief may end a move from `start`, each with one shortest path (excluding the start). */
export function thiefDestinations(board: Board, start: Cell, detectives: Iterable<Cell>): Map<Cell, Cell[]> {
  const blocked = new Set(detectives);
  const out = new Map<Cell, Cell[]>();
  for (const c of board.reach3[start] ?? []) if (!blocked.has(c)) out.set(c, shortestPath(board, start, c));
  return out;
}

/** Why a thief path is illegal, or null when it's fine. `path` excludes the start cell. */
export function thiefPathProblem(board: Board, start: Cell, path: Cell[], detectives: Iterable<Cell>): string | null {
  if (path.length < 1 || path.length > THIEF_MAX_STEPS) return "The thief moves 1, 2 or 3 spaces.";
  const seen = new Set([start]);
  let cur = start;
  for (const next of path) {
    if (!board.neighbours[cur]?.includes(next)) return "That path goes through a wall.";
    if (seen.has(next)) return "The thief can't visit a space twice in one turn.";
    seen.add(next);
    cur = next;
  }
  if (new Set(detectives).has(cur)) return "The thief can't end on a detective.";
  return null;
}

/** Every simple path of length 1..3 from `start` (for showing route options). */
export function thiefSimplePaths(board: Board, start: Cell): Cell[][] {
  const out: Cell[][] = [];
  const walk = (path: Cell[], seen: Set<Cell>) => {
    const cur = path.length ? path[path.length - 1] : start;
    for (const n of board.neighbours[cur]) {
      if (seen.has(n)) continue;
      const next = [...path, n];
      out.push(next);
      if (next.length < THIEF_MAX_STEPS) {
        seen.add(n);
        walk(next, seen);
        seen.delete(n);
      }
    }
  };
  walk([], new Set([start]));
  return out;
}

/** Legal detective ends with their step counts (the start cell, when allowed, counts as 0). */
export function detectiveDestinations(board: Board, start: Cell, steps: number, blocked: Iterable<Cell>, mayStay: boolean): Map<Cell, number> {
  const no = new Set(blocked);
  const out = new Map<Cell, number>();
  if (mayStay || (steps >= 2 && board.neighbours[start].length > 0)) out.set(start, 0);
  for (const c of within(board, start, steps)) if (!no.has(c)) out.set(c, distance(board, start, c));
  return out;
}

/**
 * The route a detective walks to `dest`, as the engine records it and the board animates: an out-and-back through a
 * neighbour when the pawn ends where it started and the rules forbid staying put, otherwise a shortest path.
 */
export function detectiveRoute(board: Board, from: Cell, dest: Cell, mayStay: boolean): Cell[] {
  if (dest === from && !mayStay) return [board.neighbours[from][0], from];
  return shortestPath(board, from, dest);
}

/** A shortest path from `from` to `to`, excluding `from` (empty when equal or unreachable). */
export function shortestPath(board: Board, from: Cell, to: Cell): Cell[] {
  if (from === to || distance(board, from, to) < 0) return [];
  const path: Cell[] = [];
  let cur = from;
  while (cur !== to) {
    const d = distance(board, cur, to);
    cur = board.neighbours[cur].find((n) => distance(board, n, to) === d - 1)!;
    path.push(cur);
  }
  return path;
}
