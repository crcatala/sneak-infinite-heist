// Local, per-tab game UI state: what's hovered and selected, the thief's plan for this turn, previews,
// camera preset, overlays and open panels. Nothing here is sent to the server until confirmed.

import { create } from "zustand";
import type { Cell } from "../../shared/board/model";
import { usePrefs } from "../prefs";

export type CameraPreset = "overview" | "top" | "focus";

export interface ThiefPlan {
  entry: string | null;
  dest: Cell | null;
  path: Cell[] | null;
  disableCamera: boolean;
  cutPower: boolean;
  tryLock: boolean;
}

export const EMPTY_PLAN: ThiefPlan = { entry: null, dest: null, path: null, disableCamera: false, cutPower: false, tryLock: false };

export interface GameUi {
  hover: Cell | null;
  /** Hovered lock slot (plinth), for entry previews. */
  hoverSlot: string | null;
  /** Setup: a piece picked up to move (its current cell), or a pawn id to place. */
  held: { kind: "piece"; from: Cell } | { kind: "pawn"; pawn: string } | null;
  plan: ThiefPlan;
  /** Detective: a chosen destination awaiting confirmation. */
  moveDest: Cell | null;
  /** Detective: action being previewed ("self" or a camera number). */
  eyePreview: "self" | number | null;
  /** Detective: the Eye target picked (step 1), waiting for Confirm or Cancel (step 2). */
  eyeTarget: "self" | number | null;
  camera: CameraPreset;
  /** Bumps to re-apply the current camera preset. */
  cameraNonce: number;
  /** Bumps when the HUD's layout settles somewhere new, so the camera re-fits the board into the free space. */
  hudNonce: number;
  danger: boolean;
  heat: boolean;
  padOpen: boolean;
  logOpen: boolean;
  paused: boolean;
  /** Keyboard board cursor. */
  cursor: Cell | null;
  /** Round-end replay: show the thief's path up to this turn on the board. */
  replayTurn: number | null;
  set: (p: Partial<GameUi>) => void;
  resetTurn: () => void;
}

export const useGameUi = create<GameUi>((set) => ({
  hover: null,
  hoverSlot: null,
  held: null,
  plan: EMPTY_PLAN,
  moveDest: null,
  eyePreview: null,
  eyeTarget: null,
  camera: "overview",
  cameraNonce: 0,
  hudNonce: 0,
  danger: usePrefs.getState().dangerOverlay,
  heat: true,
  padOpen: typeof window !== "undefined" ? window.innerWidth > 900 : true,
  logOpen: typeof window !== "undefined" ? window.innerWidth > 1500 : false,
  paused: false,
  cursor: null,
  replayTurn: null,
  set: (p) => set(p),
  resetTurn: () => set({ plan: EMPTY_PLAN, moveDest: null, eyePreview: null, eyeTarget: null, held: null, cursor: null }),
}));
