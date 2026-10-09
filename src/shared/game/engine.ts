// The rules engine: apply(state, actor, action) → { state, events }. Pure and deterministic given the
// seeded RNG inside the state. Every rule in analysis §4 and ruling in §5 is enforced here; the
// client only ever proposes actions.
//
// Turn machine:
//   setupLocks? → setupPaintings → setupCameras → setupDetectives → play → roundOver
//   play: thief turn (one atomic action) → detective turn (roll → move / act in either order, with a
//   blocking motion-detector prompt) → thief turn → next detective …   (T, D1, T, D2, T, D3, T, D1 …)

import { getBoard, type Board, type Cell } from "../board/model";
import { detectiveDestinations, shortestPath, thiefDestinations, thiefPathProblem } from "../board/paths";
import { randInt, stateRng } from "../rng";
import type { GameAction, ThiefTurnAction } from "./actions";
import { ACTION_DIE } from "./config";
import { cameraAnswer, eyeSees, motionColour, scanAnswer } from "./detection";
import {
  addCamera,
  addPainting,
  autoPlace,
  clearPhase,
  nextSetupPhase,
  occupancy,
  placementProblem,
  setupProblem,
} from "./setup";
import {
  GameError,
  SETUP_PHASES,
  type DetectivePawn,
  type GameEvent,
  type GameEventBody,
  type GameState,
  type LockFace,
  type Roll,
  type RoundResult,
  type TrailStep,
  type Visibility,
} from "./state";

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/** Applies one action for `actor` (a player id). Throws GameError with a readable reason if illegal. */
export function apply(prev: GameState, actor: string, action: GameAction): ApplyResult {
  // Events are append-only and never mutated once emitted, so the log is shared rather than cloned.
  const { events, ...rest } = prev;
  const state: GameState = { ...structuredClone(rest), events: events.slice() };
  const before = state.events.length;
  step(state, actor, action);
  return { state, events: state.events.slice(before) };
}

function emit(state: GameState, vis: Visibility, body: GameEventBody) {
  state.events.push({ ...body, seq: ++state.seq, vis, at: Date.now() } as GameEvent);
}

function fail(message: string): never {
  throw new GameError(message);
}

export function isThief(state: GameState, actor: string) {
  return state.thief.controller === actor;
}

export function isDetective(state: GameState, actor: string) {
  return state.detectives.some((d) => d.controller === actor);
}

export function activePawn(state: GameState): DetectivePawn | null {
  return state.turn.kind === "detective" ? state.detectives.find((d) => d.id === (state.turn as { pawn: string }).pawn)! : null;
}

/** Player ids the game is currently waiting on (for "waiting on …" UI and turn timers). */
export function waitingOn(state: GameState): string[] {
  if (SETUP_PHASES.includes(state.phase)) {
    const controllers = [...new Set(state.detectives.map((d) => d.controller))];
    return controllers.filter((c) => !state.ready[c] && !state.autoReady.includes(c));
  }
  if (state.turn.kind === "thief") return [state.thief.controller];
  if (state.turn.kind === "detective") {
    if (state.turn.awaitingThief) return [state.thief.controller];
    return [activePawn(state)!.controller];
  }
  return [];
}

function step(state: GameState, actor: string, action: GameAction) {
  switch (action.a) {
    case "setLock":
    case "place":
    case "remove":
    case "movePiece":
    case "placeDetective":
    case "autoPlace":
    case "clear":
    case "setupReady":
      return setupAction(state, actor, action);
    case "thiefTurn":
      return thiefTurn(state, actor, action);
    case "motionResponse":
      return motionResponse(state, actor, action.snip);
    case "roll":
    case "move":
    case "eye":
    case "scan":
    case "motion":
    case "skipAction":
    case "endTurn":
      return detectiveAction(state, actor, action);
    case "mark":
    case "clearMarks": {
      if (!isDetective(state, actor)) fail("Only detectives can mark suspects.");
      if (state.rules.assist === "off") fail("Suspect marks are turned off in this game.");
      if (action.a === "clearMarks") state.marks = [];
      else if (action.on && !state.marks.includes(action.cell)) state.marks.push(action.cell);
      else if (!action.on) state.marks = state.marks.filter((c) => c !== action.cell);
      return;
    }
  }
}

// --- setup ---------------------------------------------------------------------------------------

function setupAction(state: GameState, actor: string, action: GameAction) {
  if (!SETUP_PHASES.includes(state.phase)) fail("Setup is over.");
  if (!isDetective(state, actor)) fail("The detectives set up the museum. Watch closely!");
  const board = getBoard(state.board);
  const phase = state.phase;

  switch (action.a) {
    case "setLock": {
      if (phase !== "setupLocks") fail("Locks are already placed.");
      const lock = state.locks.find((l) => l.slot === action.slot) ?? fail("There's no lock there.");
      lock.face = action.face;
      break;
    }
    case "place": {
      if (phase === "setupPaintings") {
        const problem = placementProblem(board, "painting", action.cell, occupancy(state));
        if (problem) fail(problem);
        addPainting(state, action.cell);
      } else if (phase === "setupCameras") {
        const problem = placementProblem(board, "camera", action.cell, occupancy(state));
        if (problem) fail(problem);
        addCamera(state, action.cell);
      } else if (phase === "setupDetectives") {
        const pawn = state.detectives.find((d) => d.cell === null) ?? fail("Every detective is already placed.");
        const problem = placementProblem(board, "detective", action.cell, occupancy(state));
        if (problem) fail(problem);
        pawn.cell = action.cell;
      } else fail("Set the locks first.");
      break;
    }
    case "remove": {
      if (phase === "setupPaintings") {
        if (!state.paintings.some((p) => p.cell === action.cell)) fail("There's no painting there.");
        state.paintings = state.paintings.filter((p) => p.cell !== action.cell);
      } else if (phase === "setupCameras") {
        if (!state.cameras.some((c) => c.cell === action.cell)) fail("There's no camera there.");
        state.cameras = state.cameras.filter((c) => c.cell !== action.cell);
      } else if (phase === "setupDetectives") {
        const pawn = state.detectives.find((d) => d.cell === action.cell) ?? fail("There's no detective there.");
        pawn.cell = null;
      } else fail("Nothing to remove here.");
      break;
    }
    case "movePiece": {
      const occ = occupancy(state);
      if (phase === "setupPaintings") {
        const p = state.paintings.find((x) => x.cell === action.from) ?? fail("There's no painting there.");
        const problem = placementProblem(board, "painting", action.to, occ, action.from);
        if (problem) fail(problem);
        p.cell = action.to;
      } else if (phase === "setupCameras") {
        const c = state.cameras.find((x) => x.cell === action.from) ?? fail("There's no camera there.");
        const problem = placementProblem(board, "camera", action.to, occ, action.from);
        if (problem) fail(problem);
        c.cell = action.to;
      } else if (phase === "setupDetectives") {
        const d = state.detectives.find((x) => x.cell === action.from) ?? fail("There's no detective there.");
        const problem = placementProblem(board, "detective", action.to, occ, action.from);
        if (problem) fail(problem);
        d.cell = action.to;
      } else fail("Nothing to move here.");
      break;
    }
    case "placeDetective": {
      if (phase !== "setupDetectives") fail("Detectives are placed after the cameras.");
      const pawn = state.detectives.find((d) => d.id === action.pawn) ?? fail("No such detective.");
      const problem = placementProblem(board, "detective", action.cell, occupancy(state), pawn.cell ?? undefined);
      if (problem) fail(problem);
      pawn.cell = action.cell;
      break;
    }
    case "autoPlace":
      autoPlace(state, stateRng(state));
      break;
    case "clear":
      clearPhase(state);
      break;
    case "setupReady": {
      if (action.ready) {
        const problem = setupProblem(state);
        if (problem) fail(problem);
      }
      state.ready[actor] = action.ready;
      maybeAdvanceSetup(state);
      return;
    }
  }
  // Any change to the layout means everyone should look again.
  state.ready = {};
}

function maybeAdvanceSetup(state: GameState) {
  if (setupProblem(state)) return;
  if (waitingOn(state).length > 0) return;
  // Bot-only teams press ready themselves; a team with humans doesn't wait for its bots.
  const controllers = [...new Set(state.detectives.map((d) => d.controller))];
  if (!controllers.some((c) => state.ready[c])) return;
  const from = state.phase;
  state.phase = nextSetupPhase(from);
  state.ready = {};
  if (from === "setupLocks") {
    const faces: Record<string, LockFace> = {};
    for (const l of state.locks) faces[l.slot] = l.face!;
    emit(state, "detectives", { type: "locksPlaced", faces });
  }
  emit(state, "all", { type: "phase", phase: state.phase });
  if (state.phase === "play") startPlay(state);
}

/** Starts play from whatever layout the state holds (tests and debug tools; no validation). */
export function beginPlay(state: GameState) {
  state.phase = "play";
  state.ready = {};
  emit(state, "all", { type: "phase", phase: "play" });
  startPlay(state);
}

function startPlay(state: GameState) {
  const detectives: Record<string, Cell> = {};
  for (const d of state.detectives) detectives[d.id] = d.cell!;
  const paintings: Record<number, Cell> = {};
  for (const p of state.paintings) paintings[p.id] = p.cell;
  const cameras: Record<number, Cell> = {};
  for (const c of state.cameras) cameras[c.n] = c.cell;
  emit(state, "all", { type: "playStarted", detectives, paintings, cameras });
  beginThiefTurn(state);
}

// --- thief ---------------------------------------------------------------------------------------

function beginThiefTurn(state: GameState) {
  const { thief, rules } = state;
  if (rules.dawnAfterThiefTurns > 0 && thief.turns >= rules.dawnAfterThiefTurns) {
    emit(state, "all", { type: "dawn", turns: thief.turns });
    return endRound(state, { winner: "detectives", reason: "dawn", paintings: thief.stolen.length });
  }
  // The one-turn delay: a painting marked last turn comes off the board now, publicly.
  if (thief.pending !== null) {
    const p = state.paintings.find((x) => x.id === thief.pending)!;
    p.status = "stolen";
    thief.pending = null;
    emit(state, "all", { type: "paintingVanished", painting: p.id, cell: p.cell });
    state.lastSeen = { cell: p.cell, atThiefTurn: thief.turns, reason: "painting" };
  }
  state.turn = { kind: "thief" };
  emit(state, "all", { type: "thiefTurn", turn: thief.turns + 1 });
}

/** Paintings the thief holds, counting a pending one (they count for escaping, §4.8). */
export function thiefHaul(state: GameState): number {
  return state.thief.stolen.length;
}

function thiefTurn(state: GameState, actor: string, action: ThiefTurnAction) {
  if (!isThief(state, actor)) fail("Only the thief moves the thief.");
  if (state.phase !== "play" || state.turn.kind !== "thief") fail("It's not the thief's turn.");
  const board = getBoard(state.board);
  const { thief } = state;

  let start: Cell;
  if (thief.cell === null) {
    if (!action.entry) fail("Pick a window or door to sneak in through.");
    const slot = board.slotById[action.entry] ?? fail("There's no window or door there.");
    start = slot.inside;
  } else {
    if (action.entry) fail("You're already inside.");
    start = thief.cell;
  }

  const detectives = state.detectives.map((d) => d.cell!);
  let path: Cell[];
  if (action.path) {
    const problem = thiefPathProblem(board, start, action.path, detectives);
    if (problem) fail(problem);
    if (action.path[action.path.length - 1] !== action.dest) fail("The path doesn't end at your destination.");
    path = action.path;
  } else {
    const ends = thiefDestinations(board, start, detectives);
    if (!ends.has(action.dest)) {
      if (action.dest === start) fail("You have to move: end somewhere new.");
      if (detectives.includes(action.dest)) fail("You can't end on a detective. You'd be caught!");
      fail("That's more than 3 spaces away.");
    }
    path = ends.get(action.dest)!;
  }
  const dest = action.dest;

  // Validate every option before changing anything.
  const painting = state.paintings.find((p) => p.cell === dest && p.status === "hanging");
  const camera = state.cameras.find((c) => c.cell === dest && !c.removed);
  if (action.disableCamera && (!camera || camera.disabled)) fail("There's no working camera there to disable.");
  if (action.cutPower && (dest !== board.power || state.power.cut)) fail("You can only cut the power at the switch (P), and only once it's on.");
  const slot = board.slotByInside.get(dest);
  const lock = slot ? state.locks.find((l) => l.slot === slot.id)! : undefined;
  if (action.tryLock) {
    if (!slot || !lock) fail("There's no lock next to that space.");
    if (lock.revealed) fail("That lock has already been tried: it's locked.");
    const haul = thiefHaul(state) + (painting ? 1 : 0);
    if (haul < state.rules.minPaintingsToEscape) {
      fail(`You need at least ${state.rules.minPaintingsToEscape} paintings before trying a lock.`);
    }
  }

  // Move.
  thief.cell = dest;
  if (action.entry) thief.entry = action.entry;
  thief.turns++;
  const trail: TrailStep = { turn: thief.turns, from: start, path, public: thief.revealed, ...(action.entry ? { entry: action.entry } : {}) };
  if (thief.revealed) {
    emit(state, "all", { type: "thiefMoved", turn: thief.turns, from: start, path });
    state.lastSeen = { cell: dest, atThiefTurn: thief.turns, reason: "revealed" };
  } else {
    emit(state, "detectives", { type: "thiefMoved", turn: thief.turns });
    emit(state, "thief", { type: "thiefMoved", turn: thief.turns, entry: action.entry, from: start, path });
  }

  // Resolve the end space in order (§4.3.4): painting, camera, power, lock.
  if (painting) {
    thief.stolen.push(painting.id);
    trail.stole = painting.id;
    if (thief.revealed) {
      painting.status = "stolen";
      emit(state, "all", { type: "paintingStolen", painting: painting.id, cell: dest, pending: false });
    } else {
      painting.status = "pending";
      thief.pending = painting.id;
      emit(state, "thief", { type: "paintingStolen", painting: painting.id, cell: dest, pending: true });
    }
  }
  if (action.disableCamera && camera) {
    camera.disabled = true;
    trail.disabledCamera = camera.n;
    emit(state, "thief", { type: "cameraDisabled", n: camera.n });
  }
  if (action.cutPower) {
    state.power = { cut: true, discovered: false };
    trail.cutPower = true;
    emit(state, "thief", { type: "powerCut" });
  }
  thief.trail.push(trail);
  if (action.tryLock && slot && lock) {
    // R4: the flip is open even while hidden; the thief's cell becomes public, the pawn stays off.
    lock.revealed = true;
    trail.triedLock = { slot: slot.id, face: lock.face! };
    emit(state, "all", { type: "lockTried", slot: slot.id, face: lock.face!, cell: dest });
    state.lastSeen = { cell: dest, atThiefTurn: thief.turns, reason: "lock" };
    if (lock.face === "open") {
      emit(state, "all", { type: "escaped", slot: slot.id, cell: dest, paintings: thiefHaul(state) });
      return endRound(state, { winner: "thief", reason: "escaped", paintings: thiefHaul(state), slot: slot.id, cell: dest });
    }
  }
  beginDetectiveTurn(state);
}

function motionResponse(state: GameState, actor: string, snip: boolean) {
  if (!isThief(state, actor)) fail("Only the thief answers the motion detectors.");
  const turn = state.turn;
  if (turn.kind !== "detective" || !turn.awaitingThief) fail("Nobody is asking.");
  if (snip && state.thief.snipsLeft <= 0) fail("You're out of wire snips.");
  if (snip) {
    state.thief.snipsLeft--;
    emit(state, "all", { type: "motion", pawn: turn.pawn, result: "snipped", snipsLeft: state.thief.snipsLeft });
  } else {
    emit(state, "all", { type: "motion", pawn: turn.pawn, result: "answered", colour: motionColour(state), snipsLeft: state.thief.snipsLeft });
  }
  turn.awaitingThief = false;
  turn.acted = true;
  maybeEndDetectiveTurn(state);
}

// --- detectives ----------------------------------------------------------------------------------

function beginDetectiveTurn(state: GameState) {
  const pawn = state.detectives[state.nextDetective];
  state.nextDetective = (state.nextDetective + 1) % state.detectives.length;
  state.turn = { kind: "detective", pawn: pawn.id, roll: null, moved: false, acted: false, awaitingThief: false };
  emit(state, "all", { type: "detectiveTurn", pawn: pawn.id });
}

/** Where the active detective may end a move of `steps` (public information only). */
export function detectiveEnds(state: GameState, pawn: DetectivePawn, steps: number): Map<Cell, number> {
  const board = getBoard(state.board);
  const blocked = [
    ...state.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell),
    ...state.detectives.filter((d) => d.id !== pawn.id).map((d) => d.cell!),
  ];
  return detectiveDestinations(board, pawn.cell!, steps, blocked, state.rules.detectiveMayStay);
}

function detectiveAction(state: GameState, actor: string, action: GameAction) {
  if (state.phase !== "play") fail("The round isn't being played right now.");
  const turn = state.turn;
  if (turn.kind !== "detective") fail("It's the thief's turn.");
  const pawn = activePawn(state)!;
  if (pawn.controller !== actor) fail("It's not your turn.");
  if (turn.awaitingThief) fail("Waiting for the thief to answer the motion detectors.");
  const board = getBoard(state.board);

  if (action.a === "roll") {
    if (turn.roll) fail("You've already rolled.");
    const rng = stateRng(state);
    const roll = state.forcedRoll ?? { move: randInt(rng, 1, 6), action: ACTION_DIE[randInt(rng, 0, ACTION_DIE.length - 1)] };
    delete state.forcedRoll;
    turn.roll = roll;
    emit(state, "all", { type: "rolled", pawn: pawn.id, move: roll.move, action: roll.action });
    if (detectiveEnds(state, pawn, roll.move).size === 0) {
      turn.moved = true;
      emit(state, "all", { type: "boxedIn", pawn: pawn.id });
    }
    return;
  }
  if (!turn.roll) fail("Roll the dice first.");
  const roll = turn.roll;

  switch (action.a) {
    case "move": {
      if (turn.moved) fail("You've already moved this turn.");
      const ends = detectiveEnds(state, pawn, roll.move);
      if (!ends.has(action.dest)) fail(moveProblem(state, board, pawn, action.dest, roll.move));
      const from = pawn.cell!;
      let path = shortestPath(board, from, action.dest);
      if (action.dest === from && ends.get(from) === 0 && !state.rules.detectiveMayStay) path = [board.neighbours[from][0], from];
      pawn.cell = action.dest;
      turn.moved = true;
      emit(state, "all", { type: "detectiveMoved", pawn: pawn.id, from, to: action.dest, path });
      if (action.dest === state.thief.cell) {
        emit(state, "all", { type: "captured", pawn: pawn.id, cell: action.dest, wasHidden: !state.thief.revealed });
        return endRound(state, { winner: "detectives", reason: "captured", paintings: thiefHaul(state), by: pawn.id, cell: action.dest });
      }
      if (action.dest === board.power && state.power.cut) {
        // R6: restoring an undiscovered cut is silent. Individually disabled cameras stay disabled.
        const silent = !state.power.discovered;
        state.power = { cut: false, discovered: false };
        emit(state, silent ? "thief" : "all", { type: "powerRestored", pawn: pawn.id, silent });
      }
      break;
    }
    case "eye": {
      requireAction(turn, "eye");
      if (action.target === "self") {
        const seen = eyeSees(state, pawn.cell!);
        emit(state, "all", { type: "eye", pawn: pawn.id, from: pawn.cell!, seen });
        if (seen) {
          state.thief.sightings++;
          if (!state.thief.revealed) reveal(state, pawn.id);
        }
      } else {
        const cam = state.cameras.find((c) => c.n === action.target && !c.removed) ?? fail(`Camera ${action.target} isn't on the board.`);
        const result = cameraAnswer(state, cam);
        emit(state, "all", { type: "camera", pawn: pawn.id, n: cam.n, result });
        if (result === "powerOut") discoverCut(state, pawn.id);
        if (result === "dead") cam.removed = true;
        if (result === "sees") state.thief.sightings++;
      }
      turn.acted = true;
      break;
    }
    case "scan": {
      requireAction(turn, "scan");
      const ans = scanAnswer(state);
      for (const n of ans.removed) state.cameras.find((c) => c.n === n)!.removed = true;
      if (ans.seeing.length) state.thief.sightings++;
      emit(state, "all", { type: "scan", pawn: pawn.id, ...ans });
      if (ans.result === "powerOut") discoverCut(state, pawn.id);
      turn.acted = true;
      break;
    }
    case "motion": {
      requireAction(turn, "motion");
      if (state.power.cut) {
        emit(state, "all", { type: "motion", pawn: pawn.id, result: "powerOut", snipsLeft: state.thief.snipsLeft });
        discoverCut(state, pawn.id);
        turn.acted = true;
      } else if (state.thief.snipsLeft === 0) {
        // D3: no snips left, so there's nothing to decide: answer at once.
        emit(state, "all", { type: "motion", pawn: pawn.id, result: "answered", colour: motionColour(state), snipsLeft: 0 });
        turn.acted = true;
      } else {
        turn.awaitingThief = true;
        emit(state, "all", { type: "motionAsked", pawn: pawn.id });
        return;
      }
      break;
    }
    case "skipAction": {
      if (turn.acted) fail("You've already used your action.");
      turn.acted = true;
      emit(state, "all", { type: "actionSkipped", pawn: pawn.id });
      break;
    }
    case "endTurn": {
      if (!turn.moved) fail("Move before ending your turn.");
      if (!turn.acted) {
        turn.acted = true;
        emit(state, "all", { type: "actionSkipped", pawn: pawn.id });
      }
      break;
    }
    default:
      fail("That isn't a detective action.");
  }
  maybeEndDetectiveTurn(state);
}

function requireAction(turn: Extract<GameState["turn"], { kind: "detective" }>, face: "eye" | "scan" | "motion") {
  if (turn.acted) fail("You've already used your action.");
  const rolled = turn.roll!.action;
  if (rolled !== face) fail(`You rolled ${rolled === "eye" ? "an Eye" : rolled === "scan" ? "Scan" : "Motion"}, not ${face === "eye" ? "an Eye" : face === "scan" ? "Scan" : "Motion"}.`);
}

function moveProblem(state: GameState, board: Board, pawn: DetectivePawn, dest: Cell, steps: number): string {
  if (!board.region[dest]) return "That's outside the museum.";
  if (dest === pawn.cell) return steps === 1 ? "You rolled a 1: you have to move." : "You can't stay put.";
  if (state.paintings.some((p) => p.cell === dest && p.status !== "stolen")) return "Detectives can't end on a painting.";
  if (state.detectives.some((d) => d.cell === dest)) return "Another detective is already there.";
  return `That's more than ${steps} space${steps === 1 ? "" : "s"} away.`;
}

function discoverCut(state: GameState, pawn: string) {
  state.power.discovered = true;
  emit(state, "all", { type: "powerOutDiscovered", pawn });
}

function reveal(state: GameState, by: string) {
  const { thief } = state;
  thief.revealed = true;
  emit(state, "all", { type: "thiefRevealed", cell: thief.cell!, by });
  state.lastSeen = { cell: thief.cell!, atThiefTurn: thief.turns, reason: "revealed" };
  // R3: revealed means no delay, so a pending painting under the thief comes off now.
  if (thief.pending !== null) {
    const p = state.paintings.find((x) => x.id === thief.pending)!;
    p.status = "stolen";
    thief.pending = null;
    emit(state, "all", { type: "paintingStolen", painting: p.id, cell: p.cell, pending: false, onReveal: true });
  }
}

function maybeEndDetectiveTurn(state: GameState) {
  const turn = state.turn;
  if (turn.kind === "detective" && turn.moved && turn.acted && !turn.awaitingThief) beginThiefTurn(state);
}

function endRound(state: GameState, result: RoundResult) {
  state.phase = "roundOver";
  state.turn = { kind: "over" };
  state.result = result;
  emit(state, "all", { type: "roundOver", result });
}

/** Debug helpers (the room gates who may call them). */
export const debugOps = {
  forceRoll(state: GameState, roll: Roll) {
    state.forcedRoll = roll;
  },
  giveThiefPaintings(state: GameState, n: number) {
    for (const p of state.paintings) {
      if (n <= 0) break;
      if (p.status !== "hanging") continue;
      p.status = "stolen";
      state.thief.stolen.push(p.id);
      emit(state, "all", { type: "paintingVanished", painting: p.id, cell: p.cell });
      n--;
    }
  },
  setPower(state: GameState, cut: boolean) {
    state.power = { cut, discovered: false };
  },
  endRound(state: GameState, winner: "thief" | "detectives") {
    if (state.phase === "roundOver") return;
    endRound(state, winner === "thief"
      ? { winner, reason: "escaped", paintings: thiefHaul(state) }
      : { winner, reason: "captured", paintings: thiefHaul(state) });
  },
  /** Completes every remaining setup phase with auto-place and starts play. */
  skipSetup(state: GameState) {
    const rng = stateRng(state);
    for (let guard = 0; guard < 8 && SETUP_PHASES.includes(state.phase); guard++) {
      autoPlace(state, rng);
      for (const d of state.detectives) state.ready[d.controller] = true;
      maybeAdvanceSetup(state);
    }
  },
};
