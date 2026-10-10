import { describe, expect, it } from "vitest";
import { GAP, MARGIN, SHOW_DELAY, WARM_MS, createTipController, placeTip, splitKeys, tip, type TipClock } from "../src/client/components/tipLogic";

const view = { w: 1280, h: 720 };
const size = { w: 200, h: 80 };
const box = (left: number, top: number, w = 40, h = 40) => ({ left, top, right: left + w, bottom: top + h });

describe("tip(): the props an element spreads", () => {
  it("only sets what was given", () => {
    expect(tip("Log")).toEqual({ "data-tip": "Log" });
    expect(tip("Log", "Case notes.", "L", "top")).toEqual({ "data-tip": "Log", "data-tip-body": "Case notes.", "data-tip-keys": "L", "data-tip-side": "top" });
  });

  it("splits alternative keys", () => {
    expect(splitKeys("2 / T")).toEqual(["2", "T"]);
    expect(splitKeys("Shift+1")).toEqual(["Shift+1"]);
    expect(splitKeys(undefined)).toEqual([]);
  });
});

describe("placeTip", () => {
  it("opens on the preferred side, centred on the element, with the caret on it", () => {
    const p = placeTip(box(600, 100), size, view, "bottom");
    expect(p).toMatchObject({ side: "bottom", x: 520, y: 140 + GAP, arrow: 100 });
    expect(placeTip(box(600, 400), size, view, "top")).toMatchObject({ side: "top", y: 400 - GAP - size.h });
  });

  it("flips to the other side when the preferred one has no room but the other does", () => {
    expect(placeTip(box(600, 650), size, view, "bottom").side).toBe("top");
    expect(placeTip(box(600, 20), size, view, "top").side).toBe("bottom");
  });

  it("keeps the preferred side when neither fits", () => {
    const tiny = { w: 1280, h: 100 };
    expect(placeTip(box(600, 30), size, tiny, "bottom").side).toBe("bottom");
  });

  it("slides sideways to stay on screen and keeps the caret on the element", () => {
    const left = placeTip(box(4, 100, 30), size, view, "bottom");
    expect(left.x).toBe(MARGIN);
    expect(left.arrow).toBe(16); // the caret never crowds the corner
    const right = placeTip(box(1250, 100, 30), size, view, "bottom");
    expect(right.x).toBe(view.w - size.w - MARGIN);
    expect(right.arrow).toBe(size.w - 16);
  });
});

/** A hand-cranked clock: timers fire only when `advance` passes them. */
function harness() {
  let t = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: TipClock = {
    now: () => t,
    set: (fn, ms) => (timers.set(nextId, { at: t + ms, fn }), nextId++),
    clear: (id) => void timers.delete(id as number),
  };
  const events: string[] = [];
  const ctl = createTipController<string>({ open: (el) => events.push(`open:${el}`), close: () => events.push("close") }, clock);
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = end;
  };
  const opens = () => events.filter((e) => e.startsWith("open:"));
  return { ctl, advance, opens, events };
}

describe("tooltip controller: hover", () => {
  it("opens only after the pointer has rested", () => {
    const { ctl, advance, opens } = harness();
    ctl.pointerOver("log");
    advance(SHOW_DELAY - 1);
    expect(opens()).toEqual([]);
    advance(1);
    expect(opens()).toEqual(["open:log"]);
  });

  it("does not open when the pointer passes through", () => {
    const { ctl, advance, opens } = harness();
    ctl.pointerOver("a");
    advance(100);
    ctl.pointerOver(null);
    advance(1000);
    expect(opens()).toEqual([]);
  });

  it("moves within one element without restarting the wait", () => {
    const { ctl, advance, opens } = harness();
    ctl.pointerOver("a");
    advance(200);
    ctl.pointerOver("a"); // a child of the same element
    advance(SHOW_DELAY - 200);
    expect(opens()).toEqual(["open:a"]);
  });

  it("opens a neighbour's tip at once while warm, then goes back to waiting", () => {
    const { ctl, advance, opens } = harness();
    ctl.pointerOver("a");
    advance(SHOW_DELAY);
    ctl.pointerOver("b");
    expect(opens()).toEqual(["open:a", "open:b"]);
    ctl.pointerOver(null);
    advance(WARM_MS + 1);
    ctl.pointerOver("c");
    expect(opens()).toEqual(["open:a", "open:b"]);
    advance(SHOW_DELAY);
    expect(opens()).toEqual(["open:a", "open:b", "open:c"]);
  });
});

describe("tooltip controller: clicks", () => {
  it("keeps the tip away from a clicked element until the pointer leaves and returns", () => {
    const { ctl, advance, opens, events } = harness();
    ctl.pointerOver("btn");
    advance(SHOW_DELAY);
    ctl.pointerDown("btn");
    expect(events.at(-1)).toBe("close");
    advance(5000);
    expect(opens()).toEqual(["open:btn"]);
    ctl.pointerOver(null);
    ctl.pointerOver("btn");
    advance(SHOW_DELAY + WARM_MS);
    expect(opens()).toEqual(["open:btn", "open:btn"]);
  });
});

describe("tooltip controller: keyboard focus", () => {
  it("opens at once for a focus that came from Tab", () => {
    const { ctl, opens } = harness();
    ctl.keyDown("Tab");
    ctl.focusIn("danger");
    expect(opens()).toEqual(["open:danger"]);
  });

  it("stays quiet when a button takes focus by itself (the Roll button on a new turn)", () => {
    const { ctl, advance, opens } = harness();
    ctl.keyDown(" "); // Space on the previous turn's button, then autoFocus lands on Roll
    ctl.focusIn("roll");
    advance(5000);
    expect(opens()).toEqual([]);
  });

  it("uses up the Tab on one focus, and a click cancels it", () => {
    const { ctl, opens } = harness();
    ctl.keyDown("Tab");
    ctl.focusIn("a");
    ctl.focusIn("b"); // programmatic, no new Tab
    expect(opens()).toEqual(["open:a"]);
    ctl.keyDown("Tab");
    ctl.pointerDown(null);
    ctl.focusIn("c");
    expect(opens()).toEqual(["open:a"]);
  });

  it("ignores focus on something without a tip", () => {
    const { ctl, opens } = harness();
    ctl.keyDown("Tab");
    ctl.focusIn(null);
    expect(opens()).toEqual([]);
  });
});

describe("tooltip controller: closing", () => {
  it("closes on Escape, on leaving the page and on an outside close", () => {
    for (const close of [(c: ReturnType<typeof harness>["ctl"]) => c.keyDown("Escape"), (c: ReturnType<typeof harness>["ctl"]) => c.leave(), (c: ReturnType<typeof harness>["ctl"]) => c.close()]) {
      const { ctl, advance, events } = harness();
      ctl.pointerOver("a");
      advance(SHOW_DELAY);
      close(ctl);
      expect(events.at(-1)).toBe("close");
    }
  });

  it("cancels a pending open when closed early", () => {
    const { ctl, advance, opens } = harness();
    ctl.pointerOver("a");
    advance(100);
    ctl.keyDown("Escape");
    advance(1000);
    expect(opens()).toEqual([]);
  });
});
