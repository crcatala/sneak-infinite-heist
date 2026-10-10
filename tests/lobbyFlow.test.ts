import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/shared/characters";
import { cycle, flowPose, hintStep, ringOffset, type HintContext } from "../src/client/lobbyFlow";

describe("cover-flow ring", () => {
  const n = CHARACTERS.length;

  it("measures the shortest signed distance around the ring", () => {
    expect(ringOffset(0, 0, n)).toBe(0);
    expect(ringOffset(1, 0, n)).toBe(1);
    expect(ringOffset(2, 0, n)).toBe(2);
    expect(ringOffset(n - 1, 0, n)).toBe(-1);
    expect(ringOffset(n - 2, 0, n)).toBe(-2);
    // The slot straight across is the one that sits "behind" the focus, and is never drawn.
    expect(Math.abs(ringOffset(3, 0, n))).toBe(3);
  });

  it("wraps when the focus is near the end", () => {
    expect(ringOffset(0, n - 1, n)).toBe(1);
    expect(ringOffset(1, n - 1, n)).toBe(2);
    expect(ringOffset(n - 2, n - 1, n)).toBe(-1);
  });

  it("gives every slot a distinct offset for any focus", () => {
    for (let focus = 0; focus < n; focus++) {
      const offsets = Array.from({ length: n }, (_, i) => ringOffset(i, focus, n));
      expect(new Set(offsets).size).toBe(n);
      expect(offsets[focus]).toBe(0);
    }
  });

  it("cycles left and right with wrap-around", () => {
    expect(cycle(0, 1, n)).toBe(1);
    expect(cycle(0, -1, n)).toBe(n - 1);
    expect(cycle(n - 1, 1, n)).toBe(0);
    let at = 2;
    for (let i = 0; i < n; i++) at = cycle(at, 1, n);
    expect(at).toBe(2);
  });

  it("draws the focus largest and in front, and hides slots more than two away", () => {
    const poses = [-3, -2, -1, 0, 1, 2].map(flowPose);
    const focus = flowPose(0);
    expect(focus).toMatchObject({ scale: 1, opacity: 1, brightness: 1 });
    for (const d of [-2, -1, 1, 2]) {
      const p = flowPose(d);
      expect(p.scale).toBeLessThan(focus.scale);
      expect(p.z).toBeLessThan(focus.z);
    }
    expect(flowPose(1).scale).toBeGreaterThan(flowPose(2).scale);
    expect(flowPose(1)).toEqual(flowPose(-1));
    expect(poses[0].opacity).toBe(0);
    expect(flowPose(2).opacity).toBeGreaterThan(0);
  });
});

describe("first-time lobby hints", () => {
  const fresh = { picked: false, readied: false };
  const ctx = (over: Partial<HintContext> = {}): HintContext => ({ seated: true, ready: false, busy: false, canPick: true, ...over });

  it("walks a new player through choose, then ready", () => {
    expect(hintStep(fresh, ctx())).toBe("pick");
    expect(hintStep({ picked: true, readied: false }, ctx())).toBe("ready");
    expect(hintStep({ picked: true, readied: true }, ctx())).toBeNull();
  });

  it("stays quiet for someone who has done both before", () => {
    expect(hintStep({ picked: true, readied: true }, ctx())).toBeNull();
  });

  it("does not nag a player who is already ready", () => {
    expect(hintStep(fresh, ctx({ ready: true }))).toBeNull();
    expect(hintStep({ picked: true, readied: false }, ctx({ ready: true }))).toBeNull();
  });

  it("hides while the rules sheet is open, and for spectators", () => {
    expect(hintStep(fresh, ctx({ busy: true }))).toBeNull();
    expect(hintStep(fresh, ctx({ seated: false }))).toBeNull();
  });

  it("skips the choose step when there is nothing to choose (a solo thief)", () => {
    expect(hintStep(fresh, ctx({ canPick: false }))).toBe("ready");
    expect(hintStep({ picked: false, readied: true }, ctx({ canPick: false }))).toBeNull();
  });

  it("remembers each step on its own, so a half-finished first visit resumes at the ready hint", () => {
    // Chose a detective last time, closed the tab before readying up.
    expect(hintStep({ picked: true, readied: false }, ctx())).toBe("ready");
  });
});
