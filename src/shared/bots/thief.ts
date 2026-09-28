// Thief bot. Uses only the thief's view (everything except unflipped lock faces). Each move is scored
// by exposure to sightlines (detectives and working cameras), distance from detectives, paintings
// gained (a fresh theft also protects from capture), escape readiness, and what the detectives can
// publicly deduce. It snips the motion detectors when an honest answer would give too much away.

import { canSee } from "../board/los";
import { colourOf, distance, getBoard, type Board, type Cell } from "../board/model";
import { thiefDestinations } from "../board/paths";
import type { GameAction } from "../game/actions";
import { deduce } from "../game/deduce";
import type { GameView } from "../game/views";
import type { Rng } from "../rng";

/** What the detectives know: deduce over the public part of the thief's own log. */
function publicDeduction(view: GameView) {
  return deduce(
    view.board,
    view.events.filter((e) => e.vis !== "thief"),
  );
}

function watchers(view: GameView): Cell[] {
  const out = view.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell]));
  if (!view.power.cut) for (const c of view.cameras) if (!c.disabled) out.push(c.cell);
  return out;
}

function exposure(board: Board, cell: Cell, eyes: Cell[]): number {
  let n = 0;
  for (const e of eyes) if (canSee(board, e, cell)) n++;
  return n;
}

export function thiefAction(view: GameView, me: string, rng: Rng): GameAction | null {
  if (view.thief.controller !== me || view.phase !== "play") return null;
  const board = getBoard(view.board);
  const t = view.turn;

  if (t.kind === "detective" && t.awaitingThief) {
    if (view.thief.snipsLeft <= 0 || view.thief.cell === null) return { a: "motionResponse", snip: false };
    const d = publicDeduction(view);
    const colour = colourOf(board, view.thief.cell);
    let before = 0;
    let after = 0;
    for (const [c] of d.weights) {
      before++;
      if (colourOf(board, c) === colour) after++;
    }
    // Snip if the answer would cut the suspects to a handful, or a small fraction.
    const revealing = after <= 6 || after <= before * 0.25;
    return { a: "motionResponse", snip: revealing && !view.thief.revealed };
  }
  if (t.kind !== "thief") return null;

  const detectives = view.detectives.flatMap((d) => (d.cell === null ? [] : [d.cell]));
  const hanging = view.paintings.filter((p) => p.status === "hanging");
  const exits = board.slots.filter((s) => !view.locks.find((l) => l.slot === s.id)?.revealed);
  const need = view.rules.minPaintingsToEscape;

  // First turn: choose the entry.
  let entry: string | undefined;
  let start = view.thief.cell;
  if (start === null) {
    let best = -Infinity;
    for (const s of board.slots) {
      const near = Math.min(...detectives.map((d) => distance(board, s.inside, d)));
      const loot = hanging.filter((p) => distance(board, s.inside, p.cell) <= 4).length;
      const score = Math.min(near, 6) * 1.2 + loot * 1.5 - exposure(board, s.inside, watchers(view)) * 2 + rng() * 1.5;
      if (score > best) {
        best = score;
        entry = s.id;
      }
    }
    start = board.slotById[entry!].inside;
  }

  const ends = thiefDestinations(board, start, detectives);
  const eyes = watchers(view);
  // What the detectives will believe right after this (hidden) move.
  const publicEvents = view.events.filter((e) => e.vis !== "thief");
  const nextSeq = (view.events[view.events.length - 1]?.seq ?? 0) + 1;
  const pub = deduce(view.board, [...publicEvents, { type: "thiefMoved", turn: view.thief.turns + 1, seq: nextSeq, vis: "detectives" }]);
  const nextDetective = view.detectives[view.nextDetective]?.cell ?? null;
  const revealed = view.thief.revealed;
  // Lookouts the next detective can plausibly reach (within 4 steps) before using an Eye.
  const lookouts = nextDetective === null ? [] : board.walkable.filter((c) => {
    const k = distance(board, nextDetective, c);
    return k >= 0 && k <= 4;
  });
  let bestDest: Cell | null = null;
  let bestScore = -Infinity;
  for (const [dest] of ends) {
    const painting = hanging.find((p) => p.cell === dest);
    const haul = view.thief.haul + (painting ? 1 : 0);
    let score = 0;
    // Loot: always welcome; a fresh theft (while hidden) also shields from capture this turn.
    if (painting) score += revealed ? 4 : 7;
    // Exposure to sightlines (a detective's Eye comes up 4 times in 6).
    const seen = exposure(board, dest, eyes);
    score -= seen * (revealed ? 1 : 4.5);
    if (!revealed && lookouts.length) {
      const risky = lookouts.filter((c) => canSee(board, c, dest)).length / lookouts.length;
      score -= risky * 10;
    }
    // Distance from detectives: they roll up to 6.
    for (const d of detectives) {
      const k = distance(board, dest, d);
      const reach = k <= 6 ? (7 - Math.max(1, k)) / 6 : 0;
      score -= reach * (revealed ? 6 : painting ? 0.3 : 1.2) * (revealed ? 1 : 0.5 + (pub.weights.get(dest) ?? 0) * 4);
    }
    // Escape readiness.
    const slot = board.slotByInside.get(dest);
    const canTry = !!slot && exits.some((s) => s.id === slot.id);
    if (haul >= need) {
      if (canTry) score += 9;
      const nearest = Math.min(...exits.map((s) => distance(board, dest, s.inside)));
      score -= nearest * (revealed ? 1.2 : 0.6);
    } else if (hanging.length) {
      const nearestLoot = Math.min(...hanging.filter((p) => p.cell !== dest).map((p) => distance(board, dest, p.cell)), 12);
      score -= nearestLoot * 0.5;
    }
    // Blend in with the crowd: cells the detectives will suspect most are the ones they'll try.
    if (!revealed) {
      const w = pub.weights.get(dest) ?? 0;
      score -= w * 40;
      // The next detective to move is the real threat.
      if (nextDetective !== null && !painting) {
        const k = distance(board, dest, nextDetective);
        if (k <= 6) score -= ((7 - Math.max(1, k)) / 6) * (1 + w * 30);
      }
    }
    // Cameras and the switch are worth a detour.
    if (view.cameras.some((c) => c.cell === dest && !c.disabled)) score += 0.8;
    if (dest === board.power && !view.power.cut) score += 1.5;
    score += rng() * 0.8;
    if (score > bestScore) {
      bestScore = score;
      bestDest = dest;
    }
  }
  if (bestDest === null) return null;
  const action: GameAction = { a: "thiefTurn", dest: bestDest, ...(entry ? { entry } : {}) };
  const cam = view.cameras.find((c) => c.cell === bestDest && !c.disabled);
  if (cam) action.disableCamera = true;
  if (bestDest === board.power && !view.power.cut) action.cutPower = true;
  const slot = board.slotByInside.get(bestDest);
  const haul = view.thief.haul + (hanging.some((p) => p.cell === bestDest) ? 1 : 0);
  if (slot && exits.some((s) => s.id === slot.id) && haul >= need) action.tryLock = true;
  return action;
}
