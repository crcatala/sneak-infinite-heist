import { describe, expect, it } from "vitest";
import { intentToSend, remotePreview } from "../src/client/game/remote";
import { detectiveEnds } from "../src/client/game/derive";
import { legalOutline } from "../src/client/game/colours";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { DEFAULT_RULES } from "../src/shared/game/config";
import { createGame } from "../src/shared/game/setup";
import type { GameState } from "../src/shared/game/state";
import { viewFor, type Viewer } from "../src/shared/game/views";
import type { Intent, RoomView } from "../src/shared/protocol";
import { act, board, c, D1, D2, D3, inPlay, THIEF } from "./helpers";

const NAMES: Record<string, string> = { [D1]: "Alex", [D2]: "Jo", [D3]: "Max", [THIEF]: "Sam" };

function room(state: GameState, you: string, as: Viewer = "detectives"): { view: RoomView; game: ReturnType<typeof viewFor> } {
  const game = viewFor(state, as);
  const role = you === THIEF ? "thief" : as === "spectator" ? "spectator" : "detective";
  const players = Object.entries(NAMES).map(([id, name]) => ({ id, name, connected: true }));
  return { view: { you, role, players, spectators: [] } as unknown as RoomView, game };
}

/** d1 (red, at 4,6) has rolled a 3 and an Eye. */
function rolled(): GameState {
  let g = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
  g.forcedRoll = { move: 3, action: "eye" };
  g = act(g, D1, { a: "roll" });
  return g;
}
const none = new Set<number>();

describe("what others see of a detective's turn", () => {
  it("shows the reach outline to everyone but the mover, as soon as the roll lands", () => {
    const g = rolled();
    const ends = detectiveEnds(viewFor(g, "detectives"), viewFor(g, "detectives").detectives[0], 3);
    for (const who of [D2, THIEF]) {
      const { view, game } = room(g, who, who === THIEF ? "thief" : "detectives");
      const p = remotePreview(view, game, {}, none);
      expect(new Set(p.tiles.map((t) => t.cell))).toEqual(new Set(ends.keys()));
      expect(p.tiles.every((t) => t.style === 5 && t.colour === legalOutline("#e8484f"))).toBe(true);
    }
    const mover = room(g, D1);
    expect(remotePreview(mover.view, mover.game, {}, none).tiles).toEqual([]);
    const watcher = room(g, "w", "spectator");
    expect(remotePreview(watcher.view, watcher.game, {}, none).tiles.length).toBe(ends.size);
  });

  it("leaves gaps for the thief's danger brackets on watched spaces", () => {
    const g = rolled();
    const { view, game } = room(g, THIEF, "thief");
    const first = [...detectiveEnds(game, game.detectives[0], 3).keys()][0];
    const p = remotePreview(view, game, {}, new Set([first]));
    expect(p.tiles.find((t) => t.cell === first)!.style).toBe(6);
  });

  it("shows nothing before the roll, after the move, or while the thief answers", () => {
    const fresh = act(inPlay(), THIEF, { a: "thiefTurn", entry: "a", dest: c(6, 1) });
    const a = room(fresh, D2);
    expect(remotePreview(a.view, a.game, {}, none).tiles).toEqual([]);
    const moved = act(rolled(), D1, { a: "move", dest: c(4, 5) });
    const b = room(moved, D2);
    expect(remotePreview(b.view, b.game, {}, none).tiles).toEqual([]);
  });

  it("draws a chosen space with its route, ghost pawn, step count and tag", () => {
    const g = rolled();
    const { view, game } = room(g, D2);
    const dest = c(4, 3); // three steps north of (4,6)
    const p = remotePreview(view, game, { [D1]: { k: "turn", pawn: "d1", move: dest } }, none);
    expect(p.tiles.at(-1)).toMatchObject({ cell: dest, colour: "#e8484f", style: 0 });
    expect(p.badges).toEqual([{ cell: dest, n: 3, colour: "#e8484f" }]);
    expect(p.pawnGhost).toEqual({ pawn: "d1", cell: dest });
    expect(p.path?.path.at(-1)).toBe(dest);
    expect(p.tags).toEqual([{ cell: dest, text: "Alex · 3 steps", colour: "#e8484f" }]);
  });

  it("ignores an intent that doesn't fit the board: wrong pawn, wrong sender, unreachable space, own echo", () => {
    const g = rolled();
    const { view, game } = room(g, D2);
    const reach = remotePreview(view, game, {}, none).tiles.length;
    const bad: Record<string, Intent>[] = [
      { [D1]: { k: "turn", pawn: "d2", move: c(4, 5) } },
      { [D3]: { k: "turn", pawn: "d1", move: c(4, 5) } },
      { [D1]: { k: "turn", pawn: "d1", move: c(13, 0) } },
      { [D1]: { k: "turn", pawn: "d1", move: board.walkable[0] } },
    ];
    for (const intents of bad) expect(remotePreview(view, game, intents, none).tiles).toHaveLength(reach);
    const mover = room(g, D1);
    expect(remotePreview(mover.view, mover.game, { [D1]: { k: "turn", pawn: "d1", move: c(4, 5) } }, none).tags).toEqual([]);
  });

  it("drops a stale intent once the move is confirmed or the sender is gone", () => {
    const intent: Record<string, Intent> = { [D1]: { k: "turn", pawn: "d1", move: c(4, 5) } };
    const moved = room(act(rolled(), D1, { a: "move", dest: c(4, 5) }), D2);
    expect(remotePreview(moved.view, moved.game, intent, none).tags).toEqual([]);
    const live = room(rolled(), D2);
    expect(remotePreview(live.view, live.game, intent, none).tags).toHaveLength(1);
    (live.view.players.find((p) => p.id === D1) as { connected: boolean }).connected = false;
    expect(remotePreview(live.view, live.game, intent, none).tags).toEqual([]);
  });

  it("lights up an Eye target: own sightline, or a camera's, and names who is asking", () => {
    const g = rolled();
    const { view, game } = room(g, THIEF, "thief");
    const self = remotePreview(view, game, { [D1]: { k: "turn", pawn: "d1", eye: "self" } }, none);
    const sight = new Set(board.sight[game.detectives[0].cell!]);
    expect(new Set(self.tiles.filter((t) => t.colour === "#6fe8ff").map((t) => t.cell))).toEqual(sight);
    expect(self.tags[0].text).toBe("Alex · Eye");
    const cam = game.cameras.find((k) => k.n === 2)!;
    const camera = remotePreview(view, game, { [D1]: { k: "turn", pawn: "d1", move: c(4, 5), eye: 2 } }, none);
    expect(new Set(camera.tiles.filter((t) => t.colour === "#6fe8ff").map((t) => t.cell))).toEqual(new Set(board.sight[cam.cell]));
    expect(camera.tags.map((t) => t.text)).toEqual(["Alex · 1 step", "Alex · asking camera 2"]);
  });

  it("merges 'Eye' into the move tag when looking from the chosen space", () => {
    const { view, game } = room(rolled(), D2);
    const p = remotePreview(view, game, { [D1]: { k: "turn", pawn: "d1", move: c(4, 3), eye: "self" } }, none);
    expect(p.tags).toEqual([{ cell: c(4, 3), text: "Alex · 3 steps · Eye", colour: "#e8484f" }]);
    expect(p.tiles.filter((t) => t.colour === "#6fe8ff").map((t) => t.cell).sort()).toEqual([...board.sight[c(4, 3)]].sort());
  });

  it("ignores an Eye target when the die isn't an Eye, and camera targets while the power is out", () => {
    const g = rolled();
    g.forcedRoll = undefined;
    (g.turn as { roll: { action: string } }).roll.action = "scan";
    const a = room(g, D2);
    expect(remotePreview(a.view, a.game, { [D1]: { k: "turn", pawn: "d1", eye: "self" } }, none).tags).toEqual([]);
    const dark = rolled();
    dark.power = { cut: true, discovered: true };
    const b = room(dark, D2);
    expect(remotePreview(b.view, b.game, { [D1]: { k: "turn", pawn: "d1", eye: 1 } }, none).tags).toEqual([]);
  });
});

describe("what others see during setup", () => {
  function setup(phase: GameState["phase"]): GameState {
    const g = createGame({ board: CLASSIC_BOARD, rules: DEFAULT_RULES, seed: 1, thief: THIEF, detectives: [D1, D2].map((controller, i) => ({ character: (["red", "blue"] as const)[i], controller })) });
    g.phase = phase;
    g.paintings = [{ id: 0, cell: c(6, 1), status: "hanging" }];
    g.cameras = [{ n: 1, cell: c(4, 3), disabled: false, removed: false }];
    g.detectives[0].cell = c(4, 6);
    return g;
  }

  it("rings a lifted painting or camera in the holder's colour with a tag", () => {
    const { view, game } = room(setup("setupPaintings"), THIEF, "thief");
    const p = remotePreview(view, game, { [D1]: { k: "lift", piece: "painting", cell: c(6, 1) } }, none);
    expect(p.tiles).toEqual([{ cell: c(6, 1), colour: "#e8484f", alpha: 0.6, style: 2, pulse: true }]);
    expect(p.tags).toEqual([{ cell: c(6, 1), text: "Alex is moving a painting", colour: "#e8484f" }]);
    const cams = room(setup("setupCameras"), D2);
    expect(remotePreview(cams.view, cams.game, { [D1]: { k: "lift", piece: "camera", cell: c(4, 3) } }, none).tags[0].text).toBe("Alex is moving a camera");
  });

  it("rings a lifted pawn", () => {
    const { view, game } = room(setup("setupDetectives"), D2);
    const p = remotePreview(view, game, { [D1]: { k: "liftPawn", pawn: "d1" } }, none);
    expect(p.tags).toEqual([{ cell: c(4, 6), text: "Alex is moving Cinnabar", colour: "#e8484f" }]);
  });

  it("ignores a lift in the wrong phase, of a piece that isn't there, or of a pawn not on the board", () => {
    const wrongPhase = room(setup("setupCameras"), D2);
    expect(remotePreview(wrongPhase.view, wrongPhase.game, { [D1]: { k: "lift", piece: "painting", cell: c(6, 1) } }, none).tags).toEqual([]);
    const { view, game } = room(setup("setupPaintings"), D2);
    expect(remotePreview(view, game, { [D1]: { k: "lift", piece: "painting", cell: c(2, 2) } }, none).tags).toEqual([]);
    const pawns = room(setup("setupDetectives"), D1);
    expect(remotePreview(pawns.view, pawns.game, { [D2]: { k: "liftPawn", pawn: "d2" } }, none).tags).toEqual([]);
  });
});

describe("what a detective shares", () => {
  const ui = { moveDest: null, eyeTarget: null, held: null } as const;

  it("is nothing until something is chosen, and hovering never counts", () => {
    const { view, game } = room(rolled(), D1);
    expect(intentToSend(view, game, ui)).toBeNull();
  });

  it("is the chosen space and Eye target while it's their turn", () => {
    const { view, game } = room(rolled(), D1);
    expect(intentToSend(view, game, { ...ui, moveDest: c(4, 5) })).toEqual({ k: "turn", pawn: "d1", move: c(4, 5) });
    expect(intentToSend(view, game, { ...ui, eyeTarget: "self" })).toEqual({ k: "turn", pawn: "d1", eye: "self" });
    expect(intentToSend(view, game, { moveDest: c(4, 5), eyeTarget: 3, held: null })).toEqual({ k: "turn", pawn: "d1", move: c(4, 5), eye: 3 });
  });

  it("drops the part that's already used", () => {
    const g = act(rolled(), D1, { a: "move", dest: c(4, 5) });
    const { view, game } = room(g, D1);
    expect(intentToSend(view, game, { ...ui, moveDest: c(4, 4) })).toBeNull();
    expect(intentToSend(view, game, { ...ui, eyeTarget: "self" })).toEqual({ k: "turn", pawn: "d1", eye: "self" });
  });

  it("is nothing for the thief, a spectator, a detective off turn, or after the round", () => {
    const g = rolled();
    const pick = { ...ui, moveDest: c(4, 5) };
    expect(intentToSend(room(g, THIEF, "thief").view, room(g, THIEF, "thief").game, pick)).toBeNull();
    expect(intentToSend(room(g, "w", "spectator").view, room(g, "w", "spectator").game, pick)).toBeNull();
    expect(intentToSend(room(g, D2).view, room(g, D2).game, pick)).toBeNull();
    g.phase = "roundOver";
    g.turn = { kind: "over" };
    expect(intentToSend(room(g, D1).view, room(g, D1).game, pick)).toBeNull();
  });

  it("is a lifted piece or pawn during setup, and nothing for the pawn setup selects for you", () => {
    const g = createGame({ board: CLASSIC_BOARD, rules: DEFAULT_RULES, seed: 1, thief: THIEF, detectives: [D1, D2].map((controller) => ({ character: "red" as const, controller })) });
    g.phase = "setupPaintings";
    let r = room(g, D1);
    expect(intentToSend(r.view, r.game, { ...ui, held: { kind: "piece", from: c(6, 1) } })).toEqual({ k: "lift", piece: "painting", cell: c(6, 1) });
    expect(intentToSend(r.view, r.game, ui)).toBeNull();
    g.phase = "setupCameras";
    r = room(g, D1);
    expect(intentToSend(r.view, r.game, { ...ui, held: { kind: "piece", from: c(4, 3) } })).toEqual({ k: "lift", piece: "camera", cell: c(4, 3) });
    g.phase = "setupDetectives";
    r = room(g, D1);
    expect(intentToSend(r.view, r.game, { ...ui, held: { kind: "pawn", pawn: "d1" } })).toEqual({ k: "liftPawn", pawn: "d1" });
    // A piece still "held" from the previous phase isn't a pawn lift.
    expect(intentToSend(r.view, r.game, { ...ui, held: { kind: "piece", from: c(4, 3) } })).toBeNull();
  });
});
