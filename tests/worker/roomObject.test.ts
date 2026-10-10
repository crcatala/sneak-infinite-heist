import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, FakeState } from "./fakeRuntime";
import { RoomDurableObject } from "../../src/worker/roomObject";
import type { Env } from "../../src/worker/env";
import { CLOSE, type ClientMessage, type ServerMessage } from "../../src/shared/protocol";
import { RATE_LIMITS } from "../../src/shared/rateLimit";
import type { RoomState } from "../../src/shared/roomTypes";

const CODE = "TESTROOM";
const MINUTE = 60 * 1000;

/** A room Durable Object on the fake runtime, plus helpers to drive it like the runtime would. */
async function openRoom() {
  const ctx = new FakeState();
  const env = { INVITES: { idFromName: (name: string) => name, get: () => ({ updateRoom: async () => {} }) } };
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
  const wait = async (ms: number, alive: FakeSocket[]) => {
    const end = Date.now() + ms;
    let wakes = 0;
    for (let at = ctx.storage.alarm; at !== null && at <= end; at = ctx.storage.alarm) {
      vi.setSystemTime(at);
      for (const ws of alive) ctx.ping(ws);
      await room.alarm();
      wakes++;
    }
    vi.setSystemTime(end);
    for (const ws of alive) ctx.ping(ws);
    return wakes;
  };

  return { ctx, join, send, sendRaw, players, wait, hibernate };
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
