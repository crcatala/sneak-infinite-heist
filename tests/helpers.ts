import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { cellOf, getBoard, type Cell } from "../src/shared/board/model";
import type { GameAction } from "../src/shared/game/actions";
import { DEFAULT_RULES, type HouseRules } from "../src/shared/game/config";
import { apply, beginPlay } from "../src/shared/game/engine";
import { createGame } from "../src/shared/game/setup";
import type { GameState, LockFace } from "../src/shared/game/state";
import { viewFor } from "../src/shared/game/views";

export const board = getBoard(CLASSIC_BOARD);
export const c = (x: number, y: number): Cell => cellOf(board, x, y);

export const THIEF = "thief";
export const D1 = "alice";
export const D2 = "bob";
export const D3 = "cara";

/** Nine legal paintings, one per main room plus extras, all out of the way of the tests below. */
export const DEFAULT_PAINTINGS: [number, number][] = [
  [6, 1], [2, 3], [12, 4], [2, 7], [12, 9], [7, 6], [11, 6], [4, 10], [5, 5],
];
export const DEFAULT_CAMERAS: [number, number][] = [[4, 3], [9, 3], [4, 9], [9, 9], [2, 4], [11, 7]];

export interface Layout {
  paintings?: [number, number][];
  cameras?: [number, number][];
  detectives?: [number, number][];
  controllers?: string[];
  locks?: Record<string, LockFace>;
  rules?: Partial<HouseRules>;
  seed?: number;
}

/** A game in play with a hand-built layout (bypassing setup validation). The thief is to move. */
export function inPlay(layout: Layout = {}): GameState {
  const dets = layout.detectives ?? [[4, 6], [9, 5], [6, 9]];
  const controllers = layout.controllers ?? [D1, D2, D3].slice(0, dets.length);
  const colours = ["red", "blue", "green"] as const;
  const state = createGame({
    board: CLASSIC_BOARD,
    rules: { ...DEFAULT_RULES, ...layout.rules },
    seed: layout.seed ?? 7,
    thief: THIEF,
    detectives: dets.map((_, i) => ({ character: colours[i], controller: controllers[i] })),
  });
  state.paintings = (layout.paintings ?? DEFAULT_PAINTINGS).map(([x, y], i) => ({ id: i, cell: c(x, y), status: "hanging" }));
  state.cameras = (layout.cameras ?? DEFAULT_CAMERAS).map(([x, y], i) => ({ n: i + 1, cell: c(x, y), disabled: false, removed: false }));
  state.detectives.forEach((d, i) => (d.cell = c(dets[i][0], dets[i][1])));
  for (const l of state.locks) l.face = layout.locks?.[l.slot] ?? "locked";
  beginPlay(state);
  return state;
}

/** Applies an action, returning the new state (throws on illegal actions). */
export function act(state: GameState, actor: string, action: GameAction): GameState {
  return apply(state, actor, action).state;
}

/** Applies and returns the events produced. */
export function actEvents(state: GameState, actor: string, action: GameAction) {
  return apply(state, actor, action);
}

export function detView(state: GameState) {
  return viewFor(state, "detectives");
}

/** Plays a detective turn: forced roll, then the given actions. */
export function detectiveTurn(state: GameState, actor: string, roll: { move: number; action: "eye" | "scan" | "motion" }, ...actions: GameAction[]) {
  const s = structuredClone(state);
  s.forcedRoll = roll;
  let next = act(s, actor, { a: "roll" });
  for (const a of actions) next = act(next, actor, a);
  return next;
}

/** Moves the thief one legal step somewhere harmless (for skipping thief turns). */
export function lastEvent(state: GameState) {
  return state.events[state.events.length - 1];
}
