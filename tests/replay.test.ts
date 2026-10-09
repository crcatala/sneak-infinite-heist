import { describe, expect, it } from "vitest";
import type { Ctx } from "../src/client/game/narrate";
import { buildReplay, movesUpTo, positionsAt } from "../src/client/game/replay";
import { viewFor } from "../src/shared/game/views";
import type { RoomView } from "../src/shared/protocol";
import { act, c, D1, D2, D3, detectiveTurn, inPlay, THIEF } from "./helpers";

const room = { role: "detective", you: D1, players: [{ id: THIEF, name: "Tina" }, { id: D1, name: "Ann" }] } as unknown as RoomView;

/** Turns alternate: thief, then one detective. Thief x3, d1 d2 d3 in reply, a fourth thief turn, then d1 again. */
function playedRound() {
  let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
  g = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "move", dest: c(4, 8) }, { a: "skipAction" });
  g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 2) });
  g = detectiveTurn(g, D2, { move: 1, action: "eye" }, { a: "move", dest: c(9, 6) }, { a: "skipAction" });
  g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 3) });
  g = detectiveTurn(g, D3, { move: 1, action: "eye" }, { a: "move", dest: c(6, 8) }, { a: "eye", target: "self" });
  g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 4) });
  g.phase = "roundOver";
  return g;
}

describe("round-end replay", () => {
  const g = playedRound();
  const ctx: Ctx = { view: room, game: viewFor(g, "detectives") };
  const rounds = buildReplay(ctx);

  it("has one entry per thief turn plus the starting posts", () => {
    expect(rounds.map((r) => r.turn)).toEqual([0, 1, 2, 3, 4]);
    expect(rounds[0].moves).toEqual([]);
    expect(rounds[4].moves).toEqual([]);
  });

  it("assigns each detective move to the thief turn it answers", () => {
    expect(rounds[1].moves.map((m) => [m.pawn, m.to])).toEqual([["d1", c(4, 8)]]);
    expect(rounds[2].moves.map((m) => [m.pawn, m.to])).toEqual([["d2", c(9, 6)]]);
    expect(rounds[3].moves.map((m) => [m.pawn, m.to])).toEqual([["d3", c(6, 8)]]);
    expect(rounds[1].moves[0].from).toBe(c(4, 6));
    expect(rounds[1].moves[0].path.at(-1)).toBe(c(4, 8));
  });

  it("tracks where every pawn stands after each turn", () => {
    expect(positionsAt(rounds, 0)).toEqual({ d1: c(4, 6), d2: c(9, 5), d3: c(6, 9) });
    expect(positionsAt(rounds, 1)).toEqual({ d1: c(4, 8), d2: c(9, 5), d3: c(6, 9) });
    expect(positionsAt(rounds, 3)).toEqual({ d1: c(4, 8), d2: c(9, 6), d3: c(6, 8) });
    expect(positionsAt(rounds, 99)).toEqual(positionsAt(rounds, 4));
    for (const [pawn, cell] of Object.entries(positionsAt(rounds, 4))) expect(g.detectives.find((d) => d.id === pawn)!.cell).toBe(cell);
  });

  it("narrates the detectives' replies without the thief's secret lines", () => {
    const text = rounds[3].lines.map((l) => l.text).join("\n");
    expect(text).toMatch(/moved \d+ spaces?/);
    expect(text).toMatch(/looked around/);
    expect(text).not.toMatch(/crept|slipped in/);
    expect(rounds[4].lines).toEqual([]);
  });

  it("marks the latest turn's moves as bold and earlier ones as faded", () => {
    expect(movesUpTo(rounds, 2).map((x) => [x.move.pawn, x.latest])).toEqual([["d1", false], ["d2", true]]);
    expect(movesUpTo(rounds, 0)).toEqual([]);
  });
});
