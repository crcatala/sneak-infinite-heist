// Detective bot. Uses only the detectives' view: the public possible-location set from deduce.ts,
// the public board, and its own roll. Strategy:
//   - capture whenever the thief is (or may well be) within reach;
//   - otherwise take the action with the best expected information split, then move to shrink the
//     possible set (close in on its weighted centre, cover likely escape routes);
//   - the detective nearest the switch restores the power once a cut is discovered.
// Setup: paintings by auto-place, cameras and pawns placed greedily for coverage.

import { coverage } from "../board/los";
import { distance, getBoard, type Board, type Cell } from "../board/model";
import { detectiveDestinations } from "../board/paths";
import type { GameAction } from "../game/actions";
import { deduce, type Deduction } from "../game/deduce";
import { placementProblem, setupProblem, type Occupancy } from "../game/setup";
import type { DetectivePawn } from "../game/state";
import type { GameView } from "../game/views";
import type { Rng } from "../rng";

function entropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function massIn(d: Deduction, cells: Iterable<Cell>): number {
  let m = 0;
  for (const c of cells) m += d.weights.get(c) ?? 0;
  return m;
}

function occupancyOf(view: GameView): Occupancy {
  return {
    paintings: view.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell),
    cameras: view.cameras.map((c) => c.cell),
    detectives: view.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell])),
  };
}

/** The walkable cell adding the most new coverage, among legal ones. */
function bestCoverageCell(board: Board, legal: (c: Cell) => boolean, covered: Set<Cell>, rng: Rng, centrality = 0): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const c of board.walkable) {
    if (!legal(c)) continue;
    let fresh = 0;
    for (const s of board.sight[c]) if (!covered.has(s)) fresh++;
    const [x, y] = [c % board.width, Math.floor(c / board.width)];
    const central = -Math.hypot(x - board.width / 2, y - board.height / 2);
    const score = fresh + centrality * central + rng() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function setupStep(view: GameView, me: string, rng: Rng): GameAction | null {
  const board = getBoard(view.board);
  if (view.ready[me]) return null;
  const problem = setupProblem(view);
  if (view.phase === "setupCameras" && view.cameras.length < 6) {
    const occ = occupancyOf(view);
    const covered = coverage(board, occ.cameras);
    const cell = bestCoverageCell(board, (c) => placementProblem(board, "camera", c, occ) === null, covered, rng);
    return cell === null ? { a: "autoPlace" } : { a: "place", cell };
  }
  if (view.phase === "setupDetectives") {
    const pawn = view.detectives.find((d) => d.cell === null);
    if (pawn) {
      const occ = occupancyOf(view);
      const covered = coverage(board, [...occ.cameras, ...occ.detectives]);
      const cell = bestCoverageCell(board, (c) => placementProblem(board, "detective", c, occ) === null, covered, rng, 0.8);
      return cell === null ? { a: "autoPlace" } : { a: "placeDetective", pawn: pawn.id, cell };
    }
  }
  return problem ? { a: "autoPlace" } : { a: "setupReady", ready: true };
}

export function detectiveAction(view: GameView, me: string, rng: Rng): GameAction | null {
  if (view.phase.startsWith("setup")) return view.thief.controller === me ? null : setupStep(view, me, rng);
  if (view.phase !== "play") return null;
  const t = view.turn;
  if (t.kind !== "detective" || t.awaitingThief) return null;
  const pawn = view.detectives.find((d) => d.id === t.pawn)!;
  if (pawn.controller !== me) return null;
  if (!t.roll) return { a: "roll" };

  const board = getBoard(view.board);
  const d = deduce(view.board, view.events);
  const known = view.thief.revealed && view.thief.cell !== null ? view.thief.cell : d.pinned;
  const blocked = [...view.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell), ...view.detectives.filter((x) => x.id !== pawn.id).map((x) => x.cell!)];
  const ends = t.moved ? new Map<Cell, number>() : detectiveDestinations(board, pawn.cell!, t.roll.move, blocked, view.rules.detectiveMayStay);
  const powerOut = view.power.cut;

  // 1. Capture if the thief's cell (known or most likely) is reachable.
  if (!t.moved) {
    if (known !== null && ends.has(known)) return { a: "move", dest: known };
    let bestCell: Cell | null = null;
    let bestP = 0;
    for (const [c] of ends) {
      const p = d.weights.get(c) ?? 0;
      if (p > bestP) {
        bestP = p;
        bestCell = c;
      }
    }
    if (bestCell !== null && bestP >= 0.34) return { a: "move", dest: bestCell };
  }

  // 2. Actions that don't depend on where we stand go first, so the move can use the answer.
  if (!t.acted) {
    const act = t.roll.action;
    if (act === "motion" && !powerOut) return { a: "motion" };
    if (act === "scan" && !powerOut && view.cameras.length > 0) return { a: "scan" };
    if (act === "eye") {
      // Best camera by information split.
      let camBest: { n: number; info: number } | null = null;
      if (!powerOut) {
        for (const c of view.cameras) {
          const info = entropy(massIn(d, board.sight[c.cell]));
          if (!camBest || info > camBest.info) camBest = { n: c.n, info };
        }
      }
      const hereInfo = entropy(massIn(d, board.sight[pawn.cell!])) + (view.thief.revealed ? 0 : massIn(d, board.sight[pawn.cell!]) * 0.8);
      // Could moving first give a better look?
      let moveInfo = 0;
      for (const [c] of ends) moveInfo = Math.max(moveInfo, entropy(massIn(d, board.sight[c])) + massIn(d, board.sight[c]) * 0.8);
      if (!t.moved && moveInfo > Math.max(hereInfo, camBest?.info ?? 0) + 0.05) {
        // Move first to the best lookout (tie-broken by closing in), then look.
        return { a: "move", dest: pickMove(view, board, pawn, ends, d, rng, true) };
      }
      if (camBest && camBest.info > hereInfo) return { a: "eye", target: camBest.n };
      if (d.entered || view.thief.revealed) return { a: "eye", target: "self" };
    }
    if (t.moved) return { a: "skipAction" };
  }

  if (!t.moved) return { a: "move", dest: pickMove(view, board, pawn, ends, d, rng, false) };
  return { a: "endTurn" };
}

function pickMove(view: GameView, board: Board, pawn: DetectivePawn, ends: Map<Cell, number>, d: Deduction, rng: Rng, lookout: boolean): Cell {
  // The detective closest to the switch goes to restore the power.
  if (view.power.cut) {
    const mine = distance(board, pawn.cell!, board.power);
    const closest = view.detectives.every((o) => o.id === pawn.id || o.cell === null || distance(board, o.cell, board.power) >= mine);
    if (closest) {
      let best: Cell = [...ends.keys()][0];
      for (const c of ends.keys()) if (distance(board, c, board.power) < distance(board, best, board.power)) best = c;
      return best;
    }
  }
  const others = view.detectives.filter((o) => o.id !== pawn.id && o.cell !== null).map((o) => o.cell!);
  const exits = board.slots.filter((s) => !view.locks.find((l) => l.slot === s.id)?.revealed).map((s) => s.inside);
  const escapeThreat = view.thief.haul >= Math.max(1, view.rules.minPaintingsToEscape - 1);
  let best: Cell = pawn.cell!;
  let bestScore = -Infinity;
  for (const [c] of ends) {
    let score = 0;
    if (d.weights.size) {
      // Close in on the possible set (expected distance), and look along it.
      let expDist = 0;
      for (const [w, p] of d.weights) expDist += p * Math.max(0, distance(board, c, w));
      score -= expDist;
      score += (d.weights.get(c) ?? 0) * 12;
      score += massIn(d, board.sight[c]) * (lookout ? 6 : 2.5);
    } else {
      // Before entry: spread out toward the middle of the building.
      const [x, y] = [c % board.width, Math.floor(c / board.width)];
      score -= Math.hypot(x - board.width / 2, y - board.height / 2) * 0.5;
    }
    // Guard exits when an escape is near.
    if (escapeThreat) {
      const nearest = Math.min(...exits.map((e) => distance(board, c, e)));
      score -= nearest * 0.4;
    }
    // Don't bunch up.
    for (const o of others) if (distance(board, c, o) <= 1) score -= 1.5;
    score += rng() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
