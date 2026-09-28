import { describe, expect, it } from "vitest";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { colourOf, getBoard } from "../src/shared/board/model";
import { ACTION_DIE, DEFAULT_RULES } from "../src/shared/game/config";
import { apply, debugOps, waitingOn } from "../src/shared/game/engine";
import { autoPlace, createGame, occupancy, placementProblem, setupProblem } from "../src/shared/game/setup";
import type { GameState } from "../src/shared/game/state";
import { viewFor } from "../src/shared/game/views";
import { mulberry32 } from "../src/shared/rng";
import { act, actEvents, board, c, D1, D2, D3, detectiveTurn, detView, inPlay, THIEF } from "./helpers";

/** Puts the (hidden) thief on a cell as if they'd entered earlier. */
function thiefAt(state: GameState, x: number, y: number, entry = "a"): GameState {
  const s = structuredClone(state);
  s.thief.cell = c(x, y);
  s.thief.entry = entry;
  s.thief.turns = Math.max(1, s.thief.turns);
  return s;
}

/** A thief turn from a known cell, then back to the detectives. */
function thiefMove(state: GameState, x: number, y: number, extra: Record<string, unknown> = {}) {
  return act(state, THIEF, { a: "thiefTurn", dest: c(x, y), ...extra });
}

describe("setup (§4.1)", () => {
  const newGame = (rules = {}) =>
    createGame({
      board: CLASSIC_BOARD,
      rules: { ...DEFAULT_RULES, ...rules },
      seed: 11,
      thief: THIEF,
      detectives: [
        { character: "red", controller: D1 },
        { character: "blue", controller: D2 },
      ],
    });

  it("shuffles 6 open and 5 locked locks and starts with the paintings", () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = createGame({ board: CLASSIC_BOARD, rules: DEFAULT_RULES, seed, thief: THIEF, detectives: [{ character: "red", controller: D1 }] });
      expect(g.phase).toBe("setupPaintings");
      expect(g.locks.filter((l) => l.face === "open")).toHaveLength(6);
      expect(g.locks.filter((l) => l.face === "locked")).toHaveLength(5);
    }
  });

  it.each([
    [[4, 4], /corridors/],
    [[9, 10], /Power Room/],
    [[9, 11], /Power Room/],
    [[5, 1], /window/],
    [[3, 5], /doorway/],
    [[5, 10], /doorway/],
    [[0, 0], /outside/],
  ])("rejects a painting at %j", ([x, y], reason) => {
    expect(() => act(newGame(), D1, { a: "place", cell: c(x as number, y as number) })).toThrow(reason as RegExp);
  });

  it("allows paintings in the storeroom (R10) but not two on one cell or more than nine", () => {
    let g = act(newGame(), D1, { a: "place", cell: c(4, 11) });
    expect(g.paintings).toHaveLength(1);
    expect(() => act(g, D2, { a: "place", cell: c(4, 11) })).toThrow(/already a painting/);
    g = act(g, D1, { a: "autoPlace" });
    expect(g.paintings).toHaveLength(9);
    const free = board.walkable.find((x) => placementProblem(board, "painting", x, { ...occupancy(g), paintings: [] }) === null && !g.paintings.some((p) => p.cell === x))!;
    expect(() => act(g, D1, { a: "place", cell: free })).toThrow(/All 9/);
  });

  it("needs every main room covered before anyone can be ready", () => {
    let g = newGame();
    expect(() => act(g, D1, { a: "setupReady", ready: true })).toThrow(/9 more paintings/);
    // Nine paintings, but none in the Blue Gallery.
    for (const [x, y] of [[6, 1], [7, 1], [2, 3], [2, 7], [12, 9], [7, 6], [11, 6], [4, 10], [5, 5]]) g = act(g, D1, { a: "place", cell: c(x, y) });
    expect(() => act(g, D1, { a: "setupReady", ready: true })).toThrow(/Blue Gallery needs at least one painting/);
    g = act(g, D2, { a: "movePiece", from: c(7, 1), to: c(12, 4) });
    g = act(g, D1, { a: "setupReady", ready: true });
    expect(g.phase).toBe("setupPaintings");
    expect(waitingOn(g)).toEqual([D2]);
    g = act(g, D2, { a: "setupReady", ready: true });
    expect(g.phase).toBe("setupCameras");
  });

  it("resets readiness when the layout changes", () => {
    let g = act(newGame(), D1, { a: "autoPlace" });
    g = act(g, D1, { a: "setupReady", ready: true });
    g = act(g, D2, { a: "movePiece", from: g.paintings[0].cell, to: g.paintings[0].cell });
    expect(g.ready).toEqual({});
  });

  it("numbers cameras 1–6 and keeps numbers when they move", () => {
    let g = debugToPhase(newGame(), "setupCameras");
    expect(() => act(g, D1, { a: "place", cell: board.power })).toThrow(/power switch/);
    expect(() => act(g, D1, { a: "place", cell: g.paintings[0].cell })).toThrow(/painting/);
    g = act(g, D1, { a: "place", cell: c(4, 4) });
    g = act(g, D1, { a: "place", cell: c(9, 9) });
    g = act(g, D1, { a: "place", cell: c(1, 4) }); // next to a window is fine for cameras
    expect(g.cameras.map((x) => x.n)).toEqual([1, 2, 3]);
    g = act(g, D2, { a: "movePiece", from: c(4, 4), to: c(4, 5) });
    expect(g.cameras.find((x) => x.n === 1)!.cell).toBe(c(4, 5));
    g = act(g, D2, { a: "remove", cell: c(9, 9) });
    g = act(g, D2, { a: "place", cell: c(8, 10) });
    expect(g.cameras.find((x) => x.n === 2)!.cell).toBe(c(8, 10));
    expect(() => act(g, D2, { a: "place", cell: c(8, 10) })).toThrow(/already a camera/);
  });

  it("places detectives anywhere but on paintings or each other; cameras and P are fine", () => {
    let g = debugToPhase(newGame(), "setupDetectives");
    expect(() => act(g, D1, { a: "placeDetective", pawn: "d1", cell: g.paintings[0].cell })).toThrow(/painting/);
    g = act(g, D1, { a: "placeDetective", pawn: "d1", cell: board.power });
    expect(() => act(g, D2, { a: "placeDetective", pawn: "d2", cell: board.power })).toThrow(/Another detective/);
    g = act(g, D2, { a: "placeDetective", pawn: "d2", cell: g.cameras[0].cell });
    g = act(g, D1, { a: "setupReady", ready: true });
    g = act(g, D2, { a: "setupReady", ready: true });
    expect(g.phase).toBe("play");
    expect(g.turn).toEqual({ kind: "thief" });
  });

  it("keeps the thief out of setup", () => {
    expect(() => act(newGame(), THIEF, { a: "place", cell: c(6, 1) })).toThrow(/detectives set up/);
  });

  it("auto-place is always legal and complete", () => {
    const rng = mulberry32(5);
    for (let seed = 1; seed <= 150; seed++) {
      const g = createGame({ board: CLASSIC_BOARD, rules: DEFAULT_RULES, seed, thief: THIEF, detectives: [{ character: "red", controller: D1 }, { character: "blue", controller: D2 }, { character: "green", controller: D3 }] });
      // Start from a random partial (and possibly lopsided) layout sometimes.
      if (seed % 3 === 0) for (const x of [c(6, 1), c(7, 1), c(9, 1), c(6, 2), c(7, 2), c(9, 2), c(4, 1), c(4, 2), c(7, 5)]) if (placementProblem(board, "painting", x, occupancy(g)) === null) g.paintings.push({ id: g.paintings.length, cell: x, status: "hanging" });
      for (const phase of ["setupPaintings", "setupCameras", "setupDetectives"] as const) {
        g.phase = phase;
        autoPlace(g, rng);
        expect(setupProblem(g)).toBeNull();
      }
      for (const p of g.paintings) expect(placementProblem(board, "painting", p.cell, occupancy(g), p.cell)).toBeNull();
      for (const cam of g.cameras) expect(placementProblem(board, "camera", cam.cell, occupancy(g), cam.cell)).toBeNull();
      for (const d of g.detectives) expect(placementProblem(board, "detective", d.cell!, occupancy(g), d.cell!)).toBeNull();
      expect(new Set(g.paintings.map((p) => p.id)).size).toBe(9);
    }
  });

  it("lets the detectives place locks in the variant (R7), keeping faces from the thief", () => {
    let g = newGame({ lockPlacement: "detectives" });
    expect(g.phase).toBe("setupLocks");
    expect(g.locks.every((l) => l.face === null)).toBe(true);
    for (const l of g.locks) g = act(g, D1, { a: "setLock", slot: l.slot, face: "open" });
    expect(() => act(g, D1, { a: "setupReady", ready: true })).toThrow(/6 open and 5 locked/);
    for (const s of ["a", "b", "c", "d", "e"]) g = act(g, D2, { a: "setLock", slot: s, face: "locked" });
    g = act(g, D1, { a: "setupReady", ready: true });
    g = act(g, D2, { a: "setupReady", ready: true });
    expect(g.phase).toBe("setupPaintings");
    expect(viewFor(g, "detectives").locks.find((l) => l.slot === "a")!.face).toBe("locked");
    expect(viewFor(g, "thief").locks.find((l) => l.slot === "a")!.face).toBeUndefined();
    expect(viewFor(g, "thief").events.some((e) => e.type === "locksPlaced")).toBe(false);
  });
});

function debugToPhase(g: GameState, phase: GameState["phase"]): GameState {
  const s = structuredClone(g);
  const rng = mulberry32(3);
  while (s.phase !== phase) {
    autoPlace(s, rng);
    s.phase = s.phase === "setupLocks" ? "setupPaintings" : s.phase === "setupPaintings" ? "setupCameras" : s.phase === "setupCameras" ? "setupDetectives" : "play";
  }
  return s;
}

describe("thief turn (§4.3)", () => {
  it("enters for free on the first turn and then moves 1–3", () => {
    const g = inPlay();
    expect(() => act(g, THIEF, { a: "thiefTurn", dest: c(5, 3) })).toThrow(/window or door/);
    expect(() => act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 1) })).toThrow(/end somewhere new/); // R2
    expect(() => act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(4, 4) })).toThrow(/more than 3/);
    const next = act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(4, 3) }); // 3 steps from [5,1] (R1)
    expect(next.thief.cell).toBe(c(4, 3));
    expect(next.thief.entry).toBe("a");
    expect(next.thief.trail[0]).toMatchObject({ turn: 1, from: c(5, 1), entry: "a" });
    expect(next.turn).toMatchObject({ kind: "detective", pawn: "d1" });
    expect(() => thiefMove(detectiveTurn(next, D1, { move: 2, action: "eye" }, { a: "move", dest: c(4, 8) }, { a: "skipAction" }), 4, 4, { entry: "b" })).toThrow(/already inside/);
  });

  it("passes through detectives but never ends on one", () => {
    const g = inPlay({ detectives: [[5, 2], [9, 5], [6, 9]] });
    expect(() => act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 2) })).toThrow(/detective/);
    expect(act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) }).thief.cell).toBe(c(5, 3));
  });

  it("may enter through a slot whose inside cell holds a detective (D1)", () => {
    const g = inPlay({ detectives: [[5, 1], [9, 5], [6, 9]] });
    expect(act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) }).thief.cell).toBe(c(6, 1));
  });

  it("accepts an explicit simple path and rejects bad ones", () => {
    const g = inPlay();
    const ok = act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(7, 2), path: [c(5, 2), c(6, 2), c(7, 2)] });
    expect(ok.thief.trail[0].path).toEqual([c(5, 2), c(6, 2), c(7, 2)]);
    expect(() => act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1), path: [c(6, 1), c(5, 1)] })).toThrow(/twice/);
    expect(() => act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(7, 1), path: [c(6, 1)] })).toThrow(/doesn't end/);
  });

  it("only moves on the thief's turn and only for the thief", () => {
    const g = inPlay();
    expect(() => act(g, D1, { a: "thiefTurn", entry: "a", dest: c(6, 1) })).toThrow(/Only the thief/);
    const next = act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    expect(() => act(next, THIEF, { a: "thiefTurn", dest: c(5, 2) })).toThrow(/not the thief's turn/);
  });
});

describe("stealing: the one-turn delay (§4.3, §4.9)", () => {
  // Painting 0 hangs at [6,1]; detective d1 waits at [7,2], two steps away.
  const start = () => inPlay({ detectives: [[7, 2], [9, 5], [6, 9]] });

  it("marks a painting secretly and removes it at the start of the next thief turn", () => {
    let g = act(start(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    expect(g.thief.pending).toBe(0);
    expect(g.thief.stolen).toEqual([0]);
    expect(viewFor(g, "thief").paintings[0].status).toBe("pending");
    expect(detView(g).paintings[0].status).toBe("hanging");
    expect(detView(g).thief.haul).toBe(0);
    expect(detView(g).events.some((e) => e.type === "paintingStolen")).toBe(false);

    // The painting protects the thief: a detective can't end on it, so can't make the arrest.
    const rolled = detectiveTurn(g, D1, { move: 2, action: "eye" });
    expect(() => act(rolled, D1, { a: "move", dest: c(6, 1) })).toThrow(/painting/);

    g = act(rolled, D1, { a: "move", dest: c(7, 1) });
    g = act(g, D1, { a: "skipAction" });
    // Detective turn over: the painting comes off the board, publicly, before the thief moves.
    const vanished = detView(g).events.find((e) => e.type === "paintingVanished");
    expect(vanished).toMatchObject({ painting: 0, cell: c(6, 1), vis: "all" });
    expect(g.paintings[0].status).toBe("stolen");
    expect(g.lastSeen).toEqual({ cell: c(6, 1), atThiefTurn: 1, reason: "painting" });
    expect(detView(g).thief.haul).toBe(1);
    expect(g.turn.kind).toBe("thief");
  });

  it("is mandatory: ending on a painting always steals it", () => {
    const g = act(start(), THIEF, { a: "thiefTurn", entry: "b", dest: c(7, 1) });
    expect(g.thief.stolen).toEqual([]);
    const g2 = act(start(), THIEF, { a: "thiefTurn", entry: "b", dest: c(6, 1) });
    expect(g2.thief.stolen).toEqual([0]);
  });

  it("revealed thieves steal immediately (§4.7)", () => {
    let g = thiefAt(inPlay({ detectives: [[9, 1], [9, 5], [6, 9]] }), 4, 1);
    g.thief.revealed = true;
    const { state, events } = actEvents(g, THIEF, { a: "thiefTurn", dest: c(6, 1) });
    g = state;
    expect(g.paintings[0].status).toBe("stolen");
    expect(g.thief.pending).toBeNull();
    expect(events.find((e) => e.type === "paintingStolen")).toMatchObject({ vis: "all", pending: false });
    expect(detView(g).thief.cell).toBe(c(6, 1));
  });

  it("a reveal while standing on a pending painting removes it at once (R3)", () => {
    let g = act(inPlay({ detectives: [[9, 1], [9, 5], [6, 9]] }), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" });
    expect(g.thief.revealed).toBe(true);
    expect(g.paintings[0].status).toBe("stolen");
    expect(g.thief.pending).toBeNull();
    const ev = detView(g).events.filter((e) => e.type === "paintingStolen");
    expect(ev).toEqual([expect.objectContaining({ painting: 0, onReveal: true, vis: "all" })]);
    g = act(g, D1, { a: "move", dest: c(9, 2) });
    // No second removal at the start of the thief turn.
    expect(detView(g).events.some((e) => e.type === "paintingVanished")).toBe(false);
  });
});

describe("eyes and cameras (§4.4, §4.6)", () => {
  it("reveals the thief when a detective sees them, through doorways", () => {
    // Detective at [6,3] looks straight down x=6 to [6,10].
    let g = thiefAt(inPlay({ detectives: [[6, 3], [9, 5], [4, 9]] }), 7, 10, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 10) });
    g = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "eye", target: "self" });
    expect(g.thief.revealed).toBe(true);
    expect(detView(g).thief.cell).toBe(c(6, 10));
    expect(g.lastSeen?.reason).toBe("revealed");
    expect(g.thief.sightings).toBe(1);
  });

  it("answers no when a wall is in the way", () => {
    let g = thiefAt(inPlay({ detectives: [[5, 3], [9, 5], [4, 9]] }), 5, 6, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(5, 5) });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" });
    expect(g.thief.revealed).toBe(false);
    expect(g.events.at(-1)).toMatchObject({ type: "eye", seen: false });
  });

  it("camera sightings are public yes/no and never reveal (R18); a camera sees its own cell", () => {
    let g = thiefAt(inPlay({ cameras: [[6, 6], [9, 3], [4, 9], [9, 9], [2, 4], [11, 7]] }), 6, 7, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 6) });
    g = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "eye", target: 1 });
    expect(g.events.filter((e) => e.type === "camera").at(-1)).toMatchObject({ n: 1, result: "sees", vis: "all" });
    expect(g.thief.revealed).toBe(false);
    expect(detView(g).thief.cell).toBeNull();
  });

  it("a disabled camera is found dead and removed", () => {
    let g = thiefAt(inPlay(), 4, 2, "a");
    g.thief.cell = c(5, 3);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(4, 3), disableCamera: true }); // camera 1
    expect(g.cameras[0].disabled).toBe(true);
    expect(detView(g).cameras[0]).toEqual({ n: 1, cell: c(4, 3) });
    expect(viewFor(g, "thief").cameras[0].disabled).toBe(true);
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: 1 });
    expect(g.events.filter((e) => e.type === "camera").at(-1)).toMatchObject({ result: "dead" });
    expect(g.cameras[0].removed).toBe(true);
    expect(detView(g).cameras.map((x) => x.n)).toEqual([2, 3, 4, 5, 6]);
    expect(() => detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: 1 })).toThrow();
  });

  it("disabling a camera is optional and needs a working one", () => {
    let g = thiefAt(inPlay(), 5, 3);
    expect(act(g, THIEF, { a: "thiefTurn", dest: c(4, 3) }).cameras[0].disabled).toBe(false);
    expect(() => act(g, THIEF, { a: "thiefTurn", dest: c(6, 3), disableCamera: true })).toThrow(/no working camera/);
  });

  it("scan removes disabled cameras first, then lists the working ones that see the thief", () => {
    let g = thiefAt(inPlay({ cameras: [[4, 3], [9, 3], [4, 9], [9, 9], [2, 4], [11, 7]] }), 5, 3);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(4, 3), disableCamera: true });
    // Thief stands on dead camera 1 at [4,3]; camera 2 at [9,3] looks along y=3 and camera 3 at
    // [4,9] up x=4, so both see [4,3].
    g = detectiveTurn(g, D1, { move: 1, action: "scan" }, { a: "scan" });
    const scan = g.events.find((e) => e.type === "scan")!;
    expect(scan).toMatchObject({ result: "ok", removed: [1], seeing: [2, 3], vis: "all" });
    expect((scan as { checked: number[] }).checked).toEqual([2, 3, 4, 5, 6]);
    expect(g.cameras[0].removed).toBe(true);
    expect(g.thief.revealed).toBe(false);
  });

  it("uses the die face that was rolled", () => {
    const g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    expect(() => detectiveTurn(g, D1, { move: 1, action: "scan" }, { a: "eye", target: "self" })).toThrow(/rolled Scan/);
    expect(() => detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "motion" })).toThrow(/rolled an Eye/);
    expect(() => detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" }, { a: "eye", target: "self" })).toThrow(/already used/);
  });
});

describe("power (§4.5, R6)", () => {
  const cut = () => {
    let g = thiefAt(inPlay({ detectives: [[4, 6], [9, 5], [6, 9]] }), 9, 9, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 11), cutPower: true });
    return g;
  };

  it("is cut secretly at P", () => {
    const g = cut();
    expect(g.power).toEqual({ cut: true, discovered: false });
    expect(detView(g).power).toEqual({ cut: false, discovered: false });
    expect(viewFor(g, "thief").power.cut).toBe(true);
    expect(detView(g).events.some((e) => e.type === "powerCut")).toBe(false);
  });

  it("can only be cut at the switch, when on", () => {
    const g = thiefAt(inPlay(), 9, 9, "f");
    expect(() => act(g, THIEF, { a: "thiefTurn", dest: c(9, 10), cutPower: true })).toThrow(/switch/);
    expect(act(g, THIEF, { a: "thiefTurn", dest: c(9, 11) }).power.cut).toBe(false); // optional
  });

  it.each([
    ["an eye on a camera", { move: 1, action: "eye" as const }, { a: "eye" as const, target: 2 }],
    ["a scan", { move: 1, action: "scan" as const }, { a: "scan" as const }],
    ["the motion detectors", { move: 1, action: "motion" as const }, { a: "motion" as const }],
  ])("is discovered by %s, which spends the action", (_, roll, action) => {
    const g = detectiveTurn(cut(), D1, roll, action);
    expect(g.power).toEqual({ cut: true, discovered: true });
    expect(detView(g).power).toEqual({ cut: true, discovered: true });
    expect(detView(g).events.some((e) => e.type === "powerOutDiscovered")).toBe(true);
    const turn = g.turn as Extract<GameState["turn"], { kind: "detective" }>;
    expect(turn.acted).toBe(true);
    expect(turn.awaitingThief).toBe(false);
  });

  it("eyes still work in the dark", () => {
    const g = detectiveTurn(cut(), D1, { move: 1, action: "eye" }, { a: "eye", target: "self" });
    expect(g.power.discovered).toBe(false);
  });

  it("is restored silently when undiscovered, telling only the thief", () => {
    let g = cut();
    // d1 at [4,6] can't reach P; put it next door.
    g.detectives[0].cell = c(9, 10);
    g.thief.cell = c(8, 10);
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "move", dest: c(9, 11) });
    expect(g.power).toEqual({ cut: false, discovered: false });
    expect(viewFor(g, "thief").events.at(-1)).toMatchObject({ type: "powerRestored", silent: true, vis: "thief" });
    expect(detView(g).events.some((e) => e.type === "powerRestored")).toBe(false);
  });

  it("is restored publicly once discovered; disabled cameras stay disabled; it can be cut again", () => {
    let g = thiefAt(inPlay({ cameras: [[9, 10], [9, 3], [4, 9], [9, 9], [2, 4], [11, 7]], detectives: [[8, 11], [9, 5], [6, 3]] }), 9, 9, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 10), disableCamera: true });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: "self" }, { a: "move", dest: c(8, 10) });
    g.thief.revealed = false;
    g.thief.cell = c(9, 10);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 11), cutPower: true });
    g = detectiveTurn(g, D2, { move: 1, action: "scan" }, { a: "scan" }, { a: "move", dest: c(10, 5) });
    expect(g.power.discovered).toBe(true);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 9) });
    g = detectiveTurn(g, D3, { move: 6, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(7, 3) });
    g.detectives[0].cell = c(8, 11);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 8) });
    // d1 walks onto P.
    g = detectiveTurn(g, D1, { move: 3, action: "eye" }, { a: "move", dest: c(9, 11) });
    expect(detView(g).events.find((e) => e.type === "powerRestored")).toMatchObject({ silent: false, vis: "all" });
    expect(g.power.cut).toBe(false);
    expect(g.cameras[0].disabled).toBe(true);
    g = act(g, D1, { a: "skipAction" });
    // Cutting again after a restore is allowed.
    g.detectives[0].cell = c(4, 4);
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 10) });
    g = detectiveTurn(g, D2, { move: 2, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(10, 5) });
    g = act(g, THIEF, { a: "thiefTurn", dest: c(9, 11), cutPower: true });
    expect(g.power.cut).toBe(true);
  });
});

describe("motion detectors and snips (§4.4)", () => {
  const asked = (state?: GameState) => {
    const g = thiefAt(state ?? inPlay(), 2, 7, "i");
    return detectiveTurn(act(g, THIEF, { a: "thiefTurn", dest: c(2, 8) }), D1, { move: 2, action: "motion" }, { a: "motion" });
  };

  it("blocks the detective until the thief answers with their floor colour", () => {
    let g = asked();
    expect(waitingOn(g)).toEqual([THIEF]);
    expect(() => act(g, D1, { a: "move", dest: c(4, 7) })).toThrow(/Waiting for the thief/);
    expect(() => act(g, D1, { a: "motionResponse", snip: false })).toThrow(/Only the thief/);
    g = act(g, THIEF, { a: "motionResponse", snip: false });
    expect(g.events.at(-1)).toMatchObject({ type: "motion", result: "answered", colour: "yellow", vis: "all" });
    expect(colourOf(board, c(2, 8))).toBe("yellow");
    g = act(g, D1, { a: "move", dest: c(4, 7) });
    expect(g.turn.kind).toBe("thief");
  });

  it("allows two public snips per round, then answers automatically", () => {
    let g = act(asked(), THIEF, { a: "motionResponse", snip: true });
    expect(g.thief.snipsLeft).toBe(1);
    expect(detView(g).events.at(-1)).toMatchObject({ type: "motion", result: "snipped", snipsLeft: 1, vis: "all" });
    g.thief.snipsLeft = 0;
    g = act(g, D1, { a: "move", dest: c(4, 7) });
    g = act(g, THIEF, { a: "thiefTurn", dest: c(2, 7) });
    g = detectiveTurn(g, D2, { move: 1, action: "motion" }, { a: "motion" });
    expect((g.turn as { awaitingThief: boolean }).awaitingThief).toBe(false);
    expect(g.events.at(-1)).toMatchObject({ type: "motion", result: "answered", colour: "yellow", snipsLeft: 0 });
    const out = structuredClone(asked());
    out.thief.snipsLeft = 0;
    (out.turn as { awaitingThief: boolean }).awaitingThief = true;
    expect(() => act(out, THIEF, { a: "motionResponse", snip: true })).toThrow(/out of wire snips/);
  });
});

describe("locks and escape (§4.3, R4, R11, R14, R15)", () => {
  const withHaul = (n: number, locks = {}) => {
    const g = thiefAt(inPlay({ locks }), 5, 3, "a");
    g.thief.stolen = Array.from({ length: n }, (_, i) => 8 - i);
    for (const id of g.thief.stolen) g.paintings[id].status = "stolen";
    return g;
  };

  it("needs the minimum haul (pending paintings count)", () => {
    expect(() => act(withHaul(2), THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true })).toThrow(/at least 3/);
    const pending = withHaul(2);
    pending.paintings[6].status = "pending";
    pending.thief.pending = 6;
    pending.thief.stolen.push(6);
    expect(() => act(pending, THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true })).not.toThrow();
    expect(() => act(withHaul(1), THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true })).toThrow();
    const lenient = withHaul(1);
    lenient.rules.minPaintingsToEscape = 1;
    expect(() => act(lenient, THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true })).not.toThrow();
  });

  it("flips a locked lock openly: position public, pawn stays off, lock unusable (R4)", () => {
    let g = act(withHaul(3), THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true });
    expect(g.phase).toBe("play");
    const dv = detView(g);
    expect(dv.locks.find((l) => l.slot === "a")).toEqual({ slot: "a", revealed: true, face: "locked" });
    expect(dv.events.find((e) => e.type === "lockTried")).toMatchObject({ slot: "a", face: "locked", cell: c(5, 1), vis: "all" });
    expect(dv.thief.cell).toBeNull();
    expect(dv.thief.revealed).toBe(false);
    expect(g.lastSeen).toEqual({ cell: c(5, 1), atThiefTurn: 2, reason: "lock" });
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(4, 5) });
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 1) });
    g = detectiveTurn(g, D2, { move: 1, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(9, 4) });
    expect(() => act(g, THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true })).toThrow(/already been tried/);
  });

  it("trying is optional (R15)", () => {
    const g = act(withHaul(3, { a: "open" }), THIEF, { a: "thiefTurn", dest: c(5, 1) });
    expect(g.phase).toBe("play");
    expect(g.locks[0].revealed).toBe(false);
  });

  it("escapes through an open lock, even the entry one (R14)", () => {
    const { state, events } = actEvents(withHaul(3, { a: "open" }), THIEF, { a: "thiefTurn", dest: c(5, 1), tryLock: true });
    expect(state.phase).toBe("roundOver");
    expect(state.result).toEqual({ winner: "thief", reason: "escaped", paintings: 3, slot: "a", cell: c(5, 1) });
    expect(events.map((e) => e.type)).toEqual(["thiefMoved", "thiefMoved", "lockTried", "escaped", "roundOver"]);
    expect(viewFor(state, "detectives").viewer).toBe("omniscient");
  });

  it("can disable a camera and try a lock in the same turn", () => {
    const g = withHaul(3, { a: "open" });
    g.cameras[0].cell = c(5, 1);
    const next = act(g, THIEF, { a: "thiefTurn", dest: c(5, 1), disableCamera: true, tryLock: true });
    expect(next.cameras[0].disabled).toBe(true);
    expect(next.result?.winner).toBe("thief");
  });

  it("rejects trying a lock away from one", () => {
    expect(() => act(withHaul(3), THIEF, { a: "thiefTurn", dest: c(6, 3), tryLock: true })).toThrow(/no lock/);
  });
});

describe("detective movement and capture (§4.4, §4.7)", () => {
  it("captures a hidden thief by ending on their cell", () => {
    let g = thiefAt(inPlay({ detectives: [[6, 3], [9, 5], [4, 9]] }), 6, 6, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 5) });
    g = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "move", dest: c(6, 5) });
    expect(g.phase).toBe("roundOver");
    expect(g.result).toMatchObject({ winner: "detectives", reason: "captured", by: "d1", cell: c(6, 5) });
    expect(g.events.find((e) => e.type === "captured")).toMatchObject({ wasHidden: true });
  });

  it("passing through the thief does nothing", () => {
    let g = thiefAt(inPlay({ detectives: [[6, 3], [9, 5], [4, 9]] }), 6, 6, "f");
    g = act(g, THIEF, { a: "thiefTurn", dest: c(6, 5) });
    g = detectiveTurn(g, D1, { move: 3, action: "eye" }, { a: "move", dest: c(6, 6) });
    expect(g.phase).toBe("play");
    expect(g.thief.revealed).toBe(false);
    const moved = detView(g).events.at(-1)!;
    expect(moved).toMatchObject({ type: "detectiveMoved", to: c(6, 6) });
    expect(detView(g).thief.cell).toBeNull();
  });

  it("must move on a 1 unless the stay house rule is on (R5)", () => {
    const g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    expect(() => detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "move", dest: c(4, 6) })).toThrow(/rolled a 1/);
    expect(detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "move", dest: c(4, 6) }).detectives[0].cell).toBe(c(4, 6));
    const lenient = structuredClone(g);
    lenient.rules.detectiveMayStay = true;
    expect(detectiveTurn(lenient, D1, { move: 1, action: "eye" }, { a: "move", dest: c(4, 6) }).detectives[0].cell).toBe(c(4, 6));
  });

  it("rejects moves that are too far, onto paintings or onto detectives", () => {
    const g = act(inPlay({ detectives: [[4, 6], [4, 7], [6, 9]] }), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    const rolled = detectiveTurn(g, D1, { move: 2, action: "eye" });
    expect(() => act(rolled, D1, { a: "move", dest: c(4, 7) })).toThrow(/Another detective/);
    expect(() => act(rolled, D1, { a: "move", dest: c(4, 9) })).toThrow(/more than 2/);
    expect(() => act(rolled, D1, { a: "move", dest: c(5, 5) })).toThrow(/painting/);
    expect(() => act(rolled, D1, { a: "move", dest: c(0, 0) })).toThrow(/outside/);
    expect(() => act(rolled, D2, { a: "move", dest: c(4, 5) })).toThrow(/not your turn/);
  });

  it("may act before or after moving, and ends the turn automatically", () => {
    const g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    const actFirst = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "eye", target: "self" });
    expect(actFirst.turn.kind).toBe("detective");
    expect(act(actFirst, D1, { a: "move", dest: c(4, 5) }).turn.kind).toBe("thief");
    const moveFirst = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "move", dest: c(4, 5) });
    expect(moveFirst.turn.kind).toBe("detective");
    expect(() => act(moveFirst, D1, { a: "move", dest: c(4, 6) })).toThrow(/already moved/);
    expect(act(moveFirst, D1, { a: "endTurn" }).turn.kind).toBe("thief");
    expect(() => detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "endTurn" })).toThrow(/Move before/);
    expect(() => act(g, D1, { a: "move", dest: c(4, 5) })).toThrow(/Roll/);
  });

  it("skips the move when boxed in (D2)", () => {
    // d1 at [12,9]'s neighbours: [11,9] detective, [12,8] painting.
    const g = act(inPlay({ detectives: [[12, 9], [11, 9], [6, 9]], paintings: [[6, 1], [2, 3], [12, 4], [2, 7], [12, 8], [7, 6], [11, 6], [4, 10], [5, 5]] }), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 2) });
    const rolled = detectiveTurn(g, D1, { move: 1, action: "eye" });
    expect(rolled.events.at(-1)).toMatchObject({ type: "boxedIn", pawn: "d1" });
    expect(act(rolled, D1, { a: "eye", target: "self" }).turn.kind).toBe("thief");
  });
});

describe("turn order (§4.2)", () => {
  const cycle = (g: GameState, controllers: string[]) => {
    const pawns: string[] = [];
    let s = g;
    let spot = 0;
    const spots = [[5, 3], [5, 2]];
    for (let i = 0; i < 6; i++) {
      const [x, y] = spots[spot++ % 2];
      s = act(s, THIEF, s.thief.cell === null ? { a: "thiefTurn", entry: "a", dest: c(5, 3) } : { a: "thiefTurn", dest: c(x, y) });
      const turn = s.turn as { pawn: string };
      pawns.push(turn.pawn);
      const pawn = s.detectives.find((d) => d.id === turn.pawn)!;
      expect(controllers).toContain(pawn.controller);
      s = detectiveTurn(s, pawn.controller, { move: 2, action: "eye" }, { a: "skipAction" }, { a: "move", dest: pawn.cell! });
    }
    return pawns;
  };

  it("alternates thief and detectives: T D1 T D2 T D3 T D1", () => {
    expect(cycle(inPlay(), [D1, D2, D3])).toEqual(["d1", "d2", "d3", "d1", "d2", "d3"]);
  });

  it("gives one human two detectives in a 2-seat game, with separate turns", () => {
    const g = inPlay({ detectives: [[4, 6], [9, 5]], controllers: [D1, D1] });
    expect(cycle(g, [D1])).toEqual(["d1", "d2", "d1", "d2", "d1", "d2"]);
  });

  it("ends at dawn when the house rule is on", () => {
    let g = inPlay({ rules: { dawnAfterThiefTurns: 2 } });
    g = act(g, THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    g = detectiveTurn(g, D1, { move: 2, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(4, 6) });
    g = act(g, THIEF, { a: "thiefTurn", dest: c(5, 2) });
    g = detectiveTurn(g, D2, { move: 2, action: "eye" }, { a: "skipAction" }, { a: "move", dest: c(9, 5) });
    expect(g.phase).toBe("roundOver");
    expect(g.result).toMatchObject({ winner: "detectives", reason: "dawn" });
  });
});

describe("dice", () => {
  it("roll 1–6 and 4 Eye / 1 Scan / 1 Motion (R13), deterministically per seed", () => {
    expect(ACTION_DIE.filter((f) => f === "eye")).toHaveLength(4);
    const counts: Record<string, number> = { eye: 0, scan: 0, motion: 0 };
    const moves = new Set<number>();
    let g = act(inPlay({ seed: 99 }), THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    for (let i = 0; i < 3000; i++) {
      const r = apply(g, D1, { a: "roll" }).state;
      const roll = (r.turn as { roll: { move: number; action: string } }).roll;
      counts[roll.action]++;
      moves.add(roll.move);
      g = { ...g, rng: r.rng };
    }
    expect([...moves].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(counts.eye / 3000).toBeCloseTo(4 / 6, 1);
    expect(counts.scan / 3000).toBeCloseTo(1 / 6, 1);
    const a = apply(inPlay({ seed: 5 }), THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) }).state;
    expect(apply(a, D1, { a: "roll" }).state.turn).toEqual(apply(a, D1, { a: "roll" }).state.turn);
  });

  it("can be forced for debugging", () => {
    const g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(5, 3) });
    debugOps.forceRoll(g, { move: 6, action: "motion" });
    expect(act(g, D1, { a: "roll" }).turn).toMatchObject({ roll: { move: 6, action: "motion" } });
  });
});

describe("marks", () => {
  it("are detectives-only team state", () => {
    let g = act(inPlay(), D1, { a: "mark", cell: c(6, 6), on: true });
    g = act(g, D2, { a: "mark", cell: c(7, 7), on: true });
    expect(detView(g).marks).toEqual([c(6, 6), c(7, 7)]);
    expect(viewFor(g, "thief").marks).toEqual([]);
    expect(() => act(g, THIEF, { a: "mark", cell: c(6, 6), on: true })).toThrow(/Only detectives/);
    const off = inPlay({ rules: { assist: "off" } });
    expect(() => act(off, D1, { a: "mark", cell: c(6, 6), on: true })).toThrow(/turned off/);
    expect(act(g, D1, { a: "clearMarks" }).marks).toEqual([]);
  });
});

it("board fixture sanity", () => {
  expect(getBoard(CLASSIC_BOARD).walkable).toHaveLength(104);
});
