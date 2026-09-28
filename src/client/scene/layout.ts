// Board ↔ world coordinates. One cell = one world unit; the board is centred on the origin with
// north (y = 0) pointing to −z, so the default camera looks "up" the board from the front stairs.

import * as THREE from "three";
import { xyOf, type Board, type Cell } from "../../shared/board/model";

export const FLOOR_Y = 0.12;
export const WALL_H = 0.5;
export const WALL_T = 0.13;

export function cellXZ(board: Board, c: Cell): [number, number] {
  const [x, y] = xyOf(board, c);
  return [x - (board.width - 1) / 2, y - (board.height - 1) / 2];
}

export function gridXZ(board: Board, x: number, y: number): [number, number] {
  return [x - (board.width - 1) / 2, y - (board.height - 1) / 2];
}

export function cellPos(board: Board, c: Cell, y = FLOOR_Y): THREE.Vector3 {
  const [x, z] = cellXZ(board, c);
  return new THREE.Vector3(x, y, z);
}

/** The cell under a world point, or null. */
export function cellAtWorld(board: Board, x: number, z: number): Cell | null {
  const gx = Math.round(x + (board.width - 1) / 2);
  const gy = Math.round(z + (board.height - 1) / 2);
  if (gx < 0 || gy < 0 || gx >= board.width || gy >= board.height) return null;
  return gy * board.width + gx;
}
