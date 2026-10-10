import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/shared/characters";
import { cycle, flowPose, hintStep, lobbyKey, ringOffset, swipeDir, type HintContext, type LobbyKeyContext } from "../src/client/lobbyFlow";

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

describe("swipes", () => {
  it("maps a drag to a direction, ignoring short ones", () => {
    expect(swipeDir(-80)).toBe(1); // drag left: next detective
    expect(swipeDir(80)).toBe(-1); // drag right: previous
    expect(swipeDir(0)).toBe(0);
    expect(swipeDir(40)).toBe(0);
    expect(swipeDir(-40)).toBe(0);
    expect(swipeDir(-41)).toBe(1);
    expect(swipeDir(12, 10)).toBe(-1);
  });
});

describe("lobby keys", () => {
  const ctx = (over: Partial<LobbyKeyContext> = {}): LobbyKeyContext => ({ focus: "idle", sheet: false, canBrowse: true, canChoose: true, ...over });

  it("cycles with the arrows and readies with R wherever focus is", () => {
    for (const focus of ["idle", "other"] as const) {
      expect(lobbyKey("ArrowLeft", ctx({ focus }))).toBe("prev");
      expect(lobbyKey("ArrowRight", ctx({ focus }))).toBe("next");
      expect(lobbyKey("r", ctx({ focus }))).toBe("ready");
      expect(lobbyKey("R", ctx({ focus }))).toBe("ready");
    }
  });

  it("chooses on Enter and readies on Space only when nothing is focused (the gamepad's A and X)", () => {
    expect(lobbyKey("Enter", ctx())).toBe("choose");
    expect(lobbyKey(" ", ctx())).toBe("ready");
  });

  it("leaves Enter and Space alone while a button is focused, so it never hijacks it", () => {
    expect(lobbyKey("Enter", ctx({ focus: "other" }))).toBeNull();
    expect(lobbyKey(" ", ctx({ focus: "other" }))).toBeNull();
  });

  it("does not choose a taken detective, a spectator's pick, or anything for a solo thief", () => {
    expect(lobbyKey("Enter", ctx({ canChoose: false }))).toBeNull();
    expect(lobbyKey("Enter", ctx({ canBrowse: false }))).toBeNull();
    expect(lobbyKey("ArrowLeft", ctx({ canBrowse: false }))).toBeNull();
    expect(lobbyKey("ArrowRight", ctx({ canBrowse: false }))).toBeNull();
    expect(lobbyKey(" ", ctx({ canBrowse: false }))).toBe("ready");
  });

  it("closes the rules sheet on Escape and ignores everything else while it is open", () => {
    expect(lobbyKey("Escape", ctx({ sheet: true }))).toBe("closeSheet");
    expect(lobbyKey("Escape", ctx())).toBe("leave");
    for (const key of ["Enter", " ", "r", "ArrowLeft", "ArrowRight"]) expect(lobbyKey(key, ctx({ sheet: true }))).toBeNull();
  });

  it("stays out of text fields", () => {
    for (const key of ["Escape", "Enter", " ", "r", "ArrowLeft", "ArrowRight"]) expect(lobbyKey(key, ctx({ focus: "input" }))).toBeNull();
  });
});
