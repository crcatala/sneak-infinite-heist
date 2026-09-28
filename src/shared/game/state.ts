// The full, secret-bearing game state for one round. Only the server (or the in-tab engine in solo
// mode) ever holds this; clients get `viewFor(...)` projections (views.ts).

import type { BoardDef, Cell, FloorColour } from "../board/model";
import type { DetectiveColour } from "../characters";
import type { ActionFace, HouseRules } from "./config";

export type GamePhase = "setupLocks" | "setupPaintings" | "setupCameras" | "setupDetectives" | "play" | "roundOver";
export const SETUP_PHASES: GamePhase[] = ["setupLocks", "setupPaintings", "setupCameras", "setupDetectives"];

export type Team = "thief" | "detectives";
export type LockFace = "open" | "locked";

export interface DetectivePawn {
  /** "d1", "d2", "d3" in turn order. */
  id: string;
  character: DetectiveColour;
  /** Player id controlling this pawn (a human may control two in a 2-seat game). */
  controller: string;
  cell: Cell | null;
}

export interface Painting {
  /** Artwork index 0–8 (see ARTWORKS). */
  id: number;
  cell: Cell;
  /** "pending": stolen while hidden, still on the board until the thief's next turn (secret). */
  status: "hanging" | "pending" | "stolen";
}

export interface Camera {
  /** 1–6, printed on the camera. */
  n: number;
  cell: Cell;
  /** Disabled by the thief (secret until discovered). */
  disabled: boolean;
  /** Found dead and taken off the board (public). */
  removed: boolean;
}

export interface Lock {
  slot: string;
  face: LockFace | null;
  revealed: boolean;
}

/** One thief turn on the plotting pad. */
export interface TrailStep {
  turn: number;
  /** Where the thief started (the entry slot's inside cell on the first turn). */
  from: Cell;
  path: Cell[];
  entry?: string;
  stole?: number;
  disabledCamera?: number;
  cutPower?: boolean;
  triedLock?: { slot: string; face: LockFace };
  /** The thief was already revealed when making this move. */
  public: boolean;
}

export interface ThiefState {
  controller: string;
  cell: Cell | null;
  entry: string | null;
  revealed: boolean;
  trail: TrailStep[];
  /** Paintings taken this round, including a pending one. */
  stolen: number[];
  pending: number | null;
  snipsLeft: number;
  turns: number;
  /** Times any detective or camera answered "yes, I see the thief". */
  sightings: number;
}

export interface Power {
  cut: boolean;
  /** The detectives know the power is out. */
  discovered: boolean;
}

export interface Roll {
  move: number;
  action: ActionFace;
}

export type TurnState =
  | { kind: "setup" }
  | { kind: "thief" }
  | {
      kind: "detective";
      pawn: string;
      roll: Roll | null;
      moved: boolean;
      acted: boolean;
      /** Waiting for the thief to answer or snip the motion detectors. */
      awaitingThief: boolean;
    }
  | { kind: "over" };

/** Where the public last learned the thief's position. */
export interface LastSeen {
  cell: Cell;
  /** Thief turn count when it was true. */
  atThiefTurn: number;
  reason: "painting" | "lock" | "revealed";
}

export type RoundEnd = "escaped" | "captured" | "dawn";

export interface RoundResult {
  winner: Team;
  reason: RoundEnd;
  paintings: number;
  /** Detective pawn that made the arrest. */
  by?: string;
  slot?: string;
  cell?: Cell;
}

export type Visibility = "all" | "thief" | "detectives";

export type GameEventBody =
  | { type: "phase"; phase: GamePhase }
  | { type: "locksShuffled" }
  | { type: "locksPlaced"; faces: Record<string, LockFace> }
  | { type: "playStarted"; detectives: Record<string, Cell>; paintings: Record<number, Cell>; cameras: Record<number, Cell> }
  | { type: "thiefTurn"; turn: number }
  | { type: "paintingVanished"; painting: number; cell: Cell }
  | { type: "thiefMoved"; turn: number; entry?: string; from?: Cell; path?: Cell[] }
  | { type: "paintingStolen"; painting: number; cell: Cell; pending: boolean; onReveal?: boolean }
  | { type: "cameraDisabled"; n: number }
  | { type: "powerCut" }
  | { type: "lockTried"; slot: string; face: LockFace; cell: Cell }
  | { type: "detectiveTurn"; pawn: string }
  | { type: "rolled"; pawn: string; move: number; action: ActionFace }
  | { type: "boxedIn"; pawn: string }
  | { type: "detectiveMoved"; pawn: string; from: Cell; to: Cell; path: Cell[] }
  | { type: "powerRestored"; pawn: string; silent: boolean }
  | { type: "eye"; pawn: string; from: Cell; seen: boolean }
  | { type: "thiefRevealed"; cell: Cell; by: string }
  | { type: "camera"; pawn: string; n: number; result: "sees" | "clear" | "dead" | "powerOut" }
  | { type: "scan"; pawn: string; result: "ok" | "powerOut"; removed: number[]; checked: number[]; seeing: number[] }
  | { type: "powerOutDiscovered"; pawn: string }
  | { type: "motionAsked"; pawn: string }
  | { type: "motion"; pawn: string; result: "answered" | "snipped" | "powerOut"; colour?: FloorColour; snipsLeft: number }
  | { type: "actionSkipped"; pawn: string }
  | { type: "captured"; pawn: string; cell: Cell; wasHidden: boolean }
  | { type: "escaped"; slot: string; cell: Cell; paintings: number }
  | { type: "dawn"; turns: number }
  | { type: "roundOver"; result: RoundResult };

export type GameEvent = GameEventBody & { seq: number; vis: Visibility };

export interface GameState {
  v: 1;
  board: BoardDef;
  rules: HouseRules;
  /** Seeded RNG state (mulberry32 word): dice, lock shuffle, auto-place. */
  rng: number;
  phase: GamePhase;
  thief: ThiefState;
  detectives: DetectivePawn[];
  /** Index into `detectives` of the pawn that plays next. */
  nextDetective: number;
  paintings: Painting[];
  cameras: Camera[];
  locks: Lock[];
  power: Power;
  turn: TurnState;
  lastSeen: LastSeen | null;
  /** Setup "ready" per detective controller for the current setup phase. */
  ready: Record<string, boolean>;
  /** Controllers that count as ready without asking (bots). */
  autoReady: string[];
  /** Team suspect marks (detectives only). */
  marks: Cell[];
  events: GameEvent[];
  seq: number;
  result: RoundResult | null;
  /** Debug: the next roll, if forced. */
  forcedRoll?: Roll;
}

export class GameError extends Error {}
