import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, FakeState } from "./fakeRuntime";
import { RoomDurableObject } from "../../src/worker/roomObject";
import type { Env } from "../../src/worker/env";
import { CLOSE, type ClientMessage, type ServerMessage } from "../../src/shared/protocol";
import { RATE_LIMITS } from "../../src/shared/rateLimit";
import type { RoomState } from "../../src/shared/roomTypes";
import type { Room } from "../../src/shared/room";
import { getBoard } from "../../src/shared/board/model";
import { thiefDestinations } from "../../src/shared/board/paths";
import { mulberry32 } from "../../src/shared/rng";

const CODE = "TESTROOM";
const MINUTE = 60 * 1000;

/** A room Durable Object on the fake runtime, plus helpers to drive it like the runtime would. */
async function openRoom() {
  const ctx = new FakeState();
  const env: Record<string, unknown> = { INVITES: { idFromName: (name: string) => name, get: () => ({ updateRoom: async () => {} }) } };
  const make = () => new RoomDurableObject(ctx as unknown as DurableObjectState, env as unknown as Env);
  let room = make();
  await room.init(CODE, "test-invite");

  const join = async (query: Record<string, string>) => {
    await room.fetch(new Request(`https://room/${CODE}/ws?${new URLSearchParams(query)}`, { headers: { Upgrade: "websocket" } }));
    const ws = ctx.sockets.at(-1)!;
    ctx.ping(ws);
    return ws;
  };
  const send = (ws: FakeSocket, msg: ClientMessage) => room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(msg));
  const sendRaw = (ws: FakeSocket, text: string) => room.webSocketMessage(ws as unknown as WebSocket, text);
  /** The runtime evicts an idle object and builds a new one over the same storage and sockets. */
  const hibernate = async () => {
    room = make();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const players = () => (ctx.storage.data.get("state") as RoomState).players;

  /** Lets time pass, firing alarms as they come due. `alive` keep heartbeating; others are silent. */
  const wakeLog: number[] = [];
  const wait = async (ms: number, alive: FakeSocket[]) => {
    const end = Date.now() + ms;
    let wakes = 0;
    for (let at = ctx.storage.alarm; at !== null && at <= end; at = ctx.storage.alarm) {
      vi.setSystemTime(at);
      for (const ws of alive) ctx.ping(ws);
      wakeLog.push(at);
      await room.alarm();
      wakes++;
    }
    vi.setSystemTime(end);
    for (const ws of alive) ctx.ping(ws);
    return wakes;
  };

  /** The runtime later delivers a close event for each socket the room closed; the fake doesn't, so tests do. */
  const deliverCloses = async () => {
    for (const ws of ctx.sockets) if (ws.closed) await room.webSocketClose(ws as unknown as WebSocket);
  };
  /** The pure room inside the Durable Object, to set up a game or simulate a bug. */
  const engine = () => (room as unknown as { room: { tick(): boolean; nextAlarm(): number | null } }).room;

  return { ctx, env, join, send, sendRaw, players, wait, wakeLog, deliverCloses, hibernate, engine };
}

function received(ws: FakeSocket): ServerMessage[] {
  return ws.sent.map((text) => JSON.parse(text) as ServerMessage);
}

function playerId(ws: FakeSocket): string {
  const welcome = received(ws).find((m) => m.t === "welcome");
  if (welcome?.t !== "welcome") throw new Error("no welcome");
  return welcome.you;
}

describe("pointer pins on the Durable Object", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("reaches every socket in the room, the thief's and a spectator's included", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });
    const mate = await join({ name: "Mate" });
    const thief = await join({ name: "Thief" });
    await send(host, { t: "settings", patch: { thiefSelection: "host" } });
    await send(host, { t: "setThief", playerId: playerId(thief) });
    for (const ws of [host, mate, thief]) await send(ws, { t: "setReady", ready: true });
    const watcher = await join({ name: "Watcher", spectate: "1" });

    await send(host, { t: "pin", x: 3.25, y: 4.75 });

    const pins = (ws: FakeSocket) => received(ws).filter((m) => m.t === "pin");
    const pin = { t: "pin", by: playerId(host), x: 3.25, y: 4.75 };
    expect(pins(host)).toEqual([pin]);
    expect(pins(mate)).toEqual([pin]);
    expect(pins(thief)).toEqual([pin]);
    expect(pins(watcher)).toEqual([pin]);
  });
});

describe("pending choices on the Durable Object", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("reaches the thief, a spectator and the other detective, but not the sender", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });
    const mate = await join({ name: "Mate" });
    const thief = await join({ name: "Thief" });
    await send(host, { t: "settings", patch: { thiefSelection: "host" } });
    await send(host, { t: "setThief", playerId: playerId(thief) });
    for (const ws of [host, mate, thief]) await send(ws, { t: "setReady", ready: true });
    const watcher = await join({ name: "Watcher", spectate: "1" });

    const intent = { k: "turn", pawn: "d1", move: 12 } as const;
    await send(host, { t: "intent", intent });
    await send(host, { t: "intent", intent: null });

    const intents = (ws: FakeSocket) => received(ws).filter((m) => m.t === "intent");
    const expected = [
      { t: "intent", by: playerId(host), intent },
      { t: "intent", by: playerId(host), intent: null },
    ];
    expect(intents(mate)).toEqual(expected);
    expect(intents(thief)).toEqual(expected);
    expect(intents(watcher)).toEqual(expected);
    expect(intents(host)).toEqual([]);
  });

  it("is refused from the thief", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });
    const mate = await join({ name: "Mate" });
    const thief = await join({ name: "Thief" });
    await send(host, { t: "settings", patch: { thiefSelection: "host" } });
    await send(host, { t: "setThief", playerId: playerId(thief) });
    for (const ws of [host, mate, thief]) await send(ws, { t: "setReady", ready: true });
    await send(thief, { t: "intent", intent: { k: "liftPawn", pawn: "d1" } });
    expect(received(host).filter((m) => m.t === "intent")).toEqual([]);
    expect(received(thief).some((m) => m.t === "error")).toBe(true);
  });
});

describe("the spectator on the Durable Object", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("is told why and disconnected when the host removes them", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });
    const watcher = await join({ name: "Watcher", spectate: "1" });

    await send(host, { t: "kick", playerId: playerId(watcher) });

    const closed = received(watcher).find((m) => m.t === "closed");
    expect(closed).toMatchObject({ t: "closed", code: CLOSE.refused, message: expect.stringMatching(/removed/) });
    expect(watcher.closed?.code).toBe(CLOSE.refused);
    expect(received(host).filter((m) => m.t === "closed")).toEqual([]);
  });

  it("refuses a second spectator while the first is connected", async () => {
    const { join } = await openRoom();
    await join({ name: "Host" });
    await join({ name: "First", spectate: "1" });
    const second = await join({ name: "Second", spectate: "1" });

    expect(received(second).find((m) => m.t === "error")).toMatchObject({ message: expect.stringMatching(/already watching/) });
    expect(second.closed?.code).toBe(CLOSE.refused);
  });
});

describe("room presence on the Durable Object", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("notices a device that dies while the room is in use", async () => {
    const { join, players, wait } = await openRoom();
    const host = await join({ name: "Host" });
    const guest = await join({ name: "Guest" });

    await wait(150 * 1000, [guest]);

    expect(players().find((p) => p.id === playerId(host))?.connected).toBe(false);
    expect(players().find((p) => p.id === playerId(guest))?.isHost).toBe(true);
  });

  it("stops waking a quiet room after about ten sweeps", async () => {
    const { ctx, join, wait } = await openRoom();
    const a = await join({ name: "A" });
    const b = await join({ name: "B" });

    const wakes = await wait(60 * MINUTE, [a, b]);

    expect(wakes).toBeLessThanOrEqual(11);
    expect(ctx.storage.alarm).toBeNull();
  });

  it("hands over the host as soon as someone acts in a quiet room whose host died", async () => {
    const { ctx, join, send, players, wait } = await openRoom();
    const host = await join({ name: "Host" });
    const guest = await join({ name: "Guest" });
    await wait(15 * MINUTE, [host, guest]);
    expect(ctx.storage.alarm).toBeNull();

    // The host's device dies while the room sleeps: nothing notices yet.
    await wait(30 * MINUTE, [guest]);
    expect(players().find((p) => p.id === playerId(host))?.connected).toBe(true);

    // The guest's first message settles presence before it's handled, so a host-only action works.
    await send(guest, { t: "addBot" });

    expect(players().find((p) => p.id === playerId(host))?.connected).toBe(false);
    expect(players().find((p) => p.id === playerId(guest))?.isHost).toBe(true);
    expect(players().some((p) => p.isBot)).toBe(true);
    expect(ctx.storage.alarm).not.toBeNull();
  });

  it("offers a dead player's seat to a new device in a quiet game", async () => {
    const { ctx, join, send, wait } = await openRoom();
    const a = await join({ name: "A" });
    const b = await join({ name: "B" });
    await send(a, { t: "setReady", ready: true });
    await send(b, { t: "setReady", ready: true });
    await wait(15 * MINUTE, [a, b]);
    expect(ctx.storage.alarm).toBeNull();

    // A's phone dies during the break, so A opens the room link on a laptop.
    await wait(30 * MINUTE, [b]);
    const laptop = await join({ name: "A" });
    expect(received(laptop)).toContainEqual({ t: "claim", seats: [{ id: playerId(a), name: "A" }] });

    const claimed = await join({ name: "A", claim: playerId(a) });
    expect(playerId(claimed)).toBe(playerId(a));
  });
});

describe("flood control on the Durable Object", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("lets a quick burst of normal actions through", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });

    for (let i = 0; i < 20; i++) await send(host, { t: "setReady", ready: i % 2 === 0 });

    expect(host.closed).toBeNull();
    expect(received(host).filter((m) => m.t === "error")).toEqual([]);
  });

  it("tells a flooding socket to slow down once, then closes it and holds its player out for a minute", async () => {
    const { join, send } = await openRoom();
    const host = await join({ name: "Host" });
    const flooder = await join({ name: "Flooder" });
    const { you, secret } = received(flooder).find((m) => m.t === "welcome") as Extract<ServerMessage, { t: "welcome" }>;

    for (let i = 0; i < RATE_LIMITS.socket.capacity + RATE_LIMITS.floodDrops + 5; i++) await send(flooder, { t: "setReady", ready: i % 2 === 0 });

    expect(received(flooder).filter((m) => m.t === "error")).toHaveLength(1);
    expect(flooder.closed?.code).toBe(CLOSE.flood);
    expect(received(flooder)).toContainEqual(expect.objectContaining({ t: "closed", code: CLOSE.flood }));
    expect(host.closed).toBeNull();

    // Rejoining right away is refused; after the penalty it works.
    const refused = await join({ pid: you, secret });
    expect(refused.closed?.code).toBe(CLOSE.flood);
    vi.setSystemTime(Date.now() + RATE_LIMITS.penaltyMs + 1);
    const back = await join({ pid: you, secret });
    expect(back.closed).toBeNull();
    expect(playerId(back)).toBe(you);
  });
});

describe("flood control: junk, eviction and mixed identities", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  const errors = (ws: FakeSocket) => received(ws).filter((m) => m.t === "error").length;

  it("charges unparseable and oversized messages, so a junk flood is closed like any other", async () => {
    const { join, sendRaw } = await openRoom();
    const flooder = await join({ name: "Flooder" });

    for (let i = 0; i < RATE_LIMITS.socket.capacity + RATE_LIMITS.floodDrops + 5; i++) {
      await sendRaw(flooder, i % 3 === 0 ? "not json" : i % 3 === 1 ? JSON.stringify({ t: "nope" }) : "x".repeat(20_000));
    }

    expect(flooder.closed?.code).toBe(CLOSE.flood);
    // Junk inside the budget is still answered, a few times, not on every message.
    expect(errors(flooder)).toBeLessThan(40);
  });

  it("does not reset a drained budget when the object is evicted and woken", async () => {
    const { ctx, join, send, hibernate } = await openRoom();
    const host = await join({ name: "Host" });
    const mate = await join({ name: "Mate" });

    // Drain the room's message budget with pings, a second of simulated time at a time.
    for (let second = 0; second < 150; second++) {
      for (let i = 0; i < 15; i++) await send(host, { t: "ping" });
      vi.setSystemTime(Date.now() + 1000);
      ctx.ping(host);
      ctx.ping(mate);
    }
    expect(errors(host)).toBeGreaterThan(0);

    await hibernate();
    const before = errors(mate);
    for (let i = 0; i < 30; i++) await send(mate, { t: "ping" });

    // A fresh budget would let all 30 through silently.
    expect(errors(mate)).toBeGreaterThan(before);
  });

  it("keeps a flood penalty through eviction", async () => {
    const { join, send, hibernate } = await openRoom();
    await join({ name: "Host" });
    const flooder = await join({ name: "Flooder" });
    const { you, secret } = received(flooder).find((m) => m.t === "welcome") as Extract<ServerMessage, { t: "welcome" }>;
    for (let i = 0; i < RATE_LIMITS.socket.capacity + RATE_LIMITS.floodDrops + 5; i++) await send(flooder, { t: "setReady", ready: i % 2 === 0 });
    expect(flooder.closed?.code).toBe(CLOSE.flood);

    await hibernate();
    const refused = await join({ pid: you, secret });

    expect(refused.closed?.code).toBe(CLOSE.flood);
  });

  it("refuses a penalized seat claimed behind a made-up pid", async () => {
    const { join, send } = await openRoom();
    await join({ name: "Host" });
    const flooder = await join({ name: "Flooder" });
    const { you } = received(flooder).find((m) => m.t === "welcome") as Extract<ServerMessage, { t: "welcome" }>;
    for (let i = 0; i < RATE_LIMITS.socket.capacity + RATE_LIMITS.floodDrops + 5; i++) await send(flooder, { t: "setReady", ready: i % 2 === 0 });

    const sneaky = await join({ pid: "made-up", claim: you });

    expect(sneaky.closed?.code).toBe(CLOSE.flood);
  });
});

describe("alarm guardrails", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("never wakes more than once every 2 s, even if the room keeps asking to be woken right away", async () => {
    const { join, wait, wakeLog, engine } = await openRoom();
    const a = await join({ name: "A" });
    // A bug that always "advances" with a deadline already due would otherwise re-fire every 50 ms.
    const room = engine();
    room.tick = () => true;
    room.nextAlarm = () => Date.now();

    const wakes = await wait(10 * MINUTE, [a]);

    // The first wake is the presence sweep a minute in; from then on about one every 2 s: not more
    // (the cap), and not many fewer (the room still works).
    expect(wakes).toBeGreaterThanOrEqual(265);
    expect(wakes).toBeLessThanOrEqual(301);
    for (let i = 1; i < wakeLog.length; i++) expect(wakeLog[i] - wakeLog[i - 1]).toBeGreaterThanOrEqual(2000);
  });

  /**
   * A two-player game already in play: A is the thief, B the lone detective (two pawns). `turnTimerSec` 0 means
   * no turn timer.
   */
  async function heist(turnTimerSec: 0 | 60) {
    const opened = await openRoom();
    const { join, send, engine } = opened;
    const a = await join({ name: "A" });
    const b = await join({ name: "B" });
    await send(a, { t: "settings", patch: { thiefSelection: "host", turnTimerSec } });
    await send(a, { t: "setThief", playerId: playerId(a) });
    for (const ws of [a, b]) await send(ws, { t: "setReady", ready: true });
    await send(a, { t: "debug", cmd: "skipToPlay" });
    const view = () => (engine() as unknown as Room).viewFor(playerId(a));
    /** The thief's move: a legal destination that avoids paintings, entering through j first. */
    const thiefMove = async () => {
      const g = view().game!;
      const board = getBoard(g.board);
      const start = g.thief.cell ?? board.slotById.j.inside;
      const painted = new Set(g.paintings.filter((p) => p.status !== "stolen").map((p) => p.cell));
      const ends = [...thiefDestinations(board, start, g.detectives.map((d) => d.cell!)).keys()];
      const dest = ends.find((c) => !painted.has(c)) ?? ends[0];
      await send(a, { t: "game", action: g.thief.cell === null ? { a: "thiefTurn", entry: "j", dest } : { a: "thiefTurn", dest } });
    };
    return { ...opened, a, b, view, thiefMove };
  }

  // The fastest legitimate deadline is a bot step (BOT_THINK_MS, 0.9-1.6 s apart): a seat handed to a bot, or a
  // turn finished by a bot after its timer ran out. Each wake-up runs one step, so the gap paces them at 2 s.
  it("keeps bot turns going, one step at most 2 s after the last", async () => {
    // Bot think times come from Math.random in the Durable Object: seed it so the run is the same every time.
    vi.spyOn(Math, "random").mockImplementation(mulberry32(7));
    const { a, b, ctx, send, wait, wakeLog, deliverCloses, view, thiefMove } = await heist(0);
    // B leaves and the host hands the detectives to a bot.
    b.close(1000);
    await deliverCloses();
    await send(a, { t: "botTakeover", playerId: playerId(b), on: true });

    /** Lets the bot play until it's the thief's move again; each step must come at most 2 s after the last. */
    const botPlays = async () => {
      const from = wakeLog.length;
      const startedAt = Date.now();
      for (let guard = 0; guard < 40 && view().game!.phase === "play" && !view().waitingOn.includes(playerId(a)); guard++) await wait(2000, [a]);
      const steps = [startedAt, ...wakeLog.slice(from)];
      expect(steps.length).toBeGreaterThan(1);
      for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThanOrEqual(2000);
    };

    let detectiveTurns = 0;
    for (let turn = 0; turn < 5 && view().game!.phase === "play"; turn++) {
      await thiefMove();
      await botPlays();
      // The thief answers any motion prompt at once.
      while (view().game!.phase === "play" && view().game!.turn.kind === "detective" && view().waitingOn.includes(playerId(a))) {
        await send(a, { t: "game", action: { a: "motionResponse", snip: false } });
        await botPlays();
      }
      detectiveTurns++;
    }
    expect(detectiveTurns).toBeGreaterThanOrEqual(3);
    expect(ctx.storage.data.has("state")).toBe(true);
  });

  it("leaves normal timers exactly on time", async () => {
    const { a, b, wait, wakeLog, engine } = await heist(60);
    const deadline = (engine() as unknown as Room).state.clock!.turnDeadline!;
    expect(deadline - Date.now()).toBe(60 * 1000);

    await wait(61 * 1000, [a, b]);

    expect(wakeLog).toContain(deadline);
  });

  it("turns off rooms that are already running when the kill switch is flipped, and they come back after", async () => {
    const { ctx, env, join, send, wait, deliverCloses } = await openRoom();
    const a = await join({ name: "A" });
    const b = await join({ name: "B" });
    expect(ctx.storage.alarm).not.toBeNull();

    env.ONLINE_ENABLED = "false";
    await wait(2 * MINUTE, [a, b]);
    for (const ws of [a, b]) expect(ws.closed?.code).toBe(CLOSE.offline);
    // The close events that follow must not re-arm the alarm.
    await deliverCloses();
    expect(ctx.storage.alarm).toBeNull();
    // The room is kept, so it picks up again when online rooms come back.
    expect(ctx.storage.data.has("state")).toBe(true);

    delete env.ONLINE_ENABLED;
    const { you, secret } = received(a).find((m) => m.t === "welcome") as Extract<ServerMessage, { t: "welcome" }>;
    const back = await join({ pid: you, secret });
    expect(back.closed).toBeNull();
    expect(ctx.storage.alarm).not.toBeNull();
    await send(back, { t: "setReady", ready: true });
    expect(back.closed).toBeNull();
  });

  it("stops a looping room for good when the kill switch is flipped", async () => {
    const { ctx, env, join, wait, deliverCloses, engine } = await openRoom();
    const a = await join({ name: "A" });
    const room = engine();
    room.tick = () => true;
    room.nextAlarm = () => Date.now();
    expect(await wait(2 * MINUTE, [a])).toBeGreaterThan(20);

    env.ONLINE_ENABLED = "false";
    await wait(10 * 1000, [a]);
    // Close events, a reconnecting constructor or a stray message all schedule through the same place.
    await deliverCloses();

    expect(ctx.storage.alarm).toBeNull();
    expect(await wait(10 * MINUTE, [])).toBe(0);
  });

  it("closes a socket that sends a message after the switch is flipped, before any alarm fires", async () => {
    const { env, join, send } = await openRoom();
    const a = await join({ name: "A" });

    env.ONLINE_ENABLED = "false";
    await send(a, { t: "setReady", ready: true });

    expect(a.closed?.code).toBe(CLOSE.offline);
  });
});
