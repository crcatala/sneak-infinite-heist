import { describe, expect, it } from "vitest";
import { roundScore, standings, matchWinners } from "../src/shared/game/score";
import { canSeeEvent, viewFor } from "../src/shared/game/views";
import type { GameEvent } from "../src/shared/game/state";
import { act, c, D1, detectiveTurn, inPlay, THIEF } from "./helpers";

describe("views (§6)", () => {
  it("filters events by visibility", () => {
    const ev = (vis: GameEvent["vis"]) => ({ type: "powerCut", seq: 1, vis }) as GameEvent;
    expect(canSeeEvent("thief", ev("thief"))).toBe(true);
    expect(canSeeEvent("detectives", ev("thief"))).toBe(false);
    expect(canSeeEvent("detectives", ev("detectives"))).toBe(true);
    expect(canSeeEvent("thief", ev("detectives"))).toBe(false);
    expect(canSeeEvent("spectator", ev("detectives"))).toBe(false);
    expect(canSeeEvent("spectator", ev("all"))).toBe(true);
    expect(canSeeEvent("omniscient", ev("thief"))).toBe(true);
  });

  it("gives the thief the whole picture and the detectives only public facts", () => {
    let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    const tv = viewFor(g, "thief");
    const dv = viewFor(g, "detectives");
    expect(tv.thief).toMatchObject({ cell: c(6, 1), entry: "a", pending: 0, stolen: [0], haul: 1 });
    expect(tv.thief.trail).toHaveLength(1);
    expect(dv.thief).toEqual({ controller: THIEF, revealed: false, turns: 1, snipsLeft: 2, sightings: 0, haul: 0, cell: null });
    // Same shape, same count, same timing: a hidden move is just "the thief moved".
    const moved = dv.events.filter((e) => e.type === "thiefMoved");
    expect(moved).toEqual([{ type: "thiefMoved", turn: 1, seq: moved[0].seq, vis: "detectives" }]);
    // Lock faces stay hidden from everyone under random placement.
    expect(tv.locks.every((l) => l.face === undefined)).toBe(true);
    expect(dv.locks.every((l) => l.face === undefined)).toBe(true);
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(4, 5) });
    expect(viewFor(g, "detectives").thief.haul).toBe(1);
  });

  it("reveals everything to everyone once the round is over", () => {
    let g = act(inPlay({ detectives: [[6, 3], [9, 5], [4, 9]] }), THIEF, { a: "thiefTurn", entry: "g", dest: c(6, 8) });
    g = detectiveTurn(g, D1, { move: 5, action: "eye" }, { a: "move", dest: c(6, 8) });
    const v = viewFor(g, "detectives");
    expect(v.viewer).toBe("omniscient");
    expect(v.thief.entry).toBe("g");
    expect(v.thief.trail).toHaveLength(1);
    expect(v.locks.every((l) => l.face)).toBe(true);
    expect(v.events).toHaveLength(g.events.length);
    expect(v.result).toMatchObject({ winner: "detectives", reason: "captured" });
  });
});

describe("scoring (§4.8)", () => {
  const escaped = (n: number) => ({ winner: "thief" as const, reason: "escaped" as const, paintings: n });
  const caught = (n: number) => ({ winner: "detectives" as const, reason: "captured" as const, paintings: n });

  it("scores escapes by paintings and captures as zero", () => {
    expect(roundScore(escaped(4))).toBe(4);
    expect(roundScore(caught(5))).toBe(0);
    expect(roundScore({ winner: "detectives", reason: "dawn", paintings: 3 })).toBe(0);
  });

  it("ranks the match by best thief score", () => {
    const table = standings(["a", "b", "c"], [
      { thief: "a", result: escaped(3) },
      { thief: "b", result: caught(6) },
      { thief: "c", result: escaped(5) },
    ]);
    expect(table.map((s) => [s.playerId, s.score])).toEqual([["c", 5], ["a", 3], ["b", 0]]);
    expect(matchWinners(table)).toEqual(["c"]);
    const tie = standings(["a", "b"], [{ thief: "a", result: escaped(3) }, { thief: "b", result: escaped(3) }]);
    expect(matchWinners(tie)).toEqual(["a", "b"]);
  });
});
