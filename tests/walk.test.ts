import { describe, expect, it } from "vitest";
import { planWalk } from "../src/client/scene/walk";

// Cells are plain numbers: 10 -> 11 -> 12 is a move of two spaces, 20 is somewhere else entirely.
const move = { from: 10, path: [11, 12] };

describe("live game (no replay walk): trust the supplied path", () => {
  it("walks the path when it ends at the new cell", () => {
    expect(planWalk(10, 12, [11, 12], undefined)).toEqual({ kind: "walk", cells: [11, 12] });
  });
  it("takes one step to the cell when the path doesn't fit", () => {
    expect(planWalk(10, 12, [5, 6], undefined)).toEqual({ kind: "walk", cells: [12] });
    expect(planWalk(10, 12, null, undefined)).toEqual({ kind: "walk", cells: [12] });
  });
  it("stays when the cell hasn't changed, and snaps on first placement", () => {
    expect(planWalk(12, 12, [11, 12], undefined)).toEqual({ kind: "stay" });
    expect(planWalk(null, 12, [11, 12], undefined)).toEqual({ kind: "snap" });
  });
});

describe("replay scrubbing", () => {
  it("walks one real step forward from where the piece stands", () => {
    expect(planWalk(10, 12, move.path, move)).toEqual({ kind: "walk", cells: [11, 12] });
  });

  it("snaps after a jump: the piece is nowhere near the step's start", () => {
    // Scrubbed from turn 1 to turn 7: the pawn stands at 3, the last move began at 10.
    expect(planWalk(3, 12, move.path, move)).toEqual({ kind: "snap" });
    // Same when the replay says "don't walk" (jump or step back).
    expect(planWalk(3, 12, move.path, null)).toEqual({ kind: "snap" });
  });

  it("snaps when stepping back instead of walking the undone move forwards", () => {
    // Going back from the end of the move (12) to its start (10): the walk is withheld.
    expect(planWalk(12, 10, undefined, null)).toEqual({ kind: "snap" });
    // Even if a stale move is handed over, it doesn't end at the new cell.
    expect(planWalk(12, 10, move.path, move)).toEqual({ kind: "snap" });
  });

  it("doesn't glide through walls when the piece is out of place but the cell matches the move's end", () => {
    expect(planWalk(20, 12, move.path, move)).toEqual({ kind: "snap" });
  });

  it("stays put when nothing changes", () => {
    expect(planWalk(12, 12, undefined, null)).toEqual({ kind: "stay" });
    expect(planWalk(12, 12, move.path, move)).toEqual({ kind: "stay" });
  });

  it("plays an out-and-back (ends where it began) when its replay step fires", () => {
    const loop = { from: 10, path: [11, 10] };
    expect(planWalk(10, 10, loop.path, loop, true)).toEqual({ kind: "walk", cells: [11, 10] });
  });

  it("doesn't replay an out-and-back on a re-render of the same step", () => {
    const loop = { from: 10, path: [11, 10] };
    expect(planWalk(10, 10, loop.path, loop, false)).toEqual({ kind: "stay" });
  });

  it("doesn't play an out-and-back for a piece that wasn't at its start", () => {
    const loop = { from: 10, path: [11, 10] };
    expect(planWalk(10, 10, loop.path, null, true)).toEqual({ kind: "stay" });
  });
});
