// Remembers, per browser, which first-time lobby hints have been dealt with (see lobbyFlow.ts).

import { create } from "zustand";
import type { HintProgress } from "./lobbyFlow";

const KEY = "sneak:lobby-hints";

function load(): HintProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<HintProgress>;
      return { picked: p.picked === true, readied: p.readied === true };
    }
  } catch {
    /* storage unavailable: the hints simply show every visit */
  }
  return { picked: false, readied: false };
}

export const useLobbyHints = create<HintProgress & { markPicked: () => void; markReadied: () => void }>((set, get) => {
  const save = () => {
    const { picked, readied } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ picked, readied }));
    } catch {
      /* storage unavailable */
    }
  };
  return {
    ...load(),
    markPicked: () => {
      if (get().picked) return;
      set({ picked: true });
      save();
    },
    markReadied: () => {
      if (get().readied) return;
      set({ readied: true });
      save();
    },
  };
});
