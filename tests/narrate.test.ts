import { describe, expect, it } from "vitest";
import { announceOf, buildLog, describe as describeEvent, lastAnnouncement, relativeTime, restoredRoll, type Ctx } from "../src/client/game/narrate";
import type { GameEvent } from "../src/shared/game/state";
import type { GameView } from "../src/shared/game/views";
import { viewFor } from "../src/shared/game/views";
import type { RoomView } from "../src/shared/protocol";
import { act, c, D1, detectiveTurn, inPlay, THIEF } from "./helpers";

/** The minimum of a RoomView the narration reads. */
const room = (role: "thief" | "detective", you: string) =>
  ({ role, you, players: [{ id: THIEF, name: "Tina" }, { id: D1, name: "Ann" }] }) as unknown as RoomView;

const ctxFor = (game: GameView, role: "thief" | "detective", you: string): Ctx => ({ view: room(role, you), game });
const ev = (e: object, seq: number) => ({ vis: "all", at: 1000 + seq, ...e, seq }) as GameEvent;

/** Thief slips in through window "a" and takes the painting at (6,1): the first hidden move of a round. */
const afterFirstMove = () => act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });

describe("narration never leaks what the viewer isn't allowed to see", () => {
  it("tells detectives only that the thief moved, in the dark", () => {
    const dv = viewFor(afterFirstMove(), "detectives");
    const ctx = ctxFor(dv, "detective", D1);
    const lines = dv.events.map((e) => describeEvent(e, ctx)).filter((l) => l !== null);
    const heads = dv.events.map((e) => announceOf(e, ctx)).filter((a) => a !== null);
    const moved = lines.find((l) => l.kind === "sneak")!;
    expect(moved.text).toBe("The thief slipped inside…");
    expect(moved.secret).toBe(false);
    const head = heads.find((a) => a.kind === "sneak")!;
    expect(head).toMatchObject({ title: "The thief slipped inside…", sub: "Somewhere in the dark." });
    // Nothing about the entry window, the painting that is pending, or where anyone went.
    const everything = JSON.stringify([lines, heads]);
    expect(everything).not.toMatch(/window|marked|crept/i);
    expect(lines.some((l) => l.kind === "steal")).toBe(false);
  });

  it("gives the thief their own secret lines and headlines", () => {
    const tv = viewFor(afterFirstMove(), "thief");
    const ctx = ctxFor(tv, "thief", THIEF);
    const lines = tv.events.map((e) => describeEvent(e, ctx)).filter((l) => l !== null);
    const heads = tv.events.map((e) => announceOf(e, ctx)).filter((a) => a !== null);
    const crept = lines.find((l) => l.kind === "sneak")!;
    expect(crept.text).toMatch(/^You slipped in through the .*window .* and crept \d+ spaces?\.$/);
    expect(crept.secret).toBe(true);
    expect(heads.find((a) => a.kind === "sneak")).toMatchObject({ title: expect.stringMatching(/^You crept \d+ spaces?$/), tone: "secret" });
    expect(heads.find((a) => a.kind === "steal")).toMatchObject({ title: "Painting marked", tone: "secret" });
  });
});

describe("announcements", () => {
  const dv = viewFor(inPlay(), "detectives");
  const ctx = ctxFor(dv, "detective", D1);

  it("go straight to the dock when the event has its own banner", () => {
    for (const e of [ev({ type: "thiefRevealed", cell: c(5, 5), by: "d1" }, 1), ev({ type: "powerOutDiscovered", pawn: "d1" }, 2), ev({ type: "dawn", turns: 20 }, 3), ev({ type: "escaped", slot: "a", cell: c(5, 1), paintings: 3 }, 4)]) {
      expect(announceOf(e, ctx)?.hero, e.type).toBe(false);
    }
  });

  it("are big for ordinary moves, and absent for bookkeeping events", () => {
    expect(announceOf(ev({ type: "detectiveMoved", pawn: "d1", from: c(4, 6), to: c(5, 6), path: [c(5, 6)] }, 5), ctx)?.hero).toBe(true);
    expect(announceOf(ev({ type: "rolled", pawn: "d1", move: 4, action: "scan" }, 6), ctx)).toMatchObject({ hero: true, sub: "Move up to 4 · Scan action" });
    for (const type of ["detectiveTurn", "thiefTurn", "actionSkipped", "locksShuffled", "roundOver"]) {
      expect(announceOf(ev({ type, pawn: "d1", turn: 1 }, 7), ctx), type).toBeNull();
    }
  });

  it("carry the acting detective's colour", () => {
    const a = announceOf(ev({ type: "eye", pawn: "d1", from: c(4, 6), seen: false }, 8), ctx)!;
    expect(a.hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a).toMatchObject({ tone: "info", sub: "Nothing in sight." });
    expect(announceOf(ev({ type: "eye", pawn: "d1", from: c(4, 6), seen: true }, 9), ctx)).toMatchObject({ tone: "alarm" });
  });
});

describe("the case notes log", () => {
  it("groups lines by turn and acting detective, filing a vanished painting under the next thief turn", () => {
    const dv = viewFor(inPlay(), "detectives");
    const events = [
      ev({ type: "thiefTurn", turn: 2 }, 1),
      ev({ type: "detectiveTurn", pawn: "d1" }, 2),
      ev({ type: "rolled", pawn: "d1", move: 2, action: "eye" }, 3),
      ev({ type: "paintingVanished", painting: 0, cell: c(6, 1) }, 4),
      ev({ type: "thiefTurn", turn: 3 }, 5),
      ev({ type: "thiefMoved", turn: 3 }, 6),
    ];
    const log = buildLog(ctxFor({ ...dv, events }, "detective", D1));
    expect(log.map((l) => [l.kind, l.turn, l.pawn])).toEqual([
      ["roll", 2, "d1"],
      ["steal", 3, null],
      ["sneak", 3, null],
    ]);
  });

  it("stamps every line with when it happened", () => {
    const dv = viewFor(inPlay(), "detectives");
    const log = buildLog(ctxFor({ ...dv, events: [ev({ type: "rolled", pawn: "d1", move: 1, action: "eye" }, 3)] }, "detective", D1));
    expect(log[0].at).toBe(1003);
  });
});

describe("relative times", () => {
  it.each([
    [0, "just now"],
    [9_000, "just now"],
    [10_000, "10s ago"],
    [59_000, "59s ago"],
    [60_000, "1m ago"],
    [3_599_000, "59m ago"],
    [3_600_000, "1h ago"],
    [86_400_000, "1d ago"],
  ])("%i ms ago reads %s", (ms, text) => {
    expect(relativeTime(1_000_000, 1_000_000 + ms)).toBe(text);
  });

  it("never goes negative when clocks disagree", () => {
    expect(relativeTime(2_000_000, 1_000_000)).toBe("just now");
  });
});

describe("restoring the dock after a reload or late join", () => {
  const rolled = () => detectiveTurn(afterFirstMove(), D1, { move: 3, action: "eye" });

  it("restores this turn's dice, already rolled", () => {
    expect(restoredRoll(viewFor(rolled(), "detectives"))).toEqual({ move: 3, action: "eye", pawn: expect.stringMatching(/^d\d$/) });
  });

  it("has no dice before the roll, or on the thief's turn", () => {
    expect(restoredRoll(viewFor(afterFirstMove(), "detectives"))).toBeNull();
    expect(restoredRoll(viewFor(inPlay(), "detectives"))).toBeNull();
  });

  it("restores the last headline-worthy event, skipping bookkeeping after it", () => {
    const dv = viewFor(rolled(), "detectives");
    const head = lastAnnouncement(ctxFor(dv, "detective", D1))!;
    expect(head).toMatchObject({ kind: "roll", sub: "Move up to 3 · Eye action" });
    // Nothing worth announcing yet at the very start of the round.
    expect(lastAnnouncement(ctxFor({ ...dv, events: dv.events.filter((e) => e.type === "thiefTurn" || e.type === "detectiveTurn") }, "detective", D1))).toBeNull();
  });
});
