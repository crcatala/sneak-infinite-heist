// Answers to the detectives' questions (analysis §4.4–4.6). Pure functions of the full state: the
// server is the referee (R17), so the thief can never lie.

import { canSee } from "../board/los";
import { colourOf, getBoard, type Cell, type FloorColour } from "../board/model";
import type { Camera, GameState } from "./state";

/** "Can I see you?" from a detective's cell. */
export function eyeSees(state: GameState, from: Cell): boolean {
  const thief = state.thief.cell;
  return thief !== null && canSee(getBoard(state.board), from, thief);
}

export type CameraAnswer = "sees" | "clear" | "dead" | "powerOut";

/** "Is camera k working? Can it see you?" Power first (a cut hides everything), then the camera. */
export function cameraAnswer(state: GameState, cam: Camera): CameraAnswer {
  if (state.power.cut) return "powerOut";
  if (cam.disabled) return "dead";
  const thief = state.thief.cell;
  return thief !== null && canSee(getBoard(state.board), cam.cell, thief) ? "sees" : "clear";
}

export interface ScanAnswer {
  result: "ok" | "powerOut";
  /** Disabled cameras found and taken off the board. */
  removed: number[];
  /** Working cameras that were asked. */
  checked: number[];
  /** Working cameras that see the thief. */
  seeing: number[];
}

export function scanAnswer(state: GameState): ScanAnswer {
  if (state.power.cut) return { result: "powerOut", removed: [], checked: [], seeing: [] };
  const onBoard = state.cameras.filter((c) => !c.removed);
  const removed = onBoard.filter((c) => c.disabled).map((c) => c.n);
  const working = onBoard.filter((c) => !c.disabled);
  const thief = state.thief.cell;
  const board = getBoard(state.board);
  const seeing = thief === null ? [] : working.filter((c) => canSee(board, c.cell, thief)).map((c) => c.n);
  return { result: "ok", removed, checked: working.map((c) => c.n), seeing };
}

/** The floor colour under the thief (the motion detectors' answer). */
export function motionColour(state: GameState): FloorColour {
  return state.thief.cell === null ? "grey" : colourOf(getBoard(state.board), state.thief.cell);
}
