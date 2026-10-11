// Per-viewer projections of the game (analysis §6). Views are built field by field from a whitelist,
// never by spreading the state, so a new secret field can't leak by accident. Once the round is over
// everyone gets the omniscient view: the full log and the thief's secret path.

import type { BoardDef, Cell } from "../board/model";
import type { HouseRules } from "./config";
import type { DetectivePawn, GameEvent, GamePhase, GameState, LastSeen, LockFace, RoundResult, TrailStep, TurnState } from "./state";

/** `spectator` = the detectives' view minus the team's private notes (suspect marks, lock faces). */
export type Viewer = "thief" | "detectives" | "spectator" | "omniscient";

export interface PaintingView {
  id: number;
  cell: Cell;
  /** Detectives never see "pending": a painting marked by a hidden thief still looks hanging. */
  status: "hanging" | "pending" | "stolen";
}

export interface CameraView {
  n: number;
  cell: Cell;
  /** Only the thief (or everyone after the round) knows which cameras are dead. */
  disabled?: boolean;
}

export interface LockView {
  slot: string;
  revealed: boolean;
  /** Known when flipped, to detectives who placed the locks themselves, or after the round. */
  face?: LockFace;
}

export interface ThiefView {
  controller: string;
  revealed: boolean;
  turns: number;
  snipsLeft: number;
  sightings: number;
  /** Paintings the viewer knows are gone (the thief counts a pending one). */
  haul: number;
  /** The thief's cell: the thief always, everyone once revealed. */
  cell: Cell | null;
  entry?: string | null;
  trail?: TrailStep[];
  stolen?: number[];
  pending?: number | null;
}

export interface GameView {
  viewer: Viewer;
  board: BoardDef;
  rules: HouseRules;
  phase: GamePhase;
  detectives: DetectivePawn[];
  nextDetective: number;
  paintings: PaintingView[];
  cameras: CameraView[];
  locks: LockView[];
  /** `cut` is what the viewer knows: detectives only learn of a cut once it's discovered. */
  power: { cut: boolean; discovered: boolean };
  thief: ThiefView;
  turn: TurnState;
  lastSeen: LastSeen | null;
  ready: Record<string, boolean>;
  autoReady: string[];
  /** Team suspect marks (detectives only). */
  marks: Cell[];
  events: GameEvent[];
  result: RoundResult | null;
}

export function canSeeEvent(viewer: Viewer, e: GameEvent): boolean {
  if (viewer === "omniscient" || e.vis === "all") return true;
  // A spectator watches from the detectives' side of the table, so they see the detectives' public
  // feed (the "thief moved" ticks) but not what the team keeps from the thief (the lock faces).
  if (viewer === "spectator") return e.vis === "detectives" && e.type !== "locksPlaced";
  return e.vis === viewer;
}

export function viewFor(state: GameState, requested: Viewer): GameView {
  // Round over: everything is revealed to everyone.
  const viewer: Viewer = state.phase === "roundOver" ? "omniscient" : requested;
  const secret = viewer === "thief" || viewer === "omniscient";
  const team = viewer === "detectives" || viewer === "omniscient";
  const { thief } = state;

  const thiefView: ThiefView = {
    controller: thief.controller,
    revealed: thief.revealed,
    turns: thief.turns,
    snipsLeft: thief.snipsLeft,
    sightings: thief.sightings,
    haul: secret ? thief.stolen.length : state.paintings.filter((p) => p.status === "stolen").length,
    cell: secret || thief.revealed ? thief.cell : null,
  };
  if (secret) {
    thiefView.entry = thief.entry;
    thiefView.trail = structuredClone(thief.trail);
    thiefView.stolen = thief.stolen.slice();
    thiefView.pending = thief.pending;
  }

  return {
    viewer,
    board: state.board,
    rules: { ...state.rules },
    phase: state.phase,
    detectives: state.detectives.map((d) => ({ id: d.id, character: d.character, controller: d.controller, cell: d.cell })),
    nextDetective: state.nextDetective,
    paintings: state.paintings.map((p) => ({ id: p.id, cell: p.cell, status: !secret && p.status === "pending" ? "hanging" : p.status })),
    cameras: state.cameras
      .filter((c) => !c.removed)
      .map((c) => (secret ? { n: c.n, cell: c.cell, disabled: c.disabled } : { n: c.n, cell: c.cell })),
    locks: state.locks.map((l) => {
      const known = l.revealed || viewer === "omniscient" || (viewer === "detectives" && state.rules.lockPlacement === "detectives");
      return known && l.face ? { slot: l.slot, revealed: l.revealed, face: l.face } : { slot: l.slot, revealed: l.revealed };
    }),
    power: secret ? { ...state.power } : { cut: state.power.cut && state.power.discovered, discovered: state.power.cut && state.power.discovered },
    thief: thiefView,
    turn: structuredClone(state.turn),
    lastSeen: state.lastSeen ? { ...state.lastSeen } : null,
    ready: { ...state.ready },
    autoReady: state.autoReady.slice(),
    marks: team ? state.marks.slice() : [],
    // Shallow copies: nested arrays are shared with the state, so consumers must treat views as
    // read-only (the Durable Object serializes them; solo mode clones the whole view).
    events: state.events.filter((e) => canSeeEvent(viewer, e)).map((e) => ({ ...e })),
    result: state.result ? { ...state.result } : null,
  };
}
