// Board invariants. Every board the game uses (the classic one and every remix) must pass these, so
// the rules engine can rely on them.

import { MAIN_ROOMS, parseBoard, xyOf, type Board, type BoardDef } from "./model";

export const PAINTING_COUNT = 9;
export const CAMERA_COUNT = 6;

/** Problems with a board definition (empty when it's valid). */
export function validateBoard(def: BoardDef): string[] {
  const problems: string[] = [];
  let board: Board;
  try {
    board = parseBoard(def);
  } catch (err) {
    return [`Could not parse board: ${err instanceof Error ? err.message : String(err)}`];
  }
  const fmt = (c: number) => `[${xyOf(board, c).join(",")}]`;

  if (board.walkable.length === 0) return ["The board has no walkable cells."];

  // Exactly one power switch.
  const powers = def.rows.join("").split("").filter((ch) => ch === "P").length;
  if (powers !== 1) problems.push(`Expected exactly one power switch P, found ${powers}.`);

  // Connected: every walkable cell reachable from the first.
  const first = board.walkable[0];
  const unreachable = board.walkable.filter((c) => board.dist[first * board.size + c] < 0);
  if (unreachable.length) problems.push(`Unreachable cells: ${unreachable.map(fmt).join(" ")}.`);

  // Openings join two orthogonally adjacent walkable cells in different regions.
  for (const [a, b] of def.openings) {
    const ca = a[1] * board.width + a[0];
    const cb = b[1] * board.width + b[0];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) problems.push(`Opening ${fmt(ca)}–${fmt(cb)} isn't between neighbours.`);
    else if (!board.region[ca] || !board.region[cb]) problems.push(`Opening ${fmt(ca)}–${fmt(cb)} touches a non-walkable cell.`);
    else if (board.region[ca] === board.region[cb]) problems.push(`Opening ${fmt(ca)}–${fmt(cb)} is inside one region.`);
  }

  // Slots: a non-walkable slot cell with one walkable inside cell next to it (the only entry edge;
  // door plinths may touch other cells through walls), and no inside cell shared by two slots, so
  // trying a lock pins the thief to one cell.
  const ids = new Set<string>();
  const insides = new Map<number, string>();
  for (const s of board.slots) {
    if (ids.has(s.id)) problems.push(`Duplicate slot id ${s.id}.`);
    ids.add(s.id);
    const ch = def.rows[Math.floor(s.cell / board.width)]?.[s.cell % board.width];
    if (board.region[s.cell]) problems.push(`Slot ${s.id} sits on a walkable cell.`);
    if (ch !== s.id) problems.push(`Slot ${s.id} isn't marked '${s.id}' on the map.`);
    if (!board.region[s.inside]) problems.push(`Slot ${s.id}'s inside cell isn't walkable.`);
    const [sx, sy] = xyOf(board, s.cell);
    const [ix, iy] = xyOf(board, s.inside);
    if (Math.abs(sx - ix) + Math.abs(sy - iy) !== 1) problems.push(`Slot ${s.id} isn't next to its inside cell.`);
    if (insides.has(s.inside)) problems.push(`Slots ${insides.get(s.inside)} and ${s.id} share an inside cell.`);
    insides.set(s.inside, s.id);
  }
  if (board.slots.length !== 11) problems.push(`Expected 11 lock slots, found ${board.slots.length}.`);

  // Paintings: every main room has somewhere legal, and there are enough legal cells overall.
  for (const r of MAIN_ROOMS) {
    if (board.rooms[r].length === 0) problems.push(`Main room ${r} is missing.`);
    else if (!board.rooms[r].some((c) => board.paintingProblem[c] === null)) problems.push(`Main room ${r} has no legal painting cell.`);
  }
  const paintable = board.walkable.filter((c) => board.paintingProblem[c] === null).length;
  if (paintable < PAINTING_COUNT) problems.push(`Only ${paintable} legal painting cells (need ${PAINTING_COUNT}).`);
  if (board.walkable.length - 1 < PAINTING_COUNT + CAMERA_COUNT) problems.push("Not enough room for paintings and cameras.");

  return problems;
}
