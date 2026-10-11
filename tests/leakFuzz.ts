// Leak fuzz (shared by the tests/leak-*.test.ts shards, which vitest runs in parallel): hundreds of
// seeded random bot-vs-bot games. After every step, the detectives' (and a
// spectator's) view must not depend on any secret. Proven two ways:
//   1. structural checks on the serialized view (no thief cell, trail, entry, pending painting, dead
//      cameras, undiscovered cut, unrevealed lock faces, thief-only events);
//   2. indistinguishability: scrambling every secret in the state leaves the view byte-identical.
// Also checks game invariants, that deduce() always contains the true thief cell, and termination.

import { expect } from "vitest";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { getBoard } from "../src/shared/board/model";
import { randomAction } from "../src/shared/bots/random";
import { DEFAULT_RULES, type HouseRules } from "../src/shared/game/config";
import { deduce } from "../src/shared/game/deduce";
import { apply, waitingOn } from "../src/shared/game/engine";
import { createGame } from "../src/shared/game/setup";
import { GameError, type GameState } from "../src/shared/game/state";
import { viewFor, type Viewer } from "../src/shared/game/views";
import { mulberry32, pick, shuffle, type Rng } from "../src/shared/rng";

const board = getBoard(CLASSIC_BOARD);
const TURN_CAP = 45;

function newGame(seed: number, rng: Rng): GameState {
  const n = 1 + Math.floor(rng() * 3);
  const controllers = n === 1 ? ["p1", "p1"] : Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const colours = shuffle(["red", "yellow", "green", "blue", "purple", "white"] as const, rng);
  const rules: HouseRules = {
    ...DEFAULT_RULES,
    minPaintingsToEscape: 1 + Math.floor(rng() * 3),
    lockPlacement: rng() < 0.3 ? "detectives" : "random",
    detectiveMayStay: rng() < 0.3,
    dawnAfterThiefTurns: TURN_CAP,
  };
  return createGame({ board: CLASSIC_BOARD, rules, seed, thief: "thief", detectives: controllers.map((c, i) => ({ character: colours[i], controller: c })) });
}

/** Changes every secret the detectives mustn't be able to see. */
function scramble(state: GameState, rng: Rng): GameState {
  const s = structuredClone(state);
  const t = s.thief;
  s.rng = (s.rng ^ 0x9e3779b9) >>> 0;
  if (!t.revealed && t.cell !== null) {
    const taken = new Set(s.detectives.map((d) => d.cell));
    t.cell = pick(board.walkable.filter((c) => !taken.has(c) && c !== t.cell), rng);
    t.entry = t.entry === "a" ? "b" : "a";
    t.trail = [{ turn: 1, from: t.cell, path: [t.cell], public: false }];
  }
  if (t.pending !== null) {
    const p = s.paintings.find((x) => x.id === t.pending)!;
    p.status = "hanging";
    t.stolen = t.stolen.filter((id) => id !== t.pending);
    t.pending = null;
  } else if (!t.revealed) {
    const hanging = s.paintings.filter((p) => p.status === "hanging");
    if (hanging.length) {
      const p = pick(hanging, rng);
      p.status = "pending";
      t.pending = p.id;
      t.stolen.push(p.id);
    }
  }
  for (const c of s.cameras) if (!c.removed) c.disabled = rng() < 0.5;
  if (!s.power.discovered) s.power.cut = !s.power.cut;
  if (s.rules.lockPlacement === "random") {
    const hidden = s.locks.filter((l) => !l.revealed);
    const faces = shuffle(hidden.map((l) => l.face), rng);
    hidden.forEach((l, i) => (l.face = faces[i] === "open" ? "locked" : "open"));
  }
  s.events = s.events.map((e) => (e.vis === "thief" ? { ...e, type: "powerCut" } : e)) as GameState["events"];
  return s;
}

/** Plain assertion: vitest's expect() is far too slow for thousands of checks per step. */
function assert(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

function checkView(state: GameState, viewer: Viewer) {
  const view = viewFor(state, viewer);
  const json = JSON.stringify(view);
  const t = view.thief;
  assert(t.cell === null, "thief cell visible");
  assert(t.entry === undefined && t.trail === undefined && t.stolen === undefined && t.pending === undefined, "thief secrets visible");
  for (const word of ['"pending"', '"disabled"', '"entry"', '"trail"', '"forcedRoll"', '"rng"']) assert(!json.includes(word), `${word} in ${viewer} view`);
  assert(view.power.cut === (state.power.cut && state.power.discovered), "undiscovered power cut visible");
  for (const l of view.locks) {
    const known = l.revealed || (viewer === "detectives" && state.rules.lockPlacement === "detectives");
    assert(known || l.face === undefined, `lock ${l.slot} face visible`);
  }
  if (viewer === "spectator") assert(view.marks.length === 0, "team marks visible to a spectator");
  for (const e of view.events) {
    // A spectator follows the detectives' public feed, except for what the team keeps from the thief.
    const feed = viewer === "spectator" && e.vis === "detectives" && e.type !== "locksPlaced";
    assert(e.vis === "all" || e.vis === viewer || feed, `${e.vis} event ${e.type} visible`);
    assert(e.type !== "thiefMoved" || e.path === undefined, "hidden path visible");
    assert(e.type !== "powerCut" && e.type !== "cameraDisabled", `${e.type} visible`);
    assert(e.type !== "paintingStolen" || !e.pending, "pending theft visible");
    assert(e.type !== "powerRestored" || !e.silent, "silent restore visible");
  }
  return json;
}

function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `…${a.slice(Math.max(0, i - 80), i + 40)}… vs …${b.slice(Math.max(0, i - 80), i + 40)}…`;
}

function checkInvariants(s: GameState) {
  const dets = s.detectives.map((d) => d.cell).filter((c) => c !== null);
  assert(new Set(dets).size === dets.length, "two detectives share a cell");
  const captured = s.result?.reason === "captured";
  assert(s.thief.cell === null || captured || !dets.includes(s.thief.cell), "thief shares a cell with a detective");
  assert(s.paintings.length <= 9, "too many paintings");
  if (s.phase === "play" || s.phase === "roundOver") {
    assert(s.paintings.length === 9 && s.cameras.length === 6, "piece counts changed");
    const gone = s.paintings.filter((p) => p.status !== "hanging").map((p) => p.id).sort().join();
    assert([...s.thief.stolen].sort().join() === gone, "stolen list out of sync with the board");
    assert(s.paintings.filter((p) => p.status === "pending").length === (s.thief.pending === null ? 0 : 1), "pending painting count");
    assert(!s.thief.revealed || s.thief.pending === null, "revealed thief with a pending painting");
  }
  assert(s.thief.snipsLeft >= 0 && s.thief.snipsLeft <= 2, "snips out of range");
  if (s.locks.every((l) => l.face)) assert(s.locks.filter((l) => l.face === "open").length === 6, "lock faces changed");
  assert(!s.power.discovered || s.power.cut, "discovered but not cut");
}

/** Plays seeds [from, to] and checks everything after every step. Returns endings seen. */
export function runLeakFuzz(from: number, to: number): Record<string, number> {
  const outcomes: Record<string, number> = {};
  for (let seed = from; seed <= to; seed++) {
    const rng = mulberry32(seed * 7919);
    let state = newGame(seed, rng);
    let steps = 0;
    for (; state.phase !== "roundOver" && steps < 5000; steps++) {
      const who = waitingOn(state);
      const actor = who.length ? who[0] : state.detectives[0].controller;
      const role: Viewer = actor === state.thief.controller ? "thief" : "detectives";
      const action = randomAction(viewFor(state, role), actor, rng);
      assert(action !== null, `seed ${seed}: no action for ${actor} in ${state.phase}`);
      try {
        state = apply(state, actor, action!).state;
      } catch (err) {
        if (err instanceof GameError) throw new Error(`seed ${seed} step ${steps}: ${err.message} (${JSON.stringify(action)})`);
        throw err;
      }
      checkInvariants(state);
      if (state.phase !== "roundOver" && !state.thief.revealed) {
        for (const viewer of ["detectives", "spectator"] as const) {
          const json = checkView(state, viewer);
          const other = JSON.stringify(viewFor(scramble(state, rng), viewer));
          if (other !== json) throw new Error(`seed ${seed} step ${steps}: ${viewer} view depends on a secret: ${firstDiff(json, other)}`);
        }
        if (state.thief.cell !== null) {
          const d = deduce(state.board, viewFor(state, "detectives").events);
          assert(d.weights.has(state.thief.cell), `seed ${seed} step ${steps}: deduce lost the thief`);
        }
      }
    }
    expect(state.phase, `seed ${seed} didn't finish`).toBe("roundOver");
    outcomes[state.result!.reason] = (outcomes[state.result!.reason] ?? 0) + 1;
    // After the round everything is public, including the full trail.
    const end = viewFor(state, "detectives");
    expect(end.viewer).toBe("omniscient");
    expect(end.thief.trail?.length).toBe(state.thief.turns);
    expect(end.events).toHaveLength(state.events.length);
    expect(steps).toBeGreaterThan(10);
  }
  return outcomes;
}
