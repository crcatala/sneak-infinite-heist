// The "Infinite" in Sneak! Infinite Heist: a seeded board remix generator over the §3 data format.
// Starting from the classic museum it can:
//   - mirror the building east ↔ west,
//   - swap the two small back rooms (storeroom ↔ power room, switch included),
//   - shuffle the five gallery colours,
//   - slide doorways along the walls they connect,
//   - move windows to other outer walls of their gallery.
// Every candidate is checked with validateBoard(); a failed step is retried with the next random draw,
// and if nothing valid turns up the classic board is used. Same seed → same board, so the seed is
// shareable from the lobby.

import { mulberry32, shuffle, type Rng } from "../rng";
import { CLASSIC_BOARD } from "./classic";
import type { BoardDef, FloorColour, Region, XY } from "./model";
import { validateBoard } from "./validate";

export interface RemixOptions {
  mirror?: boolean;
  swapBackRooms?: boolean;
  shuffleColours?: boolean;
  moveDoorways?: boolean;
  moveWindows?: boolean;
}

const ALL: Required<RemixOptions> = { mirror: true, swapBackRooms: true, shuffleColours: true, moveDoorways: true, moveWindows: true };

const GALLERIES: Region[] = ["R", "U", "B", "Y", "G"];
const GALLERY_COLOURS: FloorColour[] = ["red", "purple", "blue", "yellow", "green"];

/** A random-but-valid remix of the classic museum. Deterministic per seed. */
export function remixBoard(seed: number, opts: RemixOptions = ALL): BoardDef {
  const rng = mulberry32(seed ^ 0x5eed);
  let def = clone(CLASSIC_BOARD);
  def.id = `remix-${seed >>> 0}`;
  def.name = `Remix #${(seed >>> 0).toString(36).toUpperCase()}`;

  const step = (f: (d: BoardDef, r: Rng) => BoardDef | null) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const next = f(clone(def), rng);
      if (next && validateBoard({ ...next, id: `${def.id}-check` }).length === 0) {
        def = next;
        return;
      }
    }
  };

  if (opts.mirror && rng() < 0.5) step(mirror);
  if (opts.swapBackRooms && rng() < 0.5) step(swapBackRooms);
  if (opts.shuffleColours) step(shuffleColours);
  if (opts.moveDoorways) for (let i = 0; i < 4; i++) step(moveDoorway);
  if (opts.moveWindows) for (let i = 0; i < 3; i++) step(moveWindow);
  return def;
}

function clone(d: BoardDef): BoardDef {
  return JSON.parse(JSON.stringify(d)) as BoardDef;
}

function at(d: BoardDef, x: number, y: number): string {
  return d.rows[y]?.[x] ?? ".";
}

function setAt(d: BoardDef, x: number, y: number, ch: string) {
  const row = d.rows[y].split("");
  row[x] = ch;
  d.rows[y] = row.join("");
}

function regionAt(d: BoardDef, x: number, y: number): string | null {
  const ch = at(d, x, y);
  if (ch === "P") return "X";
  return "RUBYGWCSX".includes(ch) ? ch : null;
}

/** East ↔ west mirror: rows reversed, every coordinate flipped. */
function mirror(d: BoardDef): BoardDef {
  const w = Math.max(...d.rows.map((r) => r.length));
  const fx = (p: XY): XY => [w - 1 - p[0], p[1]];
  d.rows = d.rows.map((r) => r.padEnd(w, ".").split("").reverse().join(""));
  d.openings = d.openings.map(([a, b]) => [fx(a), fx(b)]);
  d.slots = d.slots.map((s) => ({ ...s, cell: fx(s.cell), inside: fx(s.inside) }));
  return d;
}

/** Swap the storeroom and the power room (both 2×2, either side of the front vestibule). */
function swapBackRooms(d: BoardDef): BoardDef | null {
  const s: XY[] = [];
  const x: XY[] = [];
  d.rows.forEach((row, y) =>
    row.split("").forEach((ch, xx) => {
      if (ch === "S") s.push([xx, y]);
      if (ch === "X" || ch === "P") x.push([xx, y]);
    }),
  );
  if (s.length !== 4 || x.length !== 4) return null;
  const sMinX = Math.min(...s.map((p) => p[0]));
  const xMinX = Math.min(...x.map((p) => p[0]));
  const dx = xMinX - sMinX;
  const pOld = x.find((p) => at(d, p[0], p[1]) === "P")!;
  // P keeps its position mirrored within the room.
  const xMaxX = Math.max(...x.map((p) => p[0]));
  const pNew: XY = [sMinX + (xMaxX - pOld[0]), pOld[1]];
  for (const [px, py] of s) setAt(d, px, py, "X");
  for (const [px, py] of x) setAt(d, px, py, "S");
  setAt(d, pNew[0], pNew[1], "P");
  // Openings into the two rooms move with them.
  d.openings = d.openings.map(([a, b]) => {
    const shift = (p: XY): XY => {
      if (s.some((q) => q[0] === p[0] && q[1] === p[1])) return [p[0] + dx, p[1]];
      if (x.some((q) => q[0] === p[0] && q[1] === p[1])) return [p[0] - dx, p[1]];
      return p;
    };
    const ra = regionAt(d, a[0], a[1]);
    const rb = regionAt(d, b[0], b[1]);
    const touches = (r: string | null) => r === "S" || r === "X";
    if (!touches(ra) && !touches(rb)) return [a, b];
    // Recompute: keep the corridor side, move the room side horizontally by the same column offset.
    const room = touches(ra) ? a : b;
    const other = room === a ? b : a;
    const movedRoom = shift(room);
    const movedOther: XY = [other[0] + (movedRoom[0] - room[0]), other[1]];
    return room === a ? [movedRoom, movedOther] : [movedOther, movedRoom];
  });
  return d;
}

function shuffleColours(d: BoardDef, rng: Rng): BoardDef {
  const colours = shuffle(GALLERY_COLOURS, rng);
  d.colours = Object.fromEntries(GALLERIES.map((r, i) => [r, colours[i]])) as BoardDef["colours"];
  return d;
}

/** Slides one doorway to another edge shared by the same two regions. */
function moveDoorway(d: BoardDef, rng: Rng): BoardDef | null {
  const i = Math.floor(rng() * d.openings.length);
  const [a, b] = d.openings[i];
  const ra = regionAt(d, a[0], a[1]);
  const rb = regionAt(d, b[0], b[1]);
  if (!ra || !rb) return null;
  const key = (p: XY, q: XY) => [p, q].map((c) => c.join(",")).sort().join("|");
  const taken = new Set(d.openings.map(([p, q]) => key(p, q)));
  const candidates: [XY, XY][] = [];
  d.rows.forEach((row, y) =>
    row.split("").forEach((_, x) => {
      if (regionAt(d, x, y) !== ra) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q: XY = [x + dx, y + dy];
        if (regionAt(d, q[0], q[1]) === rb && !taken.has(key([x, y], q))) candidates.push([[x, y], q]);
      }
    }),
  );
  if (!candidates.length) return null;
  d.openings[i] = candidates[Math.floor(rng() * candidates.length)];
  return d;
}

/** Moves one window to another outer wall of its gallery. */
function moveWindow(d: BoardDef, rng: Rng): BoardDef | null {
  const windows = d.slots.filter((s) => s.kind === "window");
  const slot = windows[Math.floor(rng() * windows.length)];
  const room = regionAt(d, slot.inside[0], slot.inside[1]);
  if (!room) return null;
  const insides = new Set(d.slots.map((s) => s.inside.join(",")));
  const slotCells = new Set(d.slots.map((s) => s.cell.join(",")));
  const candidates: { cell: XY; inside: XY }[] = [];
  d.rows.forEach((row, y) =>
    row.split("").forEach((_, x) => {
      if (regionAt(d, x, y) !== room || insides.has(`${x},${y}`)) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c: XY = [x + dx, y + dy];
        if (c[0] < 0 || c[1] < 0 || c[1] >= d.rows.length || c[0] >= d.rows[0].length) continue;
        if (at(d, c[0], c[1]) !== "." || slotCells.has(c.join(","))) continue;
        candidates.push({ cell: c, inside: [x, y] });
      }
    }),
  );
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  setAt(d, slot.cell[0], slot.cell[1], ".");
  setAt(d, pick.cell[0], pick.cell[1], slot.id);
  slot.cell = pick.cell;
  slot.inside = pick.inside;
  return d;
}
