// A stolen painting lifts off its stand for a moment, then the empty frame is left behind. The scene
// decides "still lifting?" while it renders, so nothing would re-render it when the lift ended and the
// frame turned up at whatever render came next. Clearing the lift on a timer makes that explicit.

import type { Cell } from "../../shared/board/model";

export interface Lift {
  painting: number;
  cell: Cell;
  until: number;
}

export interface LiftStore {
  get: () => Lift | null;
  set: (lift: Lift | null) => void;
}

/** Starts a lift lasting `ms` and clears it when it ends, unless a newer lift has replaced it. */
export function startLift(store: LiftStore, painting: number, cell: Cell, ms: number): void {
  const lift: Lift = { painting, cell, until: performance.now() + ms };
  store.set(lift);
  setTimeout(() => {
    if (store.get() === lift) store.set(null);
  }, ms);
}
