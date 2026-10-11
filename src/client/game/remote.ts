// Watching other detectives think. A detective's pending choice (a picked space, an Eye target, a lifted piece)
// is sent to the room as an `intent`; this turns what arrives, plus the public roll, into board overlays. Pure,
// so the rules for what shows (and when a stale intent is ignored) are testable without the 3D scene.

import { getBoard, type Cell } from "../../shared/board/model";
import { character } from "../../shared/characters";
import type { DetectivePawn } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";
import type { Intent, RoomView } from "../../shared/protocol";
import type { Tile } from "../scene/Overlays";
import { COLOURS, legalOutline } from "./colours";
import { activePawn, detectiveEnds, pawnName, playerName } from "./derive";
import { previewRoute } from "./movePreview";
import type { GameUi } from "./uiStore";

/** A short name tag floating over a cell, in the colour of whoever is choosing. */
export interface RemoteTag {
  cell: Cell;
  text: string;
  colour: string;
}

export interface RemotePreview {
  tiles: Tile[];
  badges: { cell: Cell; n: number | string; colour?: string }[];
  tags: RemoteTag[];
  path: { from: Cell; path: Cell[]; colour?: string } | null;
  pawnGhost: { pawn: string; cell: Cell } | null;
}

export const NO_PREVIEW: RemotePreview = { tiles: [], badges: [], tags: [], path: null, pawnGhost: null };

type Setup = "setupPaintings" | "setupCameras" | "setupDetectives";

/**
 * What the viewer's own pending choice looks like to everyone else, or null when there's nothing to show.
 * Only deliberate choices count: hovering never does, and neither does the pawn setup auto-selects for you.
 */
export function intentToSend(view: RoomView, game: GameView, ui: Pick<GameUi, "moveDest" | "eyeTarget" | "held">): Intent | null {
  if (view.role !== "detective" || game.phase === "roundOver") return null;
  if (game.phase === "play") {
    const t = game.turn;
    if (t.kind !== "detective" || t.awaitingThief || !t.roll) return null;
    const pawn = activePawn(game);
    if (pawn?.controller !== view.you) return null;
    const move = !t.moved && ui.moveDest !== null ? ui.moveDest : undefined;
    const eye = !t.acted && t.roll.action === "eye" && ui.eyeTarget !== null ? ui.eyeTarget : undefined;
    return move === undefined && eye === undefined ? null : { k: "turn", pawn: pawn.id, ...(move !== undefined ? { move } : {}), ...(eye !== undefined ? { eye } : {}) };
  }
  const held = ui.held;
  if (!held) return null;
  if (held.kind === "pawn") return game.phase === "setupDetectives" ? { k: "liftPawn", pawn: held.pawn } : null;
  if (game.phase === "setupPaintings") return { k: "lift", piece: "painting", cell: held.from };
  if (game.phase === "setupCameras") return { k: "lift", piece: "camera", cell: held.from };
  return null;
}

const hexOf = (pawn: DetectivePawn) => character(pawn.character).hex;

/** The colour of a player's first pawn: who a lifted painting or camera belongs to, visually. */
function playerHex(game: GameView, playerId: string): string | null {
  const pawn = game.detectives.find((d) => d.controller === playerId);
  return pawn ? hexOf(pawn) : null;
}

const plural = (n: number) => `${n} step${n === 1 ? "" : "s"}`;

/**
 * Everything the viewer should see of other detectives' choices. `watched` is the thief's danger overlay
 * (so a dashed outline over a watched space leaves room for the brackets).
 *
 * Intents are checked against the viewer's own view, because they are only hints: one that no longer fits
 * (wrong turn, a space the pawn can't reach, a piece that isn't there) is silently ignored.
 */
export function remotePreview(view: RoomView, game: GameView, intents: Record<string, Intent>, watched: ReadonlySet<Cell>): RemotePreview {
  if (game.phase === "roundOver") return NO_PREVIEW;
  const out: RemotePreview = { tiles: [], badges: [], tags: [], path: null, pawnGhost: null };
  const board = getBoard(game.board);

  // Everyone sees where the detective on the move could end up, as soon as the roll lands.
  const mover = activePawn(game);
  const t = game.turn;
  const turn = t.kind === "detective" ? t : null;
  const rolled = game.phase === "play" && mover && mover.cell !== null && turn?.roll && !turn.moved && !turn.awaitingThief ? turn.roll : null;
  const ends = mover && rolled ? detectiveEnds(game, mover, rolled.move) : null;
  if (ends && mover && mover.controller !== view.you) {
    for (const c of ends.keys()) out.tiles.push({ cell: c, colour: legalOutline(hexOf(mover)), alpha: 0.85, style: watched.has(c) ? 6 : 5 });
  }

  for (const [by, intent] of Object.entries(intents)) {
    if (by === view.you || !view.players.some((p) => p.id === by && p.connected)) continue;
    const who = playerName(view, by);

    if (intent.k === "turn") {
      if (!ends || !mover || !turn || mover.id !== intent.pawn || mover.controller !== by) continue;
      const colour = hexOf(mover);
      let tagCell = mover.cell!;
      let tagText: string | null = null;
      const move = intent.move !== undefined && ends.has(intent.move) ? intent.move : undefined;
      if (move !== undefined) {
        const steps = ends.get(move)!;
        out.tiles.push({ cell: move, colour, alpha: 0.75, style: 0 });
        if (steps > 0) out.badges.push({ cell: move, n: steps, colour });
        const route = previewRoute(board, mover.cell!, move, ends, game.rules.detectiveMayStay);
        if (route) out.path = { from: mover.cell!, path: route, colour };
        out.pawnGhost = { pawn: mover.id, cell: move };
        tagCell = move;
        tagText = steps > 0 ? `${who} · ${plural(steps)}` : `${who} · staying`;
      }
      const eye = intent.eye;
      if (eye !== undefined && !turn.acted && turn.roll?.action === "eye") {
        const camera = typeof eye === "number" ? game.cameras.find((c) => c.n === eye) : undefined;
        const from = eye === "self" ? tagCell : camera?.cell;
        if (from !== undefined && !(typeof eye === "number" && game.power.cut)) {
          for (const c of board.sight[from] ?? []) out.tiles.push({ cell: c, colour: COLOURS.sight, alpha: 0.4 });
          const eyeText = eye === "self" ? "Eye" : `asking camera ${eye}`;
          if (eye === "self" && tagText) tagText += ` · ${eyeText}`;
          else {
            if (tagText) out.tags.push({ cell: tagCell, text: tagText, colour });
            tagCell = from;
            tagText = `${who} · ${eyeText}`;
          }
        }
      }
      if (tagText) out.tags.push({ cell: tagCell, text: tagText, colour });
      continue;
    }

    if (intent.k === "lift") {
      const phase: Setup = intent.piece === "painting" ? "setupPaintings" : "setupCameras";
      const there = intent.piece === "painting" ? game.paintings.some((p) => p.cell === intent.cell && p.status !== "stolen") : game.cameras.some((c) => c.cell === intent.cell);
      if (game.phase !== phase || !there) continue;
      const colour = playerHex(game, by) ?? COLOURS.reach;
      out.tiles.push({ cell: intent.cell, colour, alpha: 0.6, style: 2, pulse: true });
      out.tags.push({ cell: intent.cell, text: `${who} is moving a ${intent.piece}`, colour });
      continue;
    }

    // liftPawn
    const pawn = game.detectives.find((d) => d.id === intent.pawn);
    if (game.phase !== "setupDetectives" || !pawn || pawn.cell === null) continue;
    const colour = hexOf(pawn);
    out.tiles.push({ cell: pawn.cell, colour, alpha: 0.6, style: 2, pulse: true });
    out.tags.push({ cell: pawn.cell, text: `${who} is moving ${pawnName(game, pawn.id)}`, colour });
  }
  return out;
}
