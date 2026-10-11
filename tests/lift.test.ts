import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLift, type Lift, type LiftStore } from "../src/client/game/lift";
import type { Cell } from "../src/shared/board/model";

const cell = 7 as Cell;

describe("startLift", () => {
  let current: Lift | null;
  const store: LiftStore = { get: () => current, set: (l) => (current = l) };

  beforeEach(() => {
    vi.useFakeTimers();
    current = null;
  });
  afterEach(() => vi.useRealTimers());

  it("is active during the lift, then cleared so the scene re-renders without it", () => {
    startLift(store, 3, cell, 1000);
    expect(current).toMatchObject({ painting: 3, cell });
    vi.advanceTimersByTime(999);
    expect(current).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(current).toBeNull();
  });

  it("does not clear a newer lift when an older one ends", () => {
    startLift(store, 3, cell, 1000);
    vi.advanceTimersByTime(600);
    startLift(store, 5, cell, 1000);
    vi.advanceTimersByTime(400); // the first lift's timer fires here
    expect(current).toMatchObject({ painting: 5 });
    vi.advanceTimersByTime(600);
    expect(current).toBeNull();
  });
});
