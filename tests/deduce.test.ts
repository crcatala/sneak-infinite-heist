import { describe, expect, it } from "vitest";
import { canSee } from "../src/shared/board/los";
import { colourOf, distance } from "../src/shared/board/model";
import { deduce } from "../src/shared/game/deduce";
import type { GameState } from "../src/shared/game/state";
import { viewFor } from "../src/shared/game/views";
import { act, board, c, D1, D2, detectiveTurn, detView, inPlay, THIEF } from "./helpers";

const possible = (g: GameState) => new Set(deduce(g.board, detView(g).events).weights.keys());

describe("deduce: possible thief cells from public events", () => {
  it("knows nothing before the thief enters", () => {
    const d = deduce(inPlay().board, detView(inPlay()).events);
    expect(d.entered).toBe(false);
    expect(d.weights.size).toBe(0);
  });

  it("spreads 1–3 steps from every entry after the first move, never onto detectives", () => {
    const g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    const set = possible(g);
    for (const x of board.walkable) {
      const near = board.slots.some((s) => {
        const d = distance(board, s.inside, x);
        return d >= 1 && d <= 3;
      });
      const detective = g.detectives.some((d) => d.cell === x);
      expect(set.has(x)).toBe(near && !detective);
    }
    const total = [...deduce(g.board, detView(g).events).weights.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it("prunes on a 'no' from the eyes and keeps only the sightline on a camera 'yes'", () => {
    let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" });
    const from = g.detectives[0].cell!;
    for (const x of possible(g)) expect(canSee(board, from, x)).toBe(false);
    expect(possible(g).has(c(5, 3))).toBe(true);
    g = act(g, D1, { a: "move", dest: c(4, 5) });
    g = act(g, THIEF, { a: "thiefTurn", dest: c(4, 3) }); // onto camera 1
    g = detectiveTurn(g, D2, { move: 1, action: "eye" }, { a: "eye", target: 1 });
    for (const x of possible(g)) expect(canSee(board, c(4, 3), x)).toBe(true);
    expect(possible(g).has(c(4, 3))).toBe(true);
  });

  it("keeps one colour after a motion answer", () => {
    let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "i", dest: c(2, 7) });
    g = detectiveTurn(g, D1, { move: 1, action: "motion" }, { a: "motion" });
    g = act(g, THIEF, { a: "motionResponse", snip: false });
    const set = possible(g);
    expect(set.has(c(2, 7))).toBe(true);
    for (const x of set) expect(colourOf(board, x)).toBe("yellow");
  });

  it("pins the thief when a painting vanishes, and rules paintings out when none does", () => {
    // Detectives far away; the thief steals painting 0 at [6,1].
    let g = act(inPlay({ detectives: [[4, 9], [9, 9], [6, 9]] }), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(4, 8) });
    const d = deduce(g.board, detView(g).events);
    expect(d.pinned).toBe(c(6, 1));
    expect(detView(g).lastSeen).toMatchObject({ cell: c(6, 1), reason: "painting" });
    // Next move without stealing: after the next detective turn, no painting cell remains possible.
    g = act(g, THIEF, { a: "thiefTurn", dest: c(7, 2) });
    g = detectiveTurn(g, D2, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(9, 8) });
    const hanging = new Set(detView(g).paintings.filter((p) => p.status === "hanging").map((p) => p.cell));
    for (const x of possible(g)) expect(hanging.has(x)).toBe(false);
    expect(possible(g).has(c(7, 2))).toBe(true);
    expect(deduce(g.board, detView(g).events).sincePinned).toBe(1);
  });

  it("pins on a lock flip and on a reveal", () => {
    const g = inPlay({ detectives: [[9, 1], [9, 5], [6, 9]] });
    g.thief.cell = c(5, 3);
    g.thief.entry = "k";
    g.thief.turns = 1;
    g.thief.stolen = [6, 7, 8];
    for (const id of [6, 7, 8]) g.paintings[id].status = "stolen";
    let next = act(g, THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true });
    // Events before the flip didn't include the entry move, so only the flip pins it.
    expect(deduce(next.board, detView(next).events).pinned).toBe(c(5, 1));
    next = detectiveTurn(next, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" });
    expect(viewFor(next, "detectives").thief.revealed).toBe(true);
    expect(deduce(next.board, detView(next).events).pinned).toBe(c(5, 1));
  });
});
