import { describe, expect, it } from "vitest";
import { BOARD, CLASSIC_BOARD, OPENINGS } from "../src/shared/board/classic";
import { canSee, sightline } from "../src/shared/board/los";
import { cellOf, colourOf, distance, getBoard, parseBoard, regionName, wall, xyOf, type Cell, type XY } from "../src/shared/board/model";
import { detectiveDestinations, shortestPath, thiefDestinations, thiefPathProblem, thiefSimplePaths } from "../src/shared/board/paths";
import { validateBoard } from "../src/shared/board/validate";

const board = getBoard(CLASSIC_BOARD);
const c = (x: number, y: number): Cell => cellOf(board, x, y);
const xy = (cells: Iterable<Cell>): XY[] => [...cells].map((x) => xyOf(board, x));
const sortXY = (list: XY[]) => list.map((p) => p.join(",")).sort();

describe("classic board data", () => {
  it("is valid", () => {
    expect(validateBoard(CLASSIC_BOARD)).toEqual([]);
  });

  it("has 104 walkable cells with the documented room sizes", () => {
    expect(board.walkable).toHaveLength(104);
    const sizes = Object.fromEntries(Object.entries(board.rooms).map(([r, cells]) => [r, cells.length]));
    // X counts the P cell too (3 + 1).
    expect(sizes).toEqual({ R: 12, U: 9, B: 6, Y: 9, G: 12, W: 20, C: 28, S: 4, X: 4 });
    expect(xyOf(board, board.power)).toEqual([9, 11]);
  });

  it("has 11 slots (7 windows, 4 doors), each with one inside cell", () => {
    expect(board.slots).toHaveLength(11);
    expect(board.slots.filter((s) => s.kind === "window")).toHaveLength(7);
    expect(board.slots.filter((s) => s.kind === "door").map((s) => s.id).sort()).toEqual(["d", "f", "g", "j"]);
    for (const s of board.slots) {
      expect(board.region[s.cell]).toBeNull();
      expect(board.region[s.inside]).not.toBeNull();
      expect(BOARD[xyOf(board, s.cell)[1]][xyOf(board, s.cell)[0]]).toBe(s.id);
    }
    expect(new Set(board.slots.map((s) => s.inside)).size).toBe(11);
    expect(board.slotById.a.side).toBe("n");
    expect(board.slotById.e.side).toBe("e");
    expect(board.slotById.k.side).toBe("w");
    expect(board.slotById.f.side).toBe("s");
  });

  it("walls every region boundary except the 14 openings", () => {
    let crossings = 0;
    for (const a of board.walkable) {
      for (const b of board.walkable) {
        if (a >= b) continue;
        const [ax, ay] = xyOf(board, a);
        const [bx, by] = xyOf(board, b);
        if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) continue;
        if (board.region[a] === board.region[b]) expect(wall(board, a, b)).toBe(false);
        else if (!wall(board, a, b)) crossings++;
      }
    }
    expect(crossings).toBe(OPENINGS.length);
    expect(wall(board, c(5, 2), c(5, 3))).toBe(false); // Red ↔ corridor doorway
    expect(wall(board, c(6, 2), c(6, 3))).toBe(true); // Red ↔ corridor wall
    expect(wall(board, c(9, 10), c(9, 11))).toBe(false); // X ↔ P is one room
    expect(wall(board, c(4, 5), c(3, 5))).toBe(false); // Purple doorway
  });

  it("names rooms and floor colours", () => {
    expect(regionName(board, "Y")).toBe("Gold Gallery");
    expect(regionName(board, "W")).toBe("White Atrium");
    expect(regionName(board, "S")).toBe("Storeroom");
    expect(colourOf(board, c(1, 7))).toBe("yellow");
    expect(colourOf(board, c(9, 11))).toBe("grey");
    expect(colourOf(board, c(4, 4))).toBe("grey");
  });
});

describe("painting cells (R9, R10)", () => {
  it("forbids window inside cells and the room side of every doorway", () => {
    const forbidden = board.walkable.filter((x) => {
      const r = board.region[x];
      return r !== "C" && r !== "X" && board.paintingProblem[x] !== null;
    });
    expect(sortXY(xy(forbidden))).toEqual(
      sortXY([
        [5, 1], [8, 1], [11, 3], [12, 8], [2, 9], [1, 8], [1, 4], // window inside cells
        [5, 2], [8, 2], [6, 4], [7, 4], [6, 8], [7, 8], [5, 7], [8, 6], [3, 5], [10, 4], [3, 8], [10, 8], [5, 10], // doorway room sides
      ]),
    );
  });

  it("leaves R 8, U 7, B 4, Y 6, G 10, W 14, S 3 eligible cells (52)", () => {
    const eligible = (r: string) => board.rooms[r as "R"].filter((x) => board.paintingProblem[x] === null).length;
    expect(["R", "U", "B", "Y", "G", "W", "S"].map(eligible)).toEqual([8, 7, 4, 6, 10, 14, 3]);
    expect(board.walkable.filter((x) => board.paintingProblem[x] === null)).toHaveLength(52);
  });

  it("explains why", () => {
    expect(board.paintingProblem[c(4, 4)]).toMatch(/corridors/);
    expect(board.paintingProblem[c(8, 10)]).toMatch(/Power Room/);
    expect(board.paintingProblem[c(9, 11)]).toMatch(/Power Room/);
    expect(board.paintingProblem[c(5, 1)]).toMatch(/window/);
    expect(board.paintingProblem[c(6, 4)]).toMatch(/doorway/);
    expect(board.paintingProblem[c(0, 0)]).toMatch(/outside/);
    expect(board.paintingProblem[c(4, 11)]).toBeNull(); // storeroom is fine (R10)
  });
});

describe("line of sight (§4.6)", () => {
  it("runs through doorways: [6,3] sees all the way down to [6,10]", () => {
    expect(canSee(board, c(6, 3), c(6, 10))).toBe(true);
    const south = xy(sightline(board, c(6, 3))).filter(([x, y]) => x === 6 && y > 3);
    expect(south).toEqual([[6, 4], [6, 5], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10]]);
  });

  it("stops at walls", () => {
    // [5,3] (corridor) and [5,4] (White) have no opening between them.
    expect(canSee(board, c(5, 3), c(5, 4))).toBe(false);
    // East from the White west door: through [5..8,7], then the east wall.
    const east = xy(sightline(board, c(4, 7))).filter(([, y]) => y === 7).filter(([x]) => x > 4);
    expect(east).toEqual([[5, 7], [6, 7], [7, 7], [8, 7]]);
    // Different rooms side by side never see each other through a wall.
    expect(canSee(board, c(3, 4), c(4, 4))).toBe(false);
  });

  it("is orthogonal only and includes the viewer's own cell", () => {
    expect(canSee(board, c(6, 6), c(7, 7))).toBe(false);
    expect(canSee(board, c(6, 6), c(6, 6))).toBe(true);
    expect(sightline(board, c(6, 6))[0]).toBe(c(6, 6));
  });

  it("is symmetric", () => {
    for (const a of board.walkable) for (const b of board.sight[a]) expect(canSee(board, b, a)).toBe(true);
  });
});

describe("thief movement (§4.3)", () => {
  it("ends 1–3 steps away, never on the start or a detective", () => {
    const start = c(5, 1);
    const ends = thiefDestinations(board, start, [c(6, 1)]);
    expect(ends.has(start)).toBe(false);
    expect(ends.has(c(6, 1))).toBe(false);
    expect(ends.has(c(7, 1))).toBe(true); // passes through the detective
    expect(ends.has(c(8, 1))).toBe(true);
    expect(ends.has(c(9, 1))).toBe(false); // 4 away
    expect(ends.has(c(5, 3))).toBe(true); // through the doorway
    for (const [end, path] of ends) {
      expect(path.length).toBeGreaterThanOrEqual(1);
      expect(path.length).toBeLessThanOrEqual(3);
      expect(path[path.length - 1]).toBe(end);
      expect(distance(board, start, end)).toBe(path.length);
    }
  });

  it("matches the set of simple-path ends of length 1–3", () => {
    for (const start of [c(5, 1), c(4, 5), c(6, 6), c(9, 11), c(2, 6)]) {
      const simple = new Set(thiefSimplePaths(board, start).map((p) => p[p.length - 1]));
      simple.delete(start);
      expect([...thiefDestinations(board, start, []).keys()].sort()).toEqual([...simple].sort());
    }
  });

  it("validates explicit paths", () => {
    const start = c(4, 4);
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 6)], [])).toBeNull();
    expect(thiefPathProblem(board, start, [], [])).toMatch(/1, 2 or 3/);
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 6), c(4, 7), c(4, 8)], [])).toMatch(/1, 2 or 3/);
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 4)], [])).toMatch(/twice/); // back to start
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 6), c(4, 5)], [])).toMatch(/twice/);
    expect(thiefPathProblem(board, start, [c(5, 4)], [])).toMatch(/wall/);
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 6)], [c(4, 6)])).toMatch(/detective/);
    expect(thiefPathProblem(board, start, [c(4, 5), c(4, 6)], [c(4, 5)])).toBeNull(); // pass through
  });
});

describe("detective movement (§4.4, R5)", () => {
  const start = c(6, 6);

  it("reaches cells at distance 1..N, with backtracking", () => {
    const ends = detectiveDestinations(board, start, 3, [], false);
    for (const x of board.walkable) {
      const d = distance(board, start, x);
      if (d >= 1 && d <= 3) expect(ends.get(x)).toBe(d);
      if (d > 3) expect(ends.has(x)).toBe(false);
    }
  });

  it("includes the start cell only when N ≥ 2 or the stay house rule is on", () => {
    expect(detectiveDestinations(board, start, 1, [], false).has(start)).toBe(false);
    expect(detectiveDestinations(board, start, 1, [], true).has(start)).toBe(true);
    expect(detectiveDestinations(board, start, 2, [], false).get(start)).toBe(0);
    expect(detectiveDestinations(board, start, 6, [], false).has(start)).toBe(true);
  });

  it("never ends on paintings or other detectives, but passes through them", () => {
    const ends = detectiveDestinations(board, start, 2, [c(6, 7), c(7, 6)], false);
    expect(ends.has(c(6, 7))).toBe(false);
    expect(ends.has(c(7, 6))).toBe(false);
    expect(ends.has(c(6, 8))).toBe(true);
    expect(ends.has(c(8, 6))).toBe(true);
  });

  it("finds shortest paths through openings", () => {
    const path = shortestPath(board, c(5, 1), c(6, 5));
    expect(path).toHaveLength(distance(board, c(5, 1), c(6, 5)));
    let prev = c(5, 1);
    for (const step of path) {
      expect(wall(board, prev, step)).toBe(false);
      prev = step;
    }
  });
});

describe("board validation", () => {
  const variant = (patch: Partial<typeof CLASSIC_BOARD>) => ({ ...CLASSIC_BOARD, id: `test-${Math.random()}`, ...patch });

  it("catches unreachable rooms", () => {
    const openings = OPENINGS.filter(([a]) => !(a[0] === 9 && a[1] === 4)); // drop corridor ↔ Blue
    expect(validateBoard(variant({ openings })).join(" ")).toMatch(/Unreachable/);
  });

  it("catches bad openings and slots", () => {
    expect(validateBoard(variant({ openings: [...OPENINGS, [[6, 5], [7, 5]]] })).join(" ")).toMatch(/inside one region/);
    expect(validateBoard(variant({ openings: [...OPENINGS, [[6, 5], [8, 5]]] })).join(" ")).toMatch(/neighbours/);
    const slots = CLASSIC_BOARD.slots.map((s) => (s.id === "a" ? { ...s, inside: [6, 1] as XY } : s));
    expect(validateBoard(variant({ slots })).join(" ")).toMatch(/next to its inside cell/);
  });

  it("catches a missing power switch", () => {
    const rows = CLASSIC_BOARD.rows.map((r) => r.replace("P", "X"));
    expect(validateBoard(variant({ rows })).join(" ")).toMatch(/power switch/);
  });

  it("parses deterministically", () => {
    const again = parseBoard(CLASSIC_BOARD);
    expect(again.walkable).toEqual(board.walkable);
    expect(again.neighbours).toEqual(board.neighbours);
  });
});
