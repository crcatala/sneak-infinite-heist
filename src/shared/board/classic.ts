// The classic museum, verbatim from docs/research/game-analysis.md §3 (cross-checked against the
// thief's plotting pad and photos of the physical board). Coordinates are [x, y]: x = column 0–13
// (west → east), y = row 0–11 (north → south).
//
// Legend: R red gallery · U purple gallery · B blue gallery · Y gold gallery · G green gallery ·
// W white atrium · C corridor · S small grey storeroom · X power room · P power switch (part of X) ·
// a–k lock/entry slots (plinths, not walkable) · . outside.

import type { BoardDef } from "./model";

export const BOARD = [
  //  x: 0123456789abcd   (a=10 b=11 c=12 d=13)
  ".....a..b.....", // y0
  "....RRRRRR....", // y1
  "....RRRRRR.c..", // y2
  ".UUUCCCCCCBBB.", // y3
  "kUUUCWWWWCBBB.", // y4
  ".UUUCWWWWCCCd.", // y5
  ".jCCCWWWWCGGG.", // y6
  ".YYYCWWWWCGGG.", // y7
  "iYYYCWWWWCGGGe", // y8
  ".YYYCCCCCCGGG.", // y9
  "..h.SSCCXX....", // y10
  "....SSgfXP....", // y11
];

/** The 14 doorways between regions. Everything else between two different regions is a wall. */
export const OPENINGS: [[number, number], [number, number]][] = [
  [[5, 2], [5, 3]], [[8, 2], [8, 3]], // Red ↔ corridor (2)
  [[6, 3], [6, 4]], [[7, 3], [7, 4]], // corridor ↔ White, north side (2)
  [[6, 8], [6, 9]], [[7, 8], [7, 9]], // White ↔ corridor, south side (2)
  [[4, 7], [5, 7]], [[8, 6], [9, 6]], // White west / east (1 each)
  [[3, 5], [4, 5]], //                   Purple ↔ corridor
  [[9, 4], [10, 4]], //                  corridor ↔ Blue
  [[3, 8], [4, 8]], //                   Gold ↔ corridor
  [[9, 8], [10, 8]], //                  corridor ↔ Green
  [[5, 9], [5, 10]], //                  corridor ↔ small grey room
  [[9, 9], [9, 10]], //                  corridor ↔ Power Room
];

/** The 11 lock/entry slots (7 windows, 4 doors). Each has exactly one inside cell. */
export const SLOTS: BoardDef["slots"] = [
  { id: "a", cell: [5, 0], kind: "window", inside: [5, 1] }, //  north wall of Red
  { id: "b", cell: [8, 0], kind: "window", inside: [8, 1] }, //  north wall of Red
  { id: "c", cell: [11, 2], kind: "window", inside: [11, 3] }, // north wall of Blue
  { id: "d", cell: [12, 5], kind: "door", inside: [11, 5] }, //  east side door (end of corridor stub)
  { id: "e", cell: [13, 8], kind: "window", inside: [12, 8] }, // east wall of Green
  { id: "f", cell: [7, 11], kind: "door", inside: [7, 10] }, //  front door (right), stairs outside
  { id: "g", cell: [6, 11], kind: "door", inside: [6, 10] }, //  front door (left), stairs outside
  { id: "h", cell: [2, 10], kind: "window", inside: [2, 9] }, //  south wall of Gold
  { id: "i", cell: [0, 8], kind: "window", inside: [1, 8] }, //  west wall of Gold
  { id: "j", cell: [1, 6], kind: "door", inside: [2, 6] }, //   west side door (end of corridor stub)
  { id: "k", cell: [0, 4], kind: "window", inside: [1, 4] }, //  west wall of Purple
];

export const CLASSIC_BOARD: BoardDef = {
  id: "classic",
  name: "The Grand Gallery",
  rows: BOARD,
  openings: OPENINGS,
  slots: SLOTS,
};
