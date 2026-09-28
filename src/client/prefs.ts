// Player preferences (Settings menu), persisted in localStorage per browser.

import { create } from "zustand";

export type Quality = "low" | "medium" | "high";
export type MotionPref = "system" | "reduced" | "full";

export interface Prefs {
  master: number;
  music: number;
  sfx: number;
  quality: Quality;
  motion: MotionPref;
  /** 0.8–1.4 */
  uiScale: number;
  colourBlind: boolean;
  /** Show the danger overlay by default when playing the thief. */
  dangerOverlay: boolean;
  muted: boolean;
}

const KEY = "sneak:prefs";

function guessQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = matchMedia("(pointer: coarse)").matches;
  if (mobile || cores <= 4) return "medium";
  return "high";
}

export const DEFAULT_PREFS: Prefs = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  quality: "medium",
  motion: "system",
  uiScale: 1,
  colourBlind: false,
  dangerOverlay: true,
  muted: false,
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_PREFS, quality: guessQuality() };
}

export const usePrefs = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    try {
      const { set: _omit, ...rest } = get();
      void _omit;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable */
    }
  },
}));

const systemReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function reducedMotion(): boolean {
  const m = usePrefs.getState().motion;
  return m === "reduced" || (m === "system" && systemReduced());
}

export function useReducedMotion(): boolean {
  const m = usePrefs((s) => s.motion);
  return m === "reduced" || (m === "system" && systemReduced());
}
