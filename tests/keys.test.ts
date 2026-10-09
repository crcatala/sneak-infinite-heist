import { describe, expect, it } from "vitest";
import { defersToFocusedControl, primaryIntent, type PrimaryState } from "../src/client/game/keys";

const base: PrimaryState = {
  role: "detective",
  setup: false,
  myDet: true,
  rolled: true,
  eyeRoll: true,
  acted: false,
  eyeTarget: null,
  cursor: null,
  moveDest: null,
  thiefPlanDest: null,
  iAmReady: false,
};

describe("keyboard: a focused button keeps its own Enter / Space", () => {
  it("defers when a button was reached by keyboard (Cancel must cancel)", () => {
    expect(defersToFocusedControl("Enter", { tag: "BUTTON", role: null, focusVisible: true })).toBe(true);
    expect(defersToFocusedControl(" ", { tag: "BUTTON", role: null, focusVisible: true })).toBe(true);
    expect(defersToFocusedControl("Enter", { tag: "DIV", role: "button", focusVisible: true })).toBe(true);
    expect(defersToFocusedControl("Enter", { tag: "A", role: null, focusVisible: true })).toBe(true);
  });

  it("keeps the shortcuts after a mouse click, and for the canvas and the page", () => {
    expect(defersToFocusedControl("Enter", { tag: "BUTTON", role: null, focusVisible: false })).toBe(false);
    expect(defersToFocusedControl("Enter", { tag: "CANVAS", role: null, focusVisible: true })).toBe(false);
    expect(defersToFocusedControl("Enter", { tag: "BODY", role: null, focusVisible: true })).toBe(false);
  });

  it("only ever concerns Enter and Space", () => {
    for (const key of ["Escape", "e", "x", "ArrowUp"]) expect(defersToFocusedControl(key, { tag: "BUTTON", role: null, focusVisible: true })).toBe(false);
  });
});

describe("keyboard: the primary action for the moment", () => {
  it("Eye needs a picked target, and Enter then confirms it", () => {
    expect(primaryIntent("Enter", base)).toBeNull();
    expect(primaryIntent("Enter", { ...base, eyeTarget: 3 })).toEqual({ kind: "eye", target: 3 });
    expect(primaryIntent("Enter", { ...base, eyeTarget: "self" })).toEqual({ kind: "eye", target: "self" });
  });

  it("Space never confirms an Eye", () => {
    expect(primaryIntent(" ", { ...base, eyeTarget: 3 })).toBeNull();
  });

  it("does not confirm an Eye that is already used, or not rolled, or not my turn", () => {
    expect(primaryIntent("Enter", { ...base, eyeTarget: 3, acted: true })).toBeNull();
    expect(primaryIntent("Enter", { ...base, eyeTarget: 3, eyeRoll: false })).toBeNull();
    expect(primaryIntent("Enter", { ...base, eyeTarget: 3, myDet: false })).toBeNull();
  });

  it("Enter or Space rolls when I haven't, and Enter or Space moves a chosen destination", () => {
    expect(primaryIntent(" ", { ...base, rolled: false })).toEqual({ kind: "roll" });
    expect(primaryIntent("Enter", { ...base, rolled: false })).toEqual({ kind: "roll" });
    expect(primaryIntent("Enter", { ...base, moveDest: 42 })).toEqual({ kind: "move", dest: 42 });
    expect(primaryIntent(" ", { ...base, moveDest: 42 })).toEqual({ kind: "move", dest: 42 });
  });

  it("Enter clicks the keyboard cursor, unless it is already the chosen destination", () => {
    expect(primaryIntent("Enter", { ...base, cursor: 7 })).toEqual({ kind: "boardClick", cell: 7 });
    expect(primaryIntent("Enter", { ...base, cursor: 7, moveDest: 7 })).toEqual({ kind: "move", dest: 7 });
    expect(primaryIntent("Enter", { ...base, role: "thief", myDet: false, cursor: 7, thiefPlanDest: 7 })).toBeNull();
  });

  it("Enter toggles ready in setup for detectives only", () => {
    const setup = { ...base, setup: true, myDet: false };
    expect(primaryIntent("Enter", setup)).toEqual({ kind: "ready", ready: true });
    expect(primaryIntent("Enter", { ...setup, iAmReady: true })).toEqual({ kind: "ready", ready: false });
    expect(primaryIntent("Enter", { ...setup, role: "thief" })).toBeNull();
    expect(primaryIntent(" ", setup)).toBeNull();
  });
});
