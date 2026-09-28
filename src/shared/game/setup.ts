// Round creation and the setup phases (analysis §4.1): lock shuffle, painting/camera/detective
// placement with human-readable reasons, and random-but-legal auto-place.

import { getBoard, regionName, type Board, type BoardDef, type Cell } from "../board/model";
import type { DetectiveColour } from "../characters";
import { shuffle, stateRng, type Rng } from "../rng";
import { CAMERAS, LOCKED_LOCKS, OPEN_LOCKS, PAINTINGS, SNIPS, type HouseRules } from "./config";
import type { GamePhase, GameState, LockFace } from "./state";

export interface NewGameOptions {
  board: BoardDef;
  rules: HouseRules;
  seed: number;
  thief: string;
  /** Detective pawns in turn order. */
  detectives: { character: DetectiveColour; controller: string }[];
  /** Controllers that never need to press "ready" (bots). */
  autoReady?: string[];
}

export function createGame(opts: NewGameOptions): GameState {
  const board = getBoard(opts.board);
  const state: GameState = {
    v: 1,
    board: opts.board,
    rules: { ...opts.rules },
    rng: opts.seed >>> 0,
    phase: opts.rules.lockPlacement === "detectives" ? "setupLocks" : "setupPaintings",
    thief: {
      controller: opts.thief,
      cell: null,
      entry: null,
      revealed: false,
      trail: [],
      stolen: [],
      pending: null,
      snipsLeft: SNIPS,
      turns: 0,
      sightings: 0,
    },
    detectives: opts.detectives.map((d, i) => ({ id: `d${i + 1}`, character: d.character, controller: d.controller, cell: null })),
    nextDetective: 0,
    paintings: [],
    cameras: [],
    locks: board.slots.map((s) => ({ slot: s.id, face: null, revealed: false })),
    power: { cut: false, discovered: false },
    turn: { kind: "setup" },
    lastSeen: null,
    ready: {},
    autoReady: opts.autoReady ?? [],
    marks: [],
    events: [],
    seq: 0,
    result: null,
  };
  if (state.phase === "setupPaintings") shuffleLocks(state, stateRng(state));
  return state;
}

/** Random placement: 6 Open + 5 Locked, face down (R7 default). */
export function shuffleLocks(state: GameState, rng: Rng) {
  const faces = randomLockFaces(state.locks.length, rng);
  state.locks.forEach((l, i) => (l.face = faces[i]));
}

export function randomLockFaces(n: number, rng: Rng): LockFace[] {
  const open = Math.round((n * OPEN_LOCKS) / (OPEN_LOCKS + LOCKED_LOCKS));
  return shuffle([...Array<LockFace>(open).fill("open"), ...Array<LockFace>(n - open).fill("locked")], rng);
}

// --- placement rules ----------------------------------------------------------------------------

export interface Occupancy {
  paintings: Cell[];
  cameras: Cell[];
  detectives: Cell[];
}

export type PieceKind = "painting" | "camera" | "detective";

/** Why a piece can't go on `cell`, or null. `moving` is the piece's current cell when moving it. */
export function placementProblem(board: Board, kind: PieceKind, cell: Cell, occ: Occupancy, moving?: Cell): string | null {
  if (cell < 0 || cell >= board.size || !board.region[cell]) return "That's outside the museum.";
  const others = (cells: Cell[]) => cells.filter((c) => c !== moving);
  if (kind === "painting") {
    if (board.paintingProblem[cell]) return board.paintingProblem[cell];
    if (others(occ.paintings).includes(cell)) return "There's already a painting there.";
    if (moving === undefined && occ.paintings.length >= PAINTINGS) return `All ${PAINTINGS} paintings are already out.`;
    return null;
  }
  if (kind === "camera") {
    if (cell === board.power) return "Cameras can't go on the power switch.";
    if (occ.paintings.includes(cell)) return "Cameras can't share a space with a painting.";
    if (others(occ.cameras).includes(cell)) return "There's already a camera there.";
    if (moving === undefined && occ.cameras.length >= CAMERAS) return `All ${CAMERAS} cameras are already out.`;
    return null;
  }
  if (occ.paintings.includes(cell)) return "Detectives can't stand on a painting.";
  if (others(occ.detectives).includes(cell)) return "Another detective is already there.";
  return null;
}

export function occupancy(state: GameState): Occupancy {
  return {
    paintings: state.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell),
    cameras: state.cameras.filter((c) => !c.removed).map((c) => c.cell),
    detectives: state.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell])),
  };
}

/** The parts of a state (or a detective's view of it) that setup validation looks at. */
export interface SetupLike {
  board: BoardDef;
  phase: GamePhase;
  locks: { face?: LockFace | null }[];
  paintings: { cell: Cell }[];
  cameras: unknown[];
  detectives: { cell: Cell | null }[];
}

/** What still blocks the current setup phase from finishing, or null when it's complete. */
export function setupProblem(state: SetupLike): string | null {
  const board = getBoard(state.board);
  switch (state.phase) {
    case "setupLocks": {
      const open = state.locks.filter((l) => l.face === "open").length;
      const locked = state.locks.filter((l) => l.face === "locked").length;
      const [wantOpen, wantLocked] = lockSplit(state.locks.length);
      if (open + locked < state.locks.length) return `Set every lock (${state.locks.length - open - locked} left).`;
      if (open !== wantOpen || locked !== wantLocked) return `Use exactly ${wantOpen} open and ${wantLocked} locked locks.`;
      return null;
    }
    case "setupPaintings":
      return paintingSetupProblem(board, state.paintings.map((p) => p.cell));
    case "setupCameras": {
      const left = CAMERAS - state.cameras.length;
      return left > 0 ? `Place ${left} more camera${left === 1 ? "" : "s"}.` : null;
    }
    case "setupDetectives": {
      const left = state.detectives.filter((d) => d.cell === null).length;
      return left > 0 ? `Place ${left} more detective${left === 1 ? "" : "s"}.` : null;
    }
    default:
      return null;
  }
}

export function lockSplit(n: number): [number, number] {
  const open = Math.round((n * OPEN_LOCKS) / (OPEN_LOCKS + LOCKED_LOCKS));
  return [open, n - open];
}

export function paintingSetupProblem(board: Board, cells: Cell[]): string | null {
  const left = PAINTINGS - cells.length;
  if (left > 0) return `Place ${left} more painting${left === 1 ? "" : "s"}.`;
  for (const r of board.mainRooms) {
    if (!cells.some((c) => board.region[c] === r)) return `The ${regionName(board, r)} needs at least one painting.`;
  }
  return null;
}

// --- auto-place -------------------------------------------------------------------------------

function freeArt(state: GameState): number {
  const used = new Set(state.paintings.map((p) => p.id));
  for (let i = 0; i < PAINTINGS; i++) if (!used.has(i)) return i;
  return -1;
}

export function addPainting(state: GameState, cell: Cell) {
  state.paintings.push({ id: freeArt(state), cell, status: "hanging" });
}

export function addCamera(state: GameState, cell: Cell) {
  const used = new Set(state.cameras.map((c) => c.n));
  let n = 1;
  while (used.has(n)) n++;
  state.cameras.push({ n, cell, disabled: false, removed: false });
  state.cameras.sort((a, b) => a.n - b.n);
}

/** Completes the current setup phase randomly and legally, keeping what's already placed if it can. */
export function autoPlace(state: GameState, rng: Rng) {
  const board = getBoard(state.board);
  switch (state.phase) {
    case "setupLocks": {
      const faces = randomLockFaces(state.locks.length, rng);
      state.locks.forEach((l, i) => (l.face = faces[i]));
      return;
    }
    case "setupPaintings": {
      const hasPainting = (r: string) => state.paintings.some((p) => board.region[p.cell] === r);
      let missing = board.mainRooms.filter((r) => !hasPainting(r));
      // Not enough paintings left to cover every room: take some back from doubled-up rooms.
      while (missing.length > PAINTINGS - state.paintings.length) {
        const spare = shuffle(state.paintings, rng).find((p) => {
          const r = board.region[p.cell]!;
          return !board.mainRooms.includes(r) || state.paintings.filter((q) => board.region[q.cell] === r).length > 1;
        });
        if (!spare) break;
        state.paintings = state.paintings.filter((p) => p !== spare);
      }
      missing = board.mainRooms.filter((r) => !hasPainting(r));
      const free = (cells: Cell[]) => cells.filter((c) => placementProblem(board, "painting", c, occupancy(state)) === null);
      for (const r of missing) {
        const options = free(board.rooms[r]);
        if (options.length) addPainting(state, shuffle(options, rng)[0]);
      }
      while (state.paintings.length < PAINTINGS) {
        const options = free(board.walkable);
        if (!options.length) break;
        addPainting(state, shuffle(options, rng)[0]);
      }
      return;
    }
    case "setupCameras": {
      while (state.cameras.length < CAMERAS) {
        const options = board.walkable.filter((c) => placementProblem(board, "camera", c, occupancy(state)) === null);
        if (!options.length) break;
        addCamera(state, shuffle(options, rng)[0]);
      }
      return;
    }
    case "setupDetectives": {
      for (const d of state.detectives) {
        if (d.cell !== null) continue;
        const options = board.walkable.filter((c) => placementProblem(board, "detective", c, occupancy(state)) === null);
        d.cell = shuffle(options, rng)[0];
      }
      return;
    }
  }
}

/** Removes everything placed in the current setup phase. */
export function clearPhase(state: GameState) {
  if (state.phase === "setupLocks") state.locks.forEach((l) => (l.face = null));
  if (state.phase === "setupPaintings") state.paintings = [];
  if (state.phase === "setupCameras") state.cameras = [];
  if (state.phase === "setupDetectives") state.detectives.forEach((d) => (d.cell = null));
}

export function nextSetupPhase(phase: GamePhase): GamePhase {
  const order: GamePhase[] = ["setupLocks", "setupPaintings", "setupCameras", "setupDetectives", "play"];
  return order[order.indexOf(phase) + 1] ?? "play";
}
