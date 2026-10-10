// What a detective's move preview shows: which destination it follows, the route dots to draw, and which
// step counts get a badge. Pure, so the hover and selection rules are testable without the React board.

import type { Board, Cell } from "../../shared/board/model";
import { detectiveRoute } from "../../shared/board/paths";

/** The destination the preview follows: the pointer while it's on a legal end, otherwise the selected one. */
export function previewFocus(ends: Map<Cell, number>, hover: Cell | null, selected: Cell | null): Cell | null {
  return hover !== null && ends.has(hover) ? hover : selected;
}

/** The route dots for the focused destination, or null when there's nothing to walk (no focus, or a 0-step stay). */
export function previewRoute(board: Board, from: Cell, focus: Cell | null, ends: Map<Cell, number>, mayStay: boolean): Cell[] | null {
  if (focus === null || !ends.has(focus)) return null;
  const route = detectiveRoute(board, from, focus, mayStay);
  return route.length ? route : null;
}

/** A step count shows on the pointer's end and on the selected destination, and never for a 0-step stay. */
export function showsCount(cell: Cell, steps: number, hover: Cell | null, selected: Cell | null): boolean {
  return steps > 0 && (cell === hover || cell === selected);
}
