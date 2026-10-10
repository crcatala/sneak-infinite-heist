import { describe, expect, it } from "vitest";
import { previewFocus, previewRoute, showsCount } from "../src/client/game/movePreview";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { cellOf, getBoard, type Cell } from "../src/shared/board/model";
import { detectiveDestinations } from "../src/shared/board/paths";

const board = getBoard(CLASSIC_BOARD);
const c = (x: number, y: number): Cell => cellOf(board, x, y);

const start = c(4, 6);
const ends = detectiveDestinations(board, start, 2, [], false);
const two = [...ends].find(([, n]) => n === 2)![0];
const one = [...ends].find(([, n]) => n === 1)![0];
const offPath = c(1, 1);

describe("previewFocus", () => {
  it("follows the pointer while it's on a legal end, over the selected destination", () => {
    expect(previewFocus(ends, one, two)).toBe(one);
  });

  it("falls back to the selected destination when the pointer is off the legal ends", () => {
    expect(ends.has(offPath)).toBe(false);
    expect(previewFocus(ends, offPath, two)).toBe(two);
    expect(previewFocus(ends, null, two)).toBe(two);
  });

  it("keeps the selection once the pointer leaves the board", () => {
    expect(previewFocus(ends, null, one)).toBe(one);
  });

  it("has no focus with no hover and no selection", () => {
    expect(previewFocus(ends, null, null)).toBeNull();
  });
});

describe("previewRoute", () => {
  it("draws the shortest route to a legal end, ending on it", () => {
    const route = previewRoute(board, start, two, ends, false)!;
    expect(route).toHaveLength(2);
    expect(route.at(-1)).toBe(two);
    expect(board.neighbours[start]).toContain(route[0]);
  });

  it("draws the out-and-back the engine animates when the pawn ends where it started (no stay rule)", () => {
    expect(previewRoute(board, start, start, ends, false)).toEqual([board.neighbours[start][0], start]);
  });

  it("draws nothing for a stay when the stay rule is on", () => {
    const staying = detectiveDestinations(board, start, 2, [], true);
    expect(previewRoute(board, start, start, staying, true)).toBeNull();
  });

  it("draws nothing without a focus, or for a focus that isn't a legal end", () => {
    expect(previewRoute(board, start, null, ends, false)).toBeNull();
    expect(previewRoute(board, start, offPath, ends, false)).toBeNull();
  });
});

describe("showsCount", () => {
  it("shows on the pointer's end and on the selected destination", () => {
    expect(showsCount(one, 1, one, null)).toBe(true);
    expect(showsCount(two, 2, null, two)).toBe(true);
  });

  it("hides on other ends", () => {
    expect(showsCount(two, 2, one, null)).toBe(false);
  });

  it("never shows a 0-step stay, even when hovered or selected", () => {
    expect(showsCount(start, 0, start, null)).toBe(false);
    expect(showsCount(start, 0, null, start)).toBe(false);
  });
});
