// Global client state: connection, latest room view, and UI bits shared across screens.

import { create } from "zustand";
import type { ClientMessage, Intent, RoomView } from "../shared/protocol";
import { PIN_LIFETIME_MS, placePin, type Pin } from "./game/pins";

export type ConnStatus = "idle" | "connecting" | "open" | "reconnecting" | "failed" | "claim";

/** "online": a room Durable Object over a websocket. "solo": the room engine running in this tab. */
export type SessionMode = "online" | "solo";

export interface Toast {
  id: number;
  text: string;
  kind: "error" | "info" | "good" | "bad" | "secret";
  icon?: string;
}

export interface Emote {
  id: number;
  by: string;
  emote: string;
}

interface DebugState {
  open: boolean;
  /** Animations run 6× slower (for tuning them). */
  slowMotion: boolean;
  msgIn: number;
  msgOut: number;
  bytesIn: number;
}

interface Store {
  mode: SessionMode;
  status: ConnStatus;
  fatal: string | null;
  /** Free seats offered when rejoining a started game without a valid seat secret. */
  claimSeats: { id: string; name: string }[];
  view: RoomView | null;
  clockOffset: number;
  toasts: Toast[];
  emotes: Emote[];
  pins: Pin[];
  /** Other detectives' pending choices (a picked space, an Eye target, a lifted piece), by player id. */
  intents: Record<string, Intent>;
  debug: DebugState;
  sendImpl: (msg: ClientMessage) => void;

  send: (msg: ClientMessage) => void;
  toast: (text: string, kind?: Toast["kind"], icon?: string) => void;
  dismissToast: (id: number) => void;
  setDebug: (d: Partial<DebugState>) => void;
  showEmote: (by: string, emote: string) => void;
  showPin: (by: string, x: number, y: number) => void;
  /** Records (or, with null, takes back) a detective's pending choice. */
  setIntent: (by: string, intent: Intent | null) => void;
  clearIntents: () => void;
}

let nextId = 1;

export const useStore = create<Store>((set, get) => ({
  mode: "online",
  status: "idle",
  fatal: null,
  claimSeats: [],
  view: null,
  clockOffset: 0,
  toasts: [],
  emotes: [],
  pins: [],
  intents: {},
  debug: { open: false, slowMotion: false, msgIn: 0, msgOut: 0, bytesIn: 0 },
  sendImpl: () => {},

  send: (msg) => {
    set((s) => ({ debug: { ...s.debug, msgOut: s.debug.msgOut + 1 } }));
    get().sendImpl(msg);
  },
  toast: (text, kind = "info", icon) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, icon }] }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 5000 : 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDebug: (d) => set((s) => ({ debug: { ...s.debug, ...d } })),
  showEmote: (by, emote) => {
    const id = nextId++;
    set((s) => ({ emotes: [...s.emotes.slice(-5), { id, by, emote }] }));
    setTimeout(() => set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) })), 2600);
  },
  showPin: (by, x, y) => {
    const id = nextId++;
    const now = performance.now();
    const pins = placePin(get().pins, { id, by, x, y }, now);
    set({ pins });
    // The scene fades pins by the clock; this just drops them from memory once they're gone.
    setTimeout(() => set((s) => ({ pins: s.pins.filter((p) => p.until > performance.now()) })), PIN_LIFETIME_MS + 100);
  },
  setIntent: (by, intent) =>
    set((s) => {
      if (intent === null) {
        if (!(by in s.intents)) return s;
        const { [by]: _gone, ...rest } = s.intents;
        void _gone;
        return { intents: rest };
      }
      return { intents: { ...s.intents, [by]: intent } };
    }),
  clearIntents: () => set((s) => (Object.keys(s.intents).length ? { intents: {} } : s)),
}));

/** Server clock "now", corrected for the local clock offset (for turn timers). */
export function serverNow(): number {
  return Date.now() + useStore.getState().clockOffset;
}

export function useMe(): string | null {
  return useStore((s) => s.view?.you ?? null);
}
