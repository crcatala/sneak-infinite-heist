// Pure helpers over the viewer's GameView: who's who, whose turn it is, where things can move, and
// the thief's "hot cells". Everything here only uses what the viewer already knows.

import { coverage } from "../../shared/board/los";
import { getBoard, regionName, type Board, type Cell } from "../../shared/board/model";
import { detectiveDestinations, thiefDestinations } from "../../shared/board/paths";
import { character } from "../../shared/characters";
import type { DetectivePawn } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";

export function boardOf(game: GameView): Board {
  return getBoard(game.board);
}

export function playerName(view: RoomView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? "Someone";
}

export function pawnName(game: GameView, pawnId: string): string {
  const p = game.detectives.find((d) => d.id === pawnId);
  return p ? character(p.character).short : "A detective";
}

export function pawnHex(game: GameView, pawnId: string): string {
  const p = game.detectives.find((d) => d.id === pawnId);
  return p ? character(p.character).hex : "#8fb0ff";
}

export function activePawn(game: GameView): DetectivePawn | null {
  const t = game.turn;
  return t.kind === "detective" ? (game.detectives.find((d) => d.id === t.pawn) ?? null) : null;
}

export function slotLabel(board: Board, id: string): string {
  const s = board.slotById[id];
  if (!s) return id.toUpperCase();
  const room = board.region[s.inside] === "C" ? "" : ` · ${regionName(board, board.region[s.inside]!)}`;
  const side = { n: "north", s: "south", e: "east", w: "west" }[s.side];
  if (s.kind === "door") return `${s.id === "f" || s.id === "g" ? "front" : side} door ${id.toUpperCase()}`;
  return `${side} window ${id.toUpperCase()}${room}`;
}

export function cellLabel(board: Board, c: Cell): string {
  const r = board.region[c];
  return r ? regionName(board, r) : "outside";
}

/** Where the thief could end this turn from `start` (the entry's inside cell on the first turn). */
export function thiefEnds(game: GameView, start: Cell): Map<Cell, Cell[]> {
  return thiefDestinations(boardOf(game), start, game.detectives.map((d) => d.cell!).filter((c) => c !== null));
}

export function detectiveEnds(game: GameView, pawn: DetectivePawn, steps: number): Map<Cell, number> {
  const blocked = [...game.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell), ...game.detectives.filter((d) => d.id !== pawn.id && d.cell !== null).map((d) => d.cell!)];
  return detectiveDestinations(boardOf(game), pawn.cell!, steps, blocked, game.rules.detectiveMayStay);
}

/** Cells any detective or working camera can see right now (the thief's danger overlay). */
export function dangerCells(game: GameView): Set<Cell> {
  const board = boardOf(game);
  const viewers = game.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell]));
  if (!game.power.cut) for (const c of game.cameras) if (!c.disabled) viewers.push(c.cell);
  return coverage(board, viewers);
}

/** Sightline cells of a detective or camera cell. */
export function sightOf(game: GameView, from: Cell): Cell[] {
  return boardOf(game).sight[from] ?? [];
}
