// Random legal-move bots, used by the simulation and leak tests. They only ever look at their own
// role's view, exactly like the real bots.

import { getBoard } from "../board/model";
import { thiefDestinations } from "../board/paths";
import { detectiveDestinations } from "../board/paths";
import { pick, type Rng } from "../rng";
import type { GameAction } from "../game/actions";
import { setupProblem } from "../game/setup";
import { SETUP_PHASES } from "../game/state";
import type { GameView } from "../game/views";

/** A random legal action for player `me`, or null when the game isn't waiting on them. */
export function randomAction(view: GameView, me: string, rng: Rng): GameAction | null {
  const board = getBoard(view.board);
  const isThief = view.thief.controller === me;

  if (SETUP_PHASES.includes(view.phase)) {
    if (isThief || view.ready[me]) return null;
    return setupProblem(view) ? { a: "autoPlace" } : { a: "setupReady", ready: true };
  }
  if (view.phase !== "play") return null;
  const turn = view.turn;

  if (isThief) {
    if (turn.kind === "detective" && turn.awaitingThief) return { a: "motionResponse", snip: view.thief.snipsLeft > 0 && rng() < 0.3 };
    if (turn.kind !== "thief") return null;
    const entry = view.thief.cell === null ? pick(board.slots, rng) : null;
    const start = entry ? entry.inside : view.thief.cell!;
    const ends = [...thiefDestinations(board, start, view.detectives.map((d) => d.cell!)).keys()];
    const dest = pick(ends, rng);
    const action: GameAction = { a: "thiefTurn", dest, ...(entry ? { entry: entry.id } : {}) };
    const cam = view.cameras.find((c) => c.cell === dest);
    if (cam && !cam.disabled && rng() < 0.5) action.disableCamera = true;
    if (dest === board.power && !view.power.cut && rng() < 0.5) action.cutPower = true;
    const slot = board.slotByInside.get(dest);
    const lock = slot && view.locks.find((l) => l.slot === slot.id);
    const haul = view.thief.haul + (view.paintings.some((p) => p.cell === dest && p.status === "hanging") ? 1 : 0);
    if (lock && !lock.revealed && haul >= view.rules.minPaintingsToEscape && rng() < 0.8) action.tryLock = true;
    return action;
  }

  if (turn.kind !== "detective" || turn.awaitingThief) return null;
  const pawn = view.detectives.find((d) => d.id === turn.pawn)!;
  if (pawn.controller !== me) return null;
  if (!turn.roll) return { a: "roll" };
  const canMove = !turn.moved;
  const canAct = !turn.acted;
  if (canMove && (!canAct || rng() < 0.5)) {
    const blocked = [...view.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell), ...view.detectives.filter((d) => d.id !== pawn.id).map((d) => d.cell!)];
    const ends = [...detectiveDestinations(board, pawn.cell!, turn.roll.move, blocked, view.rules.detectiveMayStay).keys()];
    return { a: "move", dest: pick(ends, rng) };
  }
  if (rng() < 0.1) return { a: "skipAction" };
  switch (turn.roll.action) {
    case "eye":
      return view.cameras.length && rng() < 0.5 ? { a: "eye", target: pick(view.cameras, rng).n } : { a: "eye", target: "self" };
    case "scan":
      return { a: "scan" };
    case "motion":
      return { a: "motion" };
  }
}
