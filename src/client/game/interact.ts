// Direct manipulation of the board: what's highlighted, what a click does, and why a click is
// refused. Derived from the viewer's own view and the local UI state only.

import { useMemo } from "react";
import { getBoard, type Board, type Cell } from "../../shared/board/model";
import { shortestPath } from "../../shared/board/paths";
import { deduce } from "../../shared/game/deduce";
import { occupancy as _unused, placementProblem, type Occupancy } from "../../shared/game/setup";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import type { Tile } from "../scene/Overlays";
import { sfx } from "../sfx";
import { useStore } from "../store";
import { activePawn, dangerCells, detectiveEnds, pawnHex, thiefEnds } from "./derive";
import { useFx } from "./present";
import { useGameUi, type GameUi } from "./uiStore";

void _unused;

export const COLOURS = {
  reach: "#ffc14d",
  path: "#fff1b8",
  bad: "#ff4d6d",
  danger: "#ff6b81",
  sight: "#6fe8ff",
  miss: "#9a98b8",
  heat: "#b57bff",
  legal: "#4fe0b0",
  mark: "#ff9f43",
};

/** A hex colour scaled toward black: the legal-move outline sits a shade under the colour it belongs to. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * k).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The dashed legal-move outline for a mover's colour: a shade darker, so it reads as theirs without matching a selected fill. */
const legalOutline = (hex: string) => shade(hex, 0.8);

export type Mode =
  | { kind: "watch"; reason: string }
  | { kind: "setupLocks" }
  | { kind: "setupPieces"; piece: "painting" | "camera" }
  | { kind: "setupPawns" }
  | { kind: "thiefEntry" }
  | { kind: "thiefMove"; start: Cell }
  | { kind: "detRoll" }
  | { kind: "detAct"; canMove: boolean; canAct: boolean }
  | { kind: "motionPrompt" }
  | { kind: "over" };

export function modeOf(view: RoomView, game: GameView, plan: GameUi["plan"]): Mode {
  const me = view.you;
  const board = getBoard(game.board);
  if (game.phase === "roundOver") return { kind: "over" };
  if (game.phase.startsWith("setup")) {
    if (view.role !== "detective") return { kind: "watch", reason: "The detectives are setting the trap. Watch closely!" };
    if (game.phase === "setupLocks") return { kind: "setupLocks" };
    if (game.phase === "setupPaintings") return { kind: "setupPieces", piece: "painting" };
    if (game.phase === "setupCameras") return { kind: "setupPieces", piece: "camera" };
    return { kind: "setupPawns" };
  }
  const t = game.turn;
  if (view.role === "thief") {
    if (t.kind === "detective" && t.awaitingThief) return { kind: "motionPrompt" };
    if (t.kind !== "thief") return { kind: "watch", reason: "" };
    if (game.thief.cell === null) {
      if (!plan.entry) return { kind: "thiefEntry" };
      return { kind: "thiefMove", start: board.slotById[plan.entry].inside };
    }
    return { kind: "thiefMove", start: game.thief.cell };
  }
  if (t.kind === "detective") {
    const pawn = game.detectives.find((d) => d.id === t.pawn);
    if (pawn?.controller === me && !t.awaitingThief) {
      if (!t.roll) return { kind: "detRoll" };
      return { kind: "detAct", canMove: !t.moved, canAct: !t.acted };
    }
  }
  return { kind: "watch", reason: "" };
}

function occ(game: GameView): Occupancy {
  return {
    paintings: game.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell),
    cameras: game.cameras.map((c) => c.cell),
    detectives: game.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell])),
  };
}

/** Where a secondary press landed: board-grid units (cell centres are whole numbers), plus the modifier. */
export interface PressAt {
  x: number;
  y: number;
  /** Shift held: toggle a suspect mark instead of dropping a pointer pin. */
  mark: boolean;
}

export interface BoardInteraction {
  mode: Mode;
  tiles: Tile[];
  badges: { cell: Cell; n: number | string; colour?: string }[];
  markers: { cell: Cell; label: string; colour: string }[];
  /** Ghost thief positions (thief's own view). */
  ghosts: Cell[];
  /** A detective pawn previewed at a new cell. */
  pawnGhost: { pawn: string; cell: Cell } | null;
  /** The route previewed for the focused destination; dots take the mover's colour (the thief's default amber). */
  path: { from: Cell; path: Cell[]; colour?: string } | null;
  /** Explanation for the hovered cell, if it's not a legal target. */
  hoverReason: string | null;
  click: (cell: Cell) => void;
  context: (cell: Cell, at: PressAt) => void;
}

export function useBoardInteraction(view: RoomView, game: GameView): BoardInteraction {
  const ui = useGameUi();
  const fx = useFx();
  const send = useStore((s) => s.send);
  const toast = useStore((s) => s.toast);
  const board = getBoard(game.board);
  const mode = modeOf(view, game, ui.plan);
  const act = (action: Parameters<typeof send>[0] extends infer M ? (M extends { t: "game"; action: infer A } ? A : never) : never) => send({ t: "game", action });

  const heat = useMemo(() => {
    if (view.role === "thief" || game.rules.assist !== "overlay" || game.phase !== "play") return null;
    return deduce(game.board, game.events);
  }, [view.role, game.rules.assist, game.phase, game.board, game.events]);

  return useMemo<BoardInteraction>(() => {
    const tiles: Tile[] = [];
    const badges: BoardInteraction["badges"] = [];
    const markers: BoardInteraction["markers"] = [];
    const ghosts: Cell[] = [];
    let pawnGhost: BoardInteraction["pawnGhost"] = null;
    let path: BoardInteraction["path"] = null;
    let hoverReason: string | null = null;
    let click: (cell: Cell) => void = () => {};
    let context: BoardInteraction["context"] = () => {};
    const hover = ui.hover;
    const o = occ(game);
    const refuse = (reason: string) => {
      sfx.error();
      toast(reason, "error");
    };

    // Always-on layers: heat, marks, last seen, camera hint, danger.
    if (heat && ui.heat && !game.thief.revealed) {
      const max = Math.max(...heat.weights.values(), 0.0001);
      for (const [c, w] of heat.weights) tiles.push({ cell: c, colour: COLOURS.heat, alpha: 0.12 + 0.45 * (w / max) });
    }
    if (view.role === "thief" && ui.danger && game.phase === "play") {
      // Corner brackets rather than a fill: the room colour underneath stays readable and the amber move tiles stay clean.
      for (const c of dangerCells(game)) tiles.push({ cell: c, colour: COLOURS.danger, alpha: 0.7, style: 3 });
    }
    if (fx.hint) for (const c of fx.hint.cells) tiles.push({ cell: c, colour: COLOURS.sight, alpha: 0.28, style: 1, pulse: true });
    for (const c of game.marks) markers.push({ cell: c, label: "?", colour: COLOURS.mark });
    if (game.lastSeen && !game.thief.revealed && game.phase === "play" && view.role !== "thief") {
      const ago = game.thief.turns - game.lastSeen.atThiefTurn;
      markers.push({ cell: game.lastSeen.cell, label: ago === 0 ? "!" : String(ago), colour: "#ff6b81" });
    }

    const canMark = view.role === "detective" && game.rules.assist !== "off";
    const toggleMark = (cell: Cell) => {
      if (!canMark || !board.region[cell]) return;
      act({ a: "mark", cell, on: !game.marks.includes(cell) });
      sfx.markPencil();
    };
    // Secondary press (right-click / long-press): a pointer pin for the other detectives, dropped
    // exactly where you pointed; Shift keeps the old persistent suspect mark on the cell.
    const canPin = view.role === "detective" && game.phase !== "roundOver";
    const dropPin = ({ x, y }: PressAt) => {
      if (!canPin) return;
      send({ t: "pin", x, y });
      sfx.pinDrop();
    };
    context = (cell, at) => (at.mark || ui.pointerMode === "mark" ? toggleMark(cell) : dropPin(at));

    switch (mode.kind) {
      case "setupLocks": {
        click = (cell) => {
          const slot = board.slots.find((s) => s.cell === cell || s.inside === cell);
          if (!slot) return;
          const lock = game.locks.find((l) => l.slot === slot.id);
          const next = lock?.face === "open" ? "locked" : lock?.face === "locked" ? null : "open";
          act({ a: "setLock", slot: slot.id, face: next });
          sfx.lockClunk();
        };
        for (const s of board.slots) tiles.push({ cell: s.inside, colour: COLOURS.legal, alpha: 0.2, style: 2 });
        break;
      }
      case "setupPieces": {
        const kind = mode.piece;
        const pieces = kind === "painting" ? o.paintings : o.cameras;
        const held = ui.held?.kind === "piece" ? ui.held.from : null;
        const problemAt = (c: Cell) => placementProblem(board, kind, c, o, held ?? undefined);
        if (held !== null || pieces.length < (kind === "painting" ? 9 : 6)) {
          for (const c of board.walkable) if (!pieces.includes(c) && problemAt(c) === null) tiles.push({ cell: c, colour: COLOURS.legal, alpha: 0.16 });
        }
        if (held !== null) tiles.push({ cell: held, colour: COLOURS.reach, alpha: 0.6, style: 2, pulse: true });
        if (hover !== null && board.region[hover]) {
          const onPiece = pieces.includes(hover);
          const problem = onPiece && held === null ? null : problemAt(hover);
          hoverReason = problem;
          tiles.push({ cell: hover, colour: problem ? COLOURS.bad : COLOURS.reach, alpha: 0.55 });
        }
        click = (cell) => {
          if (held !== null) {
            if (cell === held) return useGameUi.getState().set({ held: null });
            const problem = problemAt(cell);
            if (problem) return refuse(problem);
            act({ a: "movePiece", from: held, to: cell });
            useGameUi.getState().set({ held: null });
            sfx.place();
            return;
          }
          if (pieces.includes(cell)) {
            useGameUi.getState().set({ held: { kind: "piece", from: cell } });
            sfx.lift();
            return;
          }
          const problem = placementProblem(board, kind, cell, o);
          if (problem) return refuse(problem);
          act({ a: "place", cell });
          sfx.place();
        };
        context = (cell, at) => {
          if (!pieces.includes(cell)) return dropPin(at);
          act({ a: "remove", cell });
          useGameUi.getState().set({ held: null });
          sfx.lift();
        };
        break;
      }
      case "setupPawns": {
        const mine = game.detectives.filter((d) => d.controller === view.you);
        const heldPawn = ui.held?.kind === "pawn" ? ui.held.pawn : (mine.find((d) => d.cell === null) ?? game.detectives.find((d) => d.cell === null))?.id ?? null;
        const pawn = game.detectives.find((d) => d.id === heldPawn);
        const problemAt = (c: Cell) => placementProblem(board, "detective", c, o, pawn?.cell ?? undefined);
        if (pawn) for (const c of board.walkable) if (problemAt(c) === null) tiles.push({ cell: c, colour: COLOURS.legal, alpha: 0.14 });
        if (pawn?.cell != null) tiles.push({ cell: pawn.cell, colour: COLOURS.reach, alpha: 0.6, style: 2, pulse: true });
        if (hover !== null && board.region[hover] && pawn) {
          const problem = game.detectives.some((d) => d.cell === hover) ? null : problemAt(hover);
          hoverReason = problem;
          tiles.push({ cell: hover, colour: problem ? COLOURS.bad : COLOURS.reach, alpha: 0.55 });
          if (!problem) pawnGhost = { pawn: pawn.id, cell: hover };
        }
        click = (cell) => {
          const there = game.detectives.find((d) => d.cell === cell);
          if (there && there.id !== pawn?.id) {
            useGameUi.getState().set({ held: { kind: "pawn", pawn: there.id } });
            sfx.lift();
            return;
          }
          if (!pawn) return;
          const problem = problemAt(cell);
          if (problem) return refuse(problem);
          act({ a: "placeDetective", pawn: pawn.id, cell });
          useGameUi.getState().set({ held: null });
          sfx.place();
        };
        break;
      }
      case "thiefEntry": {
        const hovered = ui.hoverSlot ? board.slotById[ui.hoverSlot] : null;
        for (const s of board.slots) tiles.push({ cell: s.inside, colour: COLOURS.reach, alpha: hovered?.id === s.id ? 0.7 : 0.3, style: 2, pulse: !hovered });
        if (hovered) for (const c of thiefEnds(game, hovered.inside).keys()) tiles.push({ cell: c, colour: legalOutline(COLOURS.reach), alpha: 0.7, style: 5 });
        click = (cell) => {
          const slot = board.slots.find((s) => s.cell === cell || s.inside === cell);
          if (!slot) return refuse("Pick one of the 11 windows or doors (the padlock plinths) to sneak in.");
          useGameUi.getState().set({ plan: { ...useGameUi.getState().plan, entry: slot.id, dest: null, path: null } });
          sfx.menuSelect();
        };
        break;
      }
      case "thiefMove": {
        const ends = thiefEnds(game, mode.start);
        ghosts.push(mode.start);
        for (const c of ends.keys()) {
          const selected = ui.plan.dest === c;
          tiles.push({ cell: c, colour: selected ? COLOURS.reach : legalOutline(COLOURS.reach), alpha: selected ? 0.8 : 0.85, style: selected ? 0 : 5, lift: 0.004 });
        }
        // A legal move that ends in view: heavier brackets over the amber, so "I can go there, but I'd be seen" reads at a glance.
        if (ui.danger && game.phase === "play") {
          const watched = dangerCells(game);
          for (const c of ends.keys()) if (watched.has(c)) tiles.push({ cell: c, colour: COLOURS.danger, alpha: 1, style: 4, lift: 0.008 });
        }
        const focusCell = hover !== null && ends.has(hover) ? hover : ui.plan.dest;
        if (focusCell !== null && ends.has(focusCell)) {
          path = { from: mode.start, path: focusCell === ui.plan.dest && ui.plan.path ? ui.plan.path : ends.get(focusCell)! };
        }
        if (ui.plan.dest !== null) ghosts.push(ui.plan.dest);
        if (hover !== null && board.region[hover] && !ends.has(hover)) {
          hoverReason =
            hover === mode.start
              ? "You have to move: end somewhere new."
              : game.detectives.some((d) => d.cell === hover)
                ? "A detective is standing there. You'd be caught!"
                : "Too far: the thief moves 1 to 3 spaces.";
          tiles.push({ cell: hover, colour: COLOURS.bad, alpha: 0.4 });
        }
        click = (cell) => {
          const slot = game.thief.cell === null ? board.slots.find((s) => s.cell === cell) : null;
          if (slot) {
            useGameUi.getState().set({ plan: { ...useGameUi.getState().plan, entry: slot.id, dest: null, path: null } });
            sfx.menuSelect();
            return;
          }
          if (!ends.has(cell)) {
            if (board.region[cell]) refuse(cell === mode.start ? "You have to move: end somewhere new." : game.detectives.some((d) => d.cell === cell) ? "A detective is standing there. You'd be caught!" : "Too far: the thief moves 1 to 3 spaces.");
            return;
          }
          const plan = useGameUi.getState().plan;
          const painting = game.paintings.find((p) => p.cell === cell && p.status === "hanging");
          const slotHere = board.slotByInside.get(cell);
          const lock = slotHere && game.locks.find((l) => l.slot === slotHere.id);
          const haul = (game.thief.haul ?? 0) + (painting ? 1 : 0);
          useGameUi.getState().set({
            plan: {
              ...plan,
              dest: cell,
              path: ends.get(cell)!,
              disableCamera: game.cameras.some((c) => c.cell === cell && !c.disabled),
              cutPower: cell === board.power && !game.power.cut,
              tryLock: !!lock && !lock.revealed && haul >= game.rules.minPaintingsToEscape,
            },
          });
          sfx.menuMove();
        };
        break;
      }
      case "detAct": {
        const pawn = activePawn(game)!;
        const turn = game.turn as Extract<GameView["turn"], { kind: "detective" }>;
        if (mode.canMove) {
          const ends = detectiveEnds(game, pawn, turn.roll!.move);
          const owner = pawnHex(game, pawn.id);
          // The path and step count follow the pointer when it's on a legal end, otherwise the selected destination.
          const focus = hover !== null && ends.has(hover) ? hover : ui.moveDest;
          for (const [c, n] of ends) {
            const selected = ui.moveDest === c;
            tiles.push({ cell: c, colour: selected ? owner : legalOutline(owner), alpha: selected ? 0.75 : 0.85, style: selected ? 0 : 5 });
            // A stay (0 steps, on the pawn's own cell) gets no count: it's redundant.
            if ((c === hover || c === ui.moveDest) && n > 0) badges.push({ cell: c, n, colour: owner });
          }
          if (focus !== null && focus !== pawn.cell && ends.has(focus)) path = { from: pawn.cell!, path: shortestPath(board, pawn.cell!, focus), colour: owner };
          if (ui.moveDest !== null) pawnGhost = { pawn: pawn.id, cell: ui.moveDest };
          if (hover !== null && board.region[hover] && !ends.has(hover)) {
            hoverReason = game.paintings.some((p) => p.cell === hover && p.status !== "stolen")
              ? "Detectives can't end on a painting."
              : game.detectives.some((d) => d.cell === hover && d.id !== pawn.id)
                ? "Another detective is already there."
                : hover === pawn.cell
                  ? "You rolled a 1: you have to move."
                  : `Too far: you rolled ${turn.roll!.move}.`;
            tiles.push({ cell: hover, colour: COLOURS.bad, alpha: 0.4 });
          }
          click = (cell) => {
            if (!ends.has(cell)) {
              if (board.region[cell]) refuse(hoverReasonFor(cell));
              return;
            }
            if (useGameUi.getState().moveDest === cell) {
              act({ a: "move", dest: cell });
              useGameUi.getState().set({ moveDest: null });
            } else {
              useGameUi.getState().set({ moveDest: cell });
              sfx.menuMove();
            }
          };
          const hoverReasonFor = (cell: Cell) =>
            game.paintings.some((p) => p.cell === cell && p.status !== "stolen") ? "Detectives can't end on a painting." : game.detectives.some((d) => d.cell === cell && d.id !== pawn.id) ? "Another detective is already there." : `Too far: you rolled ${turn.roll!.move}.`;
        }
        if (mode.canAct && ui.eyePreview !== null) {
          const from = ui.eyePreview === "self" ? (ui.moveDest ?? pawn.cell!) : game.cameras.find((c) => c.n === ui.eyePreview)?.cell;
          if (from !== undefined && from !== null) for (const c of board.sight[from]) tiles.push({ cell: c, colour: COLOURS.sight, alpha: 0.4 });
        }
        break;
      }
      default:
        break;
    }

    // Flashes from the event player.
    const now = performance.now();
    for (const f of fx.flashes) {
      if (f.until < now) continue;
      if (f.kind === "sightHit") for (const c of f.cells) tiles.push({ cell: c, colour: COLOURS.bad, alpha: 0.55, pulse: true });
      if (f.kind === "sightMiss") for (const c of f.cells) tiles.push({ cell: c, colour: COLOURS.miss, alpha: 0.35 });
      if (f.kind === "colour") for (const c of f.cells) tiles.push({ cell: c, colour: "#ffffff", alpha: 0.4, pulse: true });
      if (f.kind === "ping") for (const c of f.cells) tiles.push({ cell: c, colour: COLOURS.bad, alpha: 0.7, style: 2, pulse: true });
    }

    return { mode, tiles, badges, markers, ghosts, pawnGhost, path, hoverReason, click, context };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, game, ui.hover, ui.hoverSlot, ui.held, ui.plan, ui.moveDest, ui.eyePreview, ui.pointerMode, ui.danger, ui.heat, fx.flashes, fx.hint, heat, mode.kind]);
}

export function boardFor(game: GameView): Board {
  return getBoard(game.board);
}
