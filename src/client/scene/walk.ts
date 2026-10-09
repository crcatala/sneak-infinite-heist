// Decides how a Mover gets from where it stands to a new cell: walk a route, snap, or stay put. Pure
// (no three.js or React), so the replay's scrubbing rules can be unit tested.

import type { Cell } from "../../shared/board/model";

/**
 * A replay's explicit say on how to arrive. `undefined` (the live game) trusts the supplied path;
 * `null` means "don't walk, just be there" (scrubbing, jumping, going back); an object is one real
 * move, to be walked only if the piece is standing at its start.
 */
export type Walk = { from: Cell; path: Cell[] } | null | undefined;

export type WalkPlan = { kind: "stay" } | { kind: "snap" } | { kind: "walk"; cells: Cell[] };

/**
 * `at` is where the piece stands, `path` the route the live game supplied, `again` whether a replay
 * step just fired (so a move that ends where it began, an out-and-back, still plays).
 */
export function planWalk(at: Cell | null, cell: Cell, path: Cell[] | null | undefined, walk: Walk, again = false): WalkPlan {
  if (at === null) return { kind: "snap" };
  if (walk === undefined) {
    if (at === cell) return { kind: "stay" };
    return { kind: "walk", cells: path && path.length && path[path.length - 1] === cell ? path : [cell] };
  }
  const real = walk !== null && walk.path.length > 0 && walk.path[walk.path.length - 1] === cell && at === walk.from;
  if (real && (at !== cell || again)) return { kind: "walk", cells: walk.path };
  return at === cell ? { kind: "stay" } : { kind: "snap" };
}
