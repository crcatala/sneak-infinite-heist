import { describe, expect, it } from "vitest";
import { getBoard } from "../src/shared/board/model";
import { thiefDestinations } from "../src/shared/board/paths";
import { MOTION_RESPONSE_MS } from "../src/shared/game/config";
import type { GameState } from "../src/shared/game/state";
import type { ClientMessage } from "../src/shared/protocol";
import { BOT_SETUP_MS, BOT_THINK_MS, createRoomState, MAX_SPECTATORS, PIN_COOLDOWN_MS, Room, SeatClaimNeeded, type RoomDeps } from "../src/shared/room";
import { mulberry32 } from "../src/shared/rng";

function testDeps(seed = 1, cheats = false): RoomDeps & { advance(ms: number): void } {
  let t = 1_000_000;
  return { now: () => t, rng: mulberry32(seed), cheats, botSeats: true, advance: (ms: number) => void (t += ms) };
}

function newRoom(seed = 1, cheats = false) {
  const deps = testDeps(seed, cheats);
  const room = new Room(createRoomState("ABCDEFG", deps.now()), deps);
  return { room, deps };
}

const send = (room: Room, pid: string, msg: ClientMessage) => room.handle(pid, msg);
const errorOf = (res: ReturnType<Room["handle"]>) => (res.outbound[0]?.msg as { message?: string } | undefined)?.message;

/** Advances time to each alarm and ticks, until nothing is scheduled or `until` holds. */
function runClock(room: Room, deps: ReturnType<typeof testDeps>, until: () => boolean = () => false, maxSteps = 2000) {
  for (let i = 0; i < maxSteps && !until(); i++) {
    const at = room.nextAlarm();
    if (at === null) return;
    deps.advance(Math.max(0, at - deps.now()));
    room.tick();
  }
}

const game = (room: Room) => room.state.game as GameState;

/** A legal thief move for a human thief (entering through j first), avoiding paintings. */
function thiefStep(room: Room, me: string) {
  const g = room.viewFor(me).game!;
  const board = getBoard(g.board);
  const start = g.thief.cell ?? board.slotById.j.inside;
  const painted = new Set(g.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell));
  const ends = [...thiefDestinations(board, start, g.detectives.map((d) => d.cell!)).keys()];
  const dest = ends.find((c) => !painted.has(c)) ?? ends[0];
  return send(room, me, { t: "game", action: g.thief.cell === null ? { a: "thiefTurn", entry: "j", dest } : { a: "thiefTurn", dest } });
}

describe("lobby", () => {
  it("seats players with unique characters and makes the first human host", () => {
    const { room } = newRoom();
    const a = room.join({ name: "Alice" });
    const b = room.join({ name: "" });
    expect(room.state.players.map((p) => [p.name, p.isHost])).toEqual([["Alice", true], ["Player 2", false]]);
    expect(room.player(a.playerId)!.character).not.toBe(room.player(b.playerId)!.character);
    expect(errorOf(send(room, b.playerId, { t: "setCharacter", character: room.player(a.playerId)!.character }))).toMatch(/already picked/);
    send(room, b.playerId, { t: "setCharacter", character: "white" });
    expect(room.player(b.playerId)!.character).toBe("white");
  });

  it("explains why it can't start", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" });
    expect(room.startBlocker()).toMatch(/at least 2 seats/);
    send(room, a.playerId, { t: "addBot" });
    expect(room.startBlocker()).toBeNull();
    send(room, a.playerId, { t: "settings", patch: { thiefSelection: "host" } });
    expect(room.startBlocker()).toMatch(/pick the thief/);
    send(room, a.playerId, { t: "setThief", playerId: a.playerId });
    expect(room.startBlocker()).toBeNull();
    send(room, a.playerId, { t: "settings", patch: { thiefSelection: "volunteer" } });
    expect(room.startBlocker()).toMatch(/volunteer/);
    send(room, a.playerId, { t: "volunteer", on: true });
    expect(room.startBlocker()).toBeNull();
  });

  it("lets only the host change settings, and resets ready when they change", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" });
    const b = room.join({ name: "B" });
    send(room, b.playerId, { t: "setReady", ready: true });
    expect(errorOf(send(room, b.playerId, { t: "settings", patch: { mode: "match" } }))).toBe("Only the host can do that.");
    send(room, a.playerId, { t: "settings", patch: { rules: { minPaintingsToEscape: 4 }, turnTimerSec: 90 } });
    expect(room.state.settings.rules).toMatchObject({ minPaintingsToEscape: 4, lockPlacement: "random", assist: "marks" });
    expect(room.state.settings.turnTimerSec).toBe(90);
    expect(room.player(b.playerId)!.ready).toBe(false);
  });

  it("adds and kicks bots, and a human bumps a bot from a full lobby", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" });
    for (let i = 0; i < 3; i++) send(room, a.playerId, { t: "addBot" });
    expect(errorOf(send(room, a.playerId, { t: "addBot" }))).toMatch(/At most 4/);
    const b = room.join({ name: "B" });
    expect(room.state.players.map((p) => p.isBot)).toEqual([false, false, true, true]);
    const bot = room.state.players[3].id;
    send(room, a.playerId, { t: "kick", playerId: bot });
    expect(room.state.players).toHaveLength(3);
    expect(errorOf(send(room, b.playerId, { t: "kick", playerId: a.playerId }))).toMatch(/host/);
  });

  it("hands the crown on when the host leaves", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" });
    const b = room.join({ name: "B" });
    room.setConnected(a.playerId, false);
    expect(room.player(b.playerId)!.isHost).toBe(true);
    expect(room.player(a.playerId)!.isHost).toBe(false);
  });
});

describe("starting a round: seats and roles (§4.1)", () => {
  function started(humans: number, bots: number, patch: ClientMessage = { t: "ping" }) {
    const { room, deps } = newRoom(3);
    const ids = Array.from({ length: humans }, (_, i) => room.join({ name: `P${i}` }).playerId);
    for (let i = 0; i < bots; i++) send(room, ids[0], { t: "addBot" });
    send(room, ids[0], patch);
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    return { room, deps, ids };
  }

  it("starts when every human is ready", () => {
    const { room } = started(2, 0);
    expect(room.state.phase).toBe("game");
    expect(game(room).phase).toBe("setupPaintings");
  });

  it("gives a lone detective two pawns with separate turns", () => {
    const { room, ids } = started(2, 0, { t: "settings", patch: { thiefSelection: "host" } } as ClientMessage);
    void ids;
    // Host selection without a pick blocks; pick then ready.
    expect(room.state.phase).toBe("lobby");
    send(room, ids[0], { t: "setThief", playerId: ids[1] });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    const g = game(room);
    expect(g.thief.controller).toBe(ids[1]);
    expect(g.detectives.map((d) => d.controller)).toEqual([ids[0], ids[0]]);
    expect(new Set(g.detectives.map((d) => d.character)).size).toBe(2);
    expect(room.roleOf(ids[0])).toBe("detective");
    expect(room.roleOf(ids[1])).toBe("thief");
  });

  it.each([
    [3, 2],
    [4, 3],
  ])("with %i seats there are %i detectives", (seats, dets) => {
    const { room } = started(1, seats - 1);
    expect(game(room).detectives).toHaveLength(dets);
    expect(new Set(game(room).detectives.map((d) => d.controller)).size).toBe(dets);
  });

  it("lets bots take any role", () => {
    const { room } = started(1, 1, { t: "settings", patch: { thiefSelection: "host" } } as ClientMessage);
    const bot = room.state.players[1].id;
    const human = room.state.players[0].id;
    send(room, human, { t: "setThief", playerId: bot });
    send(room, human, { t: "setReady", ready: true });
    expect(game(room).thief.controller).toBe(bot);
  });

  it("picks among volunteers", () => {
    const { room, deps } = newRoom(9);
    const ids = ["A", "B", "C"].map((n) => room.join({ name: n }).playerId);
    send(room, ids[0], { t: "settings", patch: { thiefSelection: "volunteer" } });
    send(room, ids[2], { t: "volunteer", on: true });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    expect(game(room).thief.controller).toBe(ids[2]);
    void deps;
  });
});

describe("reconnects and seat claims", () => {
  function startedRoom() {
    const { room, deps } = newRoom();
    const a = room.join({ name: "Alice" });
    const b = room.join({ name: "Bob" });
    send(room, a.playerId, { t: "setReady", ready: true });
    send(room, b.playerId, { t: "setReady", ready: true });
    expect(room.state.phase).toBe("game");
    return { room, deps, a, b };
  }

  it("reconnects with the secret and rejects strangers mid-game", () => {
    const { room, a } = startedRoom();
    room.setConnected(a.playerId, false);
    expect(room.join({ playerId: a.playerId, secret: a.secret }).playerId).toBe(a.playerId);
    expect(() => room.join({ name: "Late" })).toThrow(SeatClaimNeeded);
  });

  it("offers disconnected seats to a joiner without a valid secret", () => {
    const { room, b } = startedRoom();
    room.setConnected(b.playerId, false);
    try {
      room.join({ name: "Bob (phone)" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SeatClaimNeeded);
      expect((err as SeatClaimNeeded).seats).toEqual([{ id: b.playerId, name: "Bob" }]);
    }
    const claimed = room.join({ claim: b.playerId });
    expect(claimed.secret).not.toBe(b.secret);
    room.setConnected(b.playerId, false);
    expect(() => room.join({ playerId: b.playerId, secret: b.secret })).toThrow(SeatClaimNeeded);
  });

  it("keeps secrets and the invite id out of views", () => {
    const deps = testDeps();
    const room = new Room(createRoomState("ABCDEFG", deps.now(), "sam"), deps);
    const a = room.join({});
    const json = JSON.stringify(room.viewFor(a.playerId));
    expect(json).not.toContain(a.secret);
    expect(json).not.toContain("sam");
  });
});

describe("bots and clocks", () => {
  function soloThief(seed = 4, timer = 0) {
    const { room, deps } = newRoom(seed);
    const me = room.join({ name: "Me" }).playerId;
    for (let i = 0; i < 3; i++) send(room, me, { t: "addBot" });
    send(room, me, { t: "settings", patch: { thiefSelection: "host", turnTimerSec: timer as 0, rules: { dawnAfterThiefTurns: 20 } } });
    send(room, me, { t: "setThief", playerId: me });
    send(room, me, { t: "setReady", ready: true });
    return { room, deps, me };
  }

  it("bot detectives set up the museum and then wait for the human thief", () => {
    const { room, deps, me } = soloThief();
    expect(room.nextAlarm()).not.toBeNull();
    runClock(room, deps, () => game(room).phase === "play");
    expect(game(room).phase).toBe("play");
    expect(game(room).paintings).toHaveLength(9);
    expect(game(room).cameras).toHaveLength(6);
    expect(room.viewFor(me).waitingOn).toEqual([me]);
    expect(room.nextAlarm()).toBeNull(); // no timer: the game waits for the thief
  });

  it("bot think time comes from a fixed range, independent of the game", () => {
    const { room, deps, me } = soloThief();
    // Setup placements are quick…
    const at = room.nextAlarm()!;
    expect(at - deps.now()).toBeGreaterThanOrEqual(BOT_SETUP_MS[0]);
    expect(at - deps.now()).toBeLessThan(BOT_SETUP_MS[1]);
    // …play decisions take a fixed, longer range whatever the situation.
    runClock(room, deps, () => game(room).phase === "play");
    expect(thiefStep(room, me).outbound).toEqual([]);
    for (let i = 0; i < 5 && game(room).phase === "play"; i++) {
      const next = room.nextAlarm()! - deps.now();
      expect(next).toBeGreaterThanOrEqual(BOT_THINK_MS[0]);
      expect(next).toBeLessThan(BOT_THINK_MS[1]);
      deps.advance(next);
      room.tick();
      if (room.viewFor(me).waitingOn.includes(me)) break;
    }
  });

  it("plays a whole round against bots", () => {
    const { room, deps, me } = soloThief(8);
    runClock(room, deps, () => game(room).phase === "play");
    let guard = 0;
    while (game(room).phase === "play" && guard++ < 400) {
      const view = room.viewFor(me);
      if (view.waitingOn.includes(me)) {
        const turn = view.game!.turn;
        if (turn.kind === "detective" && turn.awaitingThief) send(room, me, { t: "game", action: { a: "motionResponse", snip: false } });
        else expect(thiefStep(room, me).outbound).toEqual([]);
      } else runClock(room, deps, () => room.viewFor(me).waitingOn.includes(me) || game(room).phase !== "play", 50);
    }
    expect(game(room).phase).toBe("roundOver");
    expect(room.viewFor(me).match?.done).toBe(true);
  });

  it("hands an expired turn to the bot logic, pausing while the owner is offline", () => {
    const { room, deps, me } = soloThief(5, 60);
    runClock(room, deps, () => game(room).phase === "play");
    const deadline = room.state.clock!.turnDeadline!;
    expect(deadline - deps.now()).toBe(60_000);
    expect(room.viewFor(me).clock).toMatchObject({ kind: "turn", deadline });
    deps.advance(20_000);
    room.setConnected(me, false);
    expect(room.state.clock!.turnDeadline).toBeNull();
    expect(room.state.clock!.pausedLeft).toBe(40_000);
    deps.advance(3_600_000);
    expect(room.tick()).toBe(false);
    expect(game(room).thief.turns).toBe(0);
    room.join({ playerId: me, secret: room.state.secrets[me] });
    expect(room.state.clock!.turnDeadline).toBe(deps.now() + 40_000);
    deps.advance(40_000);
    runClock(room, deps, () => game(room).thief.turns > 0);
    expect(game(room).thief.turns).toBe(1);
  });

  it("answers the motion detectors after the countdown, without snipping", () => {
    const { room, deps, me } = soloThief(6);
    runClock(room, deps, () => game(room).phase === "play");
    expect(thiefStep(room, me).outbound).toEqual([]);
    // Force the bot detective to roll Motion, and use it.
    game(room).forcedRoll = { move: 1, action: "motion" };
    runClock(room, deps, () => (game(room).turn as { roll?: unknown }).roll != null);
    const pawn = game(room).detectives.find((d) => d.id === (game(room).turn as { pawn: string }).pawn)!;
    send(room, pawn.controller, { t: "game", action: { a: "motion" } });
    expect(room.viewFor(me).clock).toMatchObject({ kind: "motion" });
    expect(room.state.clock!.motionDeadline! - deps.now()).toBeLessThanOrEqual(MOTION_RESPONSE_MS);
    deps.advance(MOTION_RESPONSE_MS);
    room.tick();
    const motion = game(room).events.filter((e) => e.type === "motion").at(-1)!;
    expect(motion).toMatchObject({ result: "answered", snipsLeft: 2 });
  });

  it("lets the host hand an absent player's turns to the bots", () => {
    const { room, deps } = newRoom(2);
    const a = room.join({ name: "A" }).playerId;
    const b = room.join({ name: "B" }).playerId;
    send(room, a, { t: "settings", patch: { thiefSelection: "host" } });
    send(room, a, { t: "setThief", playerId: b });
    send(room, a, { t: "setReady", ready: true });
    send(room, b, { t: "setReady", ready: true });
    send(room, a, { t: "debug", cmd: "skipToPlay" });
    expect(game(room).phase).toBe("play");
    expect(errorOf(send(room, a, { t: "botTakeover", playerId: b, on: true }))).toMatch(/still here/);
    room.setConnected(b, false);
    send(room, a, { t: "botTakeover", playerId: b, on: true });
    runClock(room, deps, () => game(room).thief.turns > 0);
    expect(game(room).thief.turns).toBe(1);
    room.join({ playerId: b, secret: room.state.secrets[b] });
    expect(room.player(b)!.botTakeover).toBeUndefined();
  });
});

describe("match mode (§4.8)", () => {
  it("rotates the thief through every human and ranks them", () => {
    const { room } = newRoom(12);
    const ids = ["A", "B", "C"].map((n) => room.join({ name: n }).playerId);
    send(room, ids[0], { t: "addBot" });
    send(room, ids[0], { t: "settings", patch: { mode: "match", thiefSelection: "host" } });
    send(room, ids[0], { t: "setThief", playerId: ids[1] });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    const thieves: string[] = [];
    for (let round = 0; round < 3; round++) {
      thieves.push(game(room).thief.controller);
      send(room, ids[0], { t: "debug", cmd: "skipToPlay" });
      send(room, ids[0], { t: "debug", cmd: "givePaintings", n: round + 2 });
      send(room, ids[0], { t: "debug", cmd: "endRound", winner: round === 1 ? "detectives" : "thief" });
      const m = room.viewFor(ids[0]).match!;
      expect(m.results).toHaveLength(round + 1);
      if (round < 2) {
        expect(m.done).toBe(false);
        expect(errorOf(send(room, ids[1], { t: "nextRound" }))).toMatch(/host/);
        send(room, ids[0], { t: "nextRound" });
      }
    }
    expect(thieves).toEqual([ids[1], ids[0], ids[2]]);
    const m = room.viewFor(ids[0]).match!;
    expect(m.done).toBe(true);
    expect(m.standings.map((s) => [s.playerId, s.score])).toEqual([[ids[2], 4], [ids[1], 2], [ids[0], 0]]);
    send(room, ids[0], { t: "backToLobby" });
    expect(room.state.phase).toBe("lobby");
    expect(room.state.match).toBeNull();
  });
});

describe("debug and cheats", () => {
  it("refuses to peek online and allows it in solo/dev", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" });
    const b = room.join({ name: "B" });
    expect(errorOf(send(room, a.playerId, { t: "debug", cmd: "viewAs", as: "thief" }))).toMatch(/only allowed/);
    expect(errorOf(send(room, b.playerId, { t: "debug", cmd: "startNow" }))).toMatch(/host/);

    const solo = newRoom(1, true);
    const me = solo.room.join({ name: "Me" }).playerId;
    send(solo.room, me, { t: "addBot" });
    send(solo.room, me, { t: "settings", patch: { thiefSelection: "host" } });
    send(solo.room, me, { t: "setThief", playerId: solo.room.state.players[1].id });
    send(solo.room, me, { t: "setReady", ready: true });
    send(solo.room, me, { t: "debug", cmd: "skipToPlay" });
    expect(solo.room.viewFor(me).game!.viewer).toBe("detectives");
    send(solo.room, me, { t: "debug", cmd: "viewAs", as: "thief" });
    expect(solo.room.viewFor(me).game!.viewer).toBe("thief");
    expect(solo.room.viewFor(me).viewAs).toBe("thief");
  });

  it("summarizes the room for the invite ledger", () => {
    const { room } = newRoom();
    const a = room.join({ name: "Alice" });
    room.join({ name: "Bob" });
    send(room, a.playerId, { t: "addBot" });
    expect(room.summary()).toEqual({ phase: "lobby", players: ["Alice", "Bob"], bots: 1, detail: "In the lobby" });
  });

  it("throttles emotes", () => {
    const { room, deps } = newRoom();
    const a = room.join({ name: "A" });
    expect(send(room, a.playerId, { t: "emote", emote: "👀" }).outbound).toHaveLength(2);
    expect(send(room, a.playerId, { t: "emote", emote: "👀" }).outbound).toHaveLength(0);
    deps.advance(2000);
    expect(send(room, a.playerId, { t: "emote", emote: "🚨" }).outbound).toHaveLength(2);
  });
});

describe("pointer pins", () => {
  /** Three humans in a game: the thief is whoever the host picks, the other two are detectives. */
  function pinGame() {
    const { room, deps } = newRoom(3);
    const ids = ["A", "B", "C"].map((name) => room.join({ name }).playerId);
    send(room, ids[0], { t: "settings", patch: { thiefSelection: "host" } } as ClientMessage);
    send(room, ids[0], { t: "setThief", playerId: ids[2] });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    return { room, deps, detective: ids[0], mate: ids[1], thief: ids[2] };
  }

  it("is public table talk: it goes to the sender and everyone else, thief included", () => {
    const { room, detective } = pinGame();
    const res = send(room, detective, { t: "pin", x: 3.25, y: 4.75 });
    const msg = { t: "pin", by: detective, x: 3.25, y: 4.75 };
    expect(res.outbound).toEqual([{ to: "others", msg }, { to: "self", msg }]);
  });

  it("is for detectives only", () => {
    const { room, thief } = pinGame();
    expect(errorOf(send(room, thief, { t: "pin", x: 3, y: 4 }))).toMatch(/Only detectives/);
    const watcher = room.join({ name: "W", spectate: true }).playerId;
    expect(errorOf(send(room, watcher, { t: "pin", x: 3, y: 4 }))).toMatch(/watching/);
  });

  it("ignores pins off the board and bad coordinates", () => {
    const { room, detective } = pinGame();
    const { width, height } = getBoard(game(room).board);
    expect(send(room, detective, { t: "pin", x: width, y: 2 }).outbound).toHaveLength(0);
    expect(send(room, detective, { t: "pin", x: 2, y: -0.9 }).outbound).toHaveLength(0);
    expect(send(room, detective, { t: "pin", x: width - 0.5, y: height - 0.5 }).outbound).toHaveLength(2);
    expect(send(room, detective, { t: "pin", x: Number.NaN, y: 0 }).outbound).toHaveLength(0);
  });

  it("allows quick successive pins but throttles floods", () => {
    const { room, deps, detective } = pinGame();
    expect(send(room, detective, { t: "pin", x: 3, y: 4 }).outbound).toHaveLength(2);
    expect(send(room, detective, { t: "pin", x: 3.5, y: 4 }).outbound).toHaveLength(0);
    deps.advance(PIN_COOLDOWN_MS);
    expect(send(room, detective, { t: "pin", x: 4, y: 4 }).outbound).toHaveLength(2);
  });
});

describe("pending choices (intents)", () => {
  function intentGame() {
    const { room } = newRoom(3);
    const ids = ["A", "B", "C"].map((name) => room.join({ name }).playerId);
    send(room, ids[0], { t: "settings", patch: { thiefSelection: "host" } } as ClientMessage);
    send(room, ids[0], { t: "setThief", playerId: ids[2] });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    return { room, detective: ids[0], thief: ids[2] };
  }
  const pick: ClientMessage = { t: "intent", intent: { k: "turn", pawn: "d1", move: 12 } };

  it("goes to everyone else but not back to the sender, and changes no game state", () => {
    const { room, detective } = intentGame();
    const before = JSON.stringify(room.state);
    const res = send(room, detective, pick);
    expect(res.outbound).toEqual([{ to: "others", msg: { t: "intent", by: detective, intent: { k: "turn", pawn: "d1", move: 12 } } }]);
    expect(res.changed).toBeFalsy();
    expect(JSON.stringify(room.state)).toBe(before);
  });

  it("relays a take-back", () => {
    const { room, detective } = intentGame();
    expect(send(room, detective, { t: "intent", intent: null }).outbound).toEqual([{ to: "others", msg: { t: "intent", by: detective, intent: null } }]);
  });

  it("is for detectives only", () => {
    const { room, thief } = intentGame();
    expect(errorOf(send(room, thief, pick))).toMatch(/Only detectives/);
    const watcher = room.join({ name: "W", spectate: true }).playerId;
    expect(errorOf(send(room, watcher, pick))).toMatch(/watching/);
  });
});

describe("spectators", () => {
  it("watch with public information only and never take part", () => {
    const { room, deps } = newRoom(5);
    const a = room.join({ name: "A" }).playerId;
    const b = room.join({ name: "B" }).playerId;
    const w = room.join({ name: "Watcher", spectate: true }).playerId;
    expect(room.state.players).toHaveLength(2);
    expect(room.viewFor(a).spectators.map((p) => p.name)).toEqual(["Watcher"]);
    expect(errorOf(send(room, w, { t: "setReady", ready: true }))).toMatch(/watching/);
    send(room, a, { t: "setReady", ready: true });
    send(room, b, { t: "setReady", ready: true });
    expect(room.state.phase).toBe("game");
    send(room, a, { t: "debug", cmd: "skipToPlay" });
    const view = room.viewFor(w);
    expect(view.role).toBe("spectator");
    expect(view.game!.viewer).toBe("spectator");
    expect(view.game!.thief.cell).toBeNull();
    expect(errorOf(send(room, w, { t: "game", action: { a: "roll" } }))).toMatch(/watching/);
    void deps;
  });

  it("lets latecomers watch a started game and seats spectators in the lobby", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" }).playerId;
    for (let i = 0; i < 3; i++) room.join({ name: `P${i}` });
    // Full lobby of humans: the fifth person watches.
    const e = room.join({ name: "E" }).playerId;
    expect(room.isSpectator(e)).toBe(true);
    expect(errorOf(send(room, e, { t: "sit" }))).toMatch(/Every seat/);
    send(room, a, { t: "kick", playerId: room.state.players[3].id });
    send(room, e, { t: "sit" });
    expect(room.isSpectator(e)).toBe(false);
    expect(room.state.players.map((p) => p.name)).toContain("E");
    for (const p of room.state.players) send(room, p.id, { t: "setReady", ready: true });
    expect(room.state.phase).toBe("game");
    expect(() => room.join({ name: "Late" })).toThrow(SeatClaimNeeded);
    expect(room.isSpectator(room.join({ name: "Late", spectate: true }).playerId)).toBe(true);
  });

  /** A started game (thief picked by the host) with one thief move played. */
  function playingRoom() {
    const { room, deps } = newRoom(3);
    const ids = ["A", "B", "C"].map((name) => room.join({ name }).playerId);
    send(room, ids[0], { t: "settings", patch: { thiefSelection: "host" } });
    send(room, ids[0], { t: "setThief", playerId: ids[2] });
    for (const id of ids) send(room, id, { t: "setReady", ready: true });
    send(room, ids[0], { t: "debug", cmd: "skipToPlay" });
    thiefStep(room, ids[2]);
    return { room, deps, host: ids[0], mate: ids[1], thief: ids[2] };
  }

  it("holds one spectator, and the seat stays theirs until someone else needs it", () => {
    expect(MAX_SPECTATORS).toBe(1);
    const { room } = newRoom();
    const first = room.join({ name: "First", spectate: true });
    expect(() => room.join({ name: "Second", spectate: true })).toThrow(/already watching/);

    // They drop out and come back with their secret: same seat, nothing lost.
    room.setConnected(first.playerId, false);
    const back = room.join({ playerId: first.playerId, secret: first.secret, spectate: true });
    expect(back.playerId).toBe(first.playerId);
    expect(room.viewFor(first.playerId).spectators.map((p) => [p.name, p.connected])).toEqual([["First", true]]);

    // While they're away anyone else may take the seat, and the old secret stops working.
    room.setConnected(first.playerId, false);
    const second = room.join({ name: "Second", spectate: true });
    expect(room.viewFor(second.playerId).spectators.map((p) => p.name)).toEqual(["Second"]);
    expect(room.isSpectator(first.playerId)).toBe(false);
    expect(room.state.secrets[first.playerId]).toBeUndefined();
  });

  it("watches from the detectives' side: the same view, minus the team's private notes", () => {
    const { room, host } = playingRoom();
    const w = room.join({ name: "Watcher", spectate: true }).playerId;
    const cell = room.viewFor(host).game!.detectives[0].cell!;
    send(room, host, { t: "game", action: { a: "mark", cell, on: true } });

    const det = room.viewFor(host).game!;
    const spec = room.viewFor(w).game!;
    expect(det.marks).toEqual([cell]);
    expect(spec.marks).toEqual([]);
    expect(spec.thief.cell).toBeNull();
    expect(spec.events.some((e) => e.type === "thiefMoved")).toBe(true);
    expect(spec.events.map((e) => e.seq)).toEqual(det.events.map((e) => e.seq));
    expect({ ...spec, viewer: det.viewer, marks: det.marks }).toEqual(det);
    expect(room.viewFor(w).role).toBe("spectator");
    expect(JSON.stringify(spec)).not.toContain('"trail"');
  });

  it("can react with emotes but not play", () => {
    const { room } = playingRoom();
    const w = room.join({ name: "Watcher", spectate: true }).playerId;
    expect(send(room, w, { t: "emote", emote: "👀" }).outbound).toHaveLength(2);
    expect(errorOf(send(room, w, { t: "game", action: { a: "roll" } }))).toMatch(/watching/);
    expect(errorOf(send(room, w, { t: "pin", x: 3, y: 4 }))).toMatch(/watching/);
  });

  it("lets only the host remove the spectator, at any time", () => {
    const { room, host, mate } = playingRoom();
    const w = room.join({ name: "Watcher", spectate: true }).playerId;
    expect(errorOf(send(room, mate, { t: "kick", playerId: w }))).toMatch(/Only the host/);
    expect(errorOf(send(room, w, { t: "kick", playerId: w }))).toMatch(/watching/);
    const res = send(room, host, { t: "kick", playerId: w });
    expect(res.changed).toBe(true);
    expect(res.dropped).toEqual([{ playerId: w, message: expect.stringMatching(/removed/) }]);
    expect(room.isSpectator(w)).toBe(false);
    // The seats are untouched: kicking a seat still only works in the lobby.
    expect(room.state.players).toHaveLength(3);
    expect(errorOf(send(room, host, { t: "kick", playerId: mate }))).toMatch(/lobby/);
  });

  it("keeps ready flags when only the spectator setting changes", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" }).playerId;
    room.join({ name: "B" });
    room.join({ name: "C" });
    send(room, a, { t: "setReady", ready: true });
    send(room, a, { t: "settings", patch: { allowSpectator: false } });
    expect(room.player(a)!.ready).toBe(true);
    send(room, a, { t: "settings", patch: { botSkill: "rookie" } });
    expect(room.player(a)!.ready).toBe(false);
  });

  it("refuses spectators while the host has them off, and says why", () => {
    const { room } = newRoom();
    const a = room.join({ name: "A" }).playerId;
    const w = room.join({ name: "Watcher", spectate: true }).playerId;
    const res = send(room, a, { t: "settings", patch: { allowSpectator: false } });
    expect(res.dropped?.map((d) => d.playerId)).toEqual([w]);
    expect(room.viewFor(a).spectators).toEqual([]);
    expect(() => room.join({ name: "Late", spectate: true })).toThrow(/isn't allowing spectators/);
    // A fifth human in a full lobby isn't offered the watching seat either.
    for (const n of ["B", "C", "D"]) room.join({ name: n });
    expect(() => room.join({ name: "E" })).toThrow("This room is full.");
    send(room, a, { t: "settings", patch: { allowSpectator: true } });
    expect(room.isSpectator(room.join({ name: "E" }).playerId)).toBe(true);
  });

  it("holds the cap in rooms saved with several watchers, and the extras drain as they leave", () => {
    const { room } = newRoom();
    room.join({ name: "Host" });
    // Rooms from before the cap could hold up to 12 watchers: recreate one with three.
    const ids = ["w90", "w91", "w92"];
    const legacy = ids.map((id, i) => ({ id, name: `Old ${i}`, isBot: false, isHost: false, ready: false, connected: true, joinedAt: 0, character: null, volunteer: false }));
    room.state.spectators = legacy;
    for (const id of ids) room.state.secrets[id] = `secret-${id}`;

    // Nobody new gets in while a connected extra is still there; a disconnected one is let go.
    room.setConnected("w92", false);
    expect(() => room.join({ name: "New", spectate: true })).toThrow(/already watching/);
    expect(room.state.spectators.map((p) => p.id)).toEqual(["w90", "w91"]);
    expect(room.state.secrets.w92).toBeUndefined();

    // As the rest leave, the room settles at one watcher.
    room.setConnected("w91", false);
    expect(() => room.join({ name: "New", spectate: true })).toThrow(/already watching/);
    expect(room.state.spectators.map((p) => p.id)).toEqual(["w90"]);
    room.setConnected("w90", false);
    const fresh = room.join({ name: "New", spectate: true }).playerId;
    expect(room.state.spectators.map((p) => p.id)).toEqual([fresh]);
  });

    it("migrates rooms saved before the setting existed to allow a spectator", () => {
    const deps = testDeps();
    const state = createRoomState("ABCDEFG", deps.now());
    delete (state.settings as Partial<typeof state.settings>).allowSpectator;
    const room = new Room(state, deps);
    expect(room.viewFor("nobody").settings.allowSpectator).toBe(true);
  });
});
