import { describe, expect, it } from "vitest";
import { turnSequence, type TurnNode } from "../src/client/game/turnOrder";
import { createGame } from "../src/shared/game/setup";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { DEFAULT_RULES } from "../src/shared/game/config";
import { viewFor } from "../src/shared/game/views";
import { act, c, D1, D2, D3, detectiveTurn, inPlay, THIEF } from "./helpers";

/** "T d1 T d2 ..." for readable assertions. */
const label = (nodes: TurnNode[] | null) => nodes?.map((n) => (n.kind === "thief" ? "T" : n.pawn.id)).join(" ");

describe("turn order", () => {
  it("starts with the thief and then follows the detectives in order", () => {
    const g = inPlay();
    expect(label(turnSequence(viewFor(g, "detectives")))).toBe("T d1 T d2 T d3");
  });

  it("starts with the detective who is playing, then the thief, then the next detective", () => {
    let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    expect(label(turnSequence(viewFor(g, "detectives")))).toBe("d1 T d2 T d3 T");
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(4, 5) });
    // The thief is up again, and the rotation has moved on to d2.
    expect(label(turnSequence(viewFor(g, "detectives")))).toBe("T d2 T d3 T d1");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 2) });
    expect(label(turnSequence(viewFor(g, "detectives")))).toBe("d2 T d3 T d1 T");
  });

  it("is one cycle long: two nodes per detective", () => {
    expect(turnSequence(viewFor(inPlay({ detectives: [[4, 6], [9, 5]] }), "detectives"))).toHaveLength(4);
    expect(turnSequence(viewFor(inPlay(), "detectives"))).toHaveLength(6);
  });

  it("repeats the same pawn when a lone detective plays both", () => {
    const g = inPlay({ detectives: [[4, 6], [9, 5]], controllers: [D1, D1] });
    const nodes = turnSequence(viewFor(g, "detectives"))!;
    expect(nodes.flatMap((n) => (n.kind === "detective" ? [n.pawn.controller] : []))).toEqual([D1, D1]);
  });

  it("is the same for everyone, thief and spectator included", () => {
    const g = inPlay();
    for (const who of ["thief", "detectives", "spectator"] as const) expect(label(turnSequence(viewFor(g, who)))).toBe("T d1 T d2 T d3");
  });

  it("has nothing to show during setup or once the round is over", () => {
    const setup = createGame({ board: CLASSIC_BOARD, rules: DEFAULT_RULES, seed: 1, thief: THIEF, detectives: [D1, D2, D3].map((controller) => ({ character: "red" as const, controller })) });
    expect(turnSequence(viewFor(setup, "detectives"))).toBeNull();
    const over = inPlay();
    over.phase = "roundOver";
    over.turn = { kind: "over" };
    expect(turnSequence(viewFor(over, "detectives"))).toBeNull();
  });
});
