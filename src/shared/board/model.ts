// Parses a BoardDef (rows + openings + slots) into a Board with everything the rules need
// precomputed: regions, movement adjacency, walls, sightlines, all-pairs distances and the
// painting rules. Cells are integers `y * width + x` everywhere.

export type Cell = number;
export type XY = [number, number];

/** Region codes. `P` (the power switch) is part of region `X`. */
export type Region = "R" | "U" | "B" | "Y" | "G" | "W" | "C" | "S" | "X";
export type FloorColour = "red" | "purple" | "blue" | "yellow" | "green" | "white" | "grey";
export type SlotKind = "window" | "door";
export type Dir = "n" | "e" | "s" | "w";

export interface SlotDef {
  id: string;
  cell: XY;
  kind: SlotKind;
  inside: XY;
}

export interface BoardDef {
  id: string;
  name: string;
  rows: string[];
  openings: [XY, XY][];
  slots: SlotDef[];
  /** Floor colour per region, when a remix shuffles the galleries. Defaults to DEFAULT_COLOURS. */
  colours?: Partial<Record<Region, FloorColour>>;
}

export interface Slot {
  id: string;
  cell: Cell;
  kind: SlotKind;
  inside: Cell;
  /** Direction from the inside cell to the slot (the wall the window/door is in). */
  side: Dir;
}

export const REGIONS: Region[] = ["R", "U", "B", "Y", "G", "W", "C", "S", "X"];
/** The rooms that must each hold at least one painting. */
export const MAIN_ROOMS: Region[] = ["R", "U", "B", "Y", "G", "W"];
/** Rooms that may hold paintings at all (main rooms plus the small grey storeroom, R10). */
export const PAINTING_ROOMS: Region[] = ["R", "U", "B", "Y", "G", "W", "S"];

export const DEFAULT_COLOURS: Record<Region, FloorColour> = {
  R: "red",
  U: "purple",
  B: "blue",
  Y: "yellow",
  G: "green",
  W: "white",
  C: "grey",
  S: "grey",
  X: "grey",
};

export const COLOUR_LABEL: Record<FloorColour, string> = {
  red: "Red",
  purple: "Purple",
  blue: "Blue",
  yellow: "Gold",
  green: "Green",
  white: "White",
  grey: "Grey",
};

export interface Board {
  def: BoardDef;
  width: number;
  height: number;
  size: number;
  /** Region per cell index, null when the cell isn't walkable (outside, slot plinths). */
  region: (Region | null)[];
  walkable: Cell[];
  power: Cell;
  /** Cells one orthogonal step away with no wall in between. */
  neighbours: Cell[][];
  /** Every cell each cell can see (orthogonal rays stopping at walls), including itself. */
  sight: Cell[][];
  /** Step distance between walkable cells (-1 when unreachable or not walkable). */
  dist: Int16Array;
  /** Cells 1–3 steps away (a thief move), per cell. */
  reach3: Cell[][];
  slots: Slot[];
  slotById: Record<string, Slot>;
  slotByInside: Map<Cell, Slot>;
  colours: Record<Region, FloorColour>;
  /** Cells per region. */
  rooms: Record<Region, Cell[]>;
  /** Main rooms present on this board. */
  mainRooms: Region[];
  /** Why a painting can't go on each cell, or null when it can. */
  paintingProblem: (string | null)[];
}

const DIRS: [Dir, number, number][] = [
  ["n", 0, -1],
  ["e", 1, 0],
  ["s", 0, 1],
  ["w", -1, 0],
];

export function cellOf(board: { width: number }, x: number, y: number): Cell {
  return y * board.width + x;
}

export function xyOf(board: { width: number }, c: Cell): XY {
  return [c % board.width, Math.floor(c / board.width)];
}

export function regionName(board: Board, region: Region): string {
  if (region === "C") return "Corridor";
  if (region === "S") return "Storeroom";
  if (region === "X") return "Power Room";
  const colour = board.colours[region];
  return region === "W" ? `${COLOUR_LABEL[colour]} Atrium` : `${COLOUR_LABEL[colour]} Gallery`;
}

export function colourOf(board: Board, c: Cell): FloorColour {
  const r = board.region[c];
  return r ? board.colours[r] : "grey";
}

/** True when a and b are orthogonal neighbours with no wall between them. */
export function isOpen(board: Board, a: Cell, b: Cell): boolean {
  return board.neighbours[a]?.includes(b) ?? false;
}

/** True when a and b are orthogonal neighbours separated by a wall (or a is inside and b isn't). */
export function wall(board: Board, a: Cell, b: Cell): boolean {
  const [ax, ay] = xyOf(board, a);
  const [bx, by] = xyOf(board, b);
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
  return !isOpen(board, a, b);
}

export function distance(board: Board, a: Cell, b: Cell): number {
  return board.dist[a * board.size + b];
}

const cache = new Map<string, Board>();

/** Parses (and caches, by board id) a board definition. */
export function getBoard(def: BoardDef): Board {
  let board = cache.get(def.id);
  if (!board) {
    board = parseBoard(def);
    // Remixes make ids unbounded: keep the cache small (oldest out first; classic re-parses cheaply).
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(def.id, board);
  }
  return board;
}

export function parseBoard(def: BoardDef): Board {
  const height = def.rows.length;
  const width = Math.max(...def.rows.map((r) => r.length));
  const size = width * height;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? "." : (def.rows[y][x] ?? "."));

  const region: (Region | null)[] = new Array(size).fill(null);
  let power = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      const c = y * width + x;
      if (ch === "P") {
        region[c] = "X";
        power = c;
      } else if ((REGIONS as string[]).includes(ch)) region[c] = ch as Region;
    }
  }
  const walkable = region.flatMap((r, c) => (r ? [c] : []));

  const openingKeys = new Set<string>();
  const key = (a: Cell, b: Cell) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const [[ax, ay], [bx, by]] of def.openings) openingKeys.add(key(ay * width + ax, by * width + bx));

  const neighbours: Cell[][] = Array.from({ length: size }, () => []);
  for (const c of walkable) {
    const x = c % width;
    const y = Math.floor(c / width);
    for (const [, dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!region[n]) continue;
      if (region[n] === region[c] || openingKeys.has(key(c, n))) neighbours[c].push(n);
    }
  }

  const sight: Cell[][] = Array.from({ length: size }, () => []);
  for (const c of walkable) {
    const seen = [c];
    for (const [, dx, dy] of DIRS) {
      let cur = c;
      for (;;) {
        const x = (cur % width) + dx;
        const y = Math.floor(cur / width) + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) break;
        const next = y * width + x;
        if (!neighbours[cur].includes(next)) break;
        seen.push(next);
        cur = next;
      }
    }
    sight[c] = seen;
  }

  const dist = new Int16Array(size * size).fill(-1);
  for (const start of walkable) {
    const base = start * size;
    dist[base + start] = 0;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      for (const n of neighbours[cur]) {
        if (dist[base + n] !== -1) continue;
        dist[base + n] = dist[base + cur] + 1;
        queue.push(n);
      }
    }
  }

  const reach3: Cell[][] = Array.from({ length: size }, () => []);
  for (const a of walkable) {
    for (const b of walkable) {
      const d = dist[a * size + b];
      if (d >= 1 && d <= 3) reach3[a].push(b);
    }
  }

  const slots: Slot[] = def.slots.map((s) => {
    const cell = s.cell[1] * width + s.cell[0];
    const inside = s.inside[1] * width + s.inside[0];
    const dx = s.cell[0] - s.inside[0];
    const dy = s.cell[1] - s.inside[1];
    const side: Dir = dy < 0 ? "n" : dy > 0 ? "s" : dx > 0 ? "e" : "w";
    return { id: s.id, cell, kind: s.kind, inside, side };
  });
  const slotById = Object.fromEntries(slots.map((s) => [s.id, s]));
  const slotByInside = new Map(slots.map((s) => [s.inside, s]));

  const colours = { ...DEFAULT_COLOURS, ...def.colours };
  const rooms = Object.fromEntries(REGIONS.map((r) => [r, walkable.filter((c) => region[c] === r)])) as Record<Region, Cell[]>;
  const mainRooms = MAIN_ROOMS.filter((r) => rooms[r].length > 0);

  // R9: "in front of a window or doorway" = a window's inside cell, plus the room-side cell of every
  // doorway between regions.
  const doorwaySides = new Set<Cell>();
  for (const [[ax, ay], [bx, by]] of def.openings) {
    for (const c of [ay * width + ax, by * width + bx]) if (region[c] && PAINTING_ROOMS.includes(region[c]!)) doorwaySides.add(c);
  }
  const windowInsides = new Set(slots.map((s) => s.inside));

  const paintingProblem: (string | null)[] = new Array(size).fill(null);
  for (let c = 0; c < size; c++) {
    const r = region[c];
    if (!r) paintingProblem[c] = "That's outside the museum.";
    else if (r === "C") paintingProblem[c] = "Paintings can't go in corridors.";
    else if (r === "X") paintingProblem[c] = "Paintings can't go in the Power Room.";
    else if (windowInsides.has(c)) paintingProblem[c] = slots.find((s) => s.inside === c)!.kind === "window" ? "Paintings can't block a window." : "Paintings can't block a door.";
    else if (doorwaySides.has(c)) paintingProblem[c] = "Paintings can't block a doorway.";
  }

  return {
    def,
    width,
    height,
    size,
    region,
    walkable,
    power,
    neighbours,
    sight,
    dist,
    reach3,
    slots,
    slotById,
    slotByInside,
    colours,
    rooms,
    mainRooms,
    paintingProblem,
  };
}
