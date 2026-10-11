import { describe, expect, it } from "vitest";
import { goneIds, presenceChanges, watcherChanges } from "../src/client/presence";
import type { Player } from "../src/shared/roomTypes";

const p = (id: string, connected = true): Player => ({ id, name: id, isBot: false, isHost: false, ready: false, connected, joinedAt: 0, character: null, volunteer: false });

describe("watcher announcements", () => {
  it("announces a new watcher once, and a watcher who is removed", () => {
    expect(watcherChanges([], [p("w1")], "me").arrived.map((x) => x.id)).toEqual(["w1"]);
    expect(watcherChanges([p("w1")], [p("w1")], "me")).toEqual({ arrived: [], gone: [] });
    expect(watcherChanges([p("w1")], [], "me").gone.map((x) => x.id)).toEqual(["w1"]);
  });

  it("stays quiet about yourself and about a watcher who was already away", () => {
    expect(watcherChanges([], [p("me")], "me").arrived).toEqual([]);
    expect(watcherChanges([p("w1", false)], [], "me").gone).toEqual([]);
  });

  it("treats a watcher dropping out like a player dropping out", () => {
    expect(presenceChanges([p("w1")], [p("w1", false)], "me").left.map((x) => x.id)).toEqual(["w1"]);
  });

  it("forgets a drop that was pending for someone who has since been replaced or removed", () => {
    // Jo drops, then a new watcher takes the seat before the disconnect was announced.
    const before = [p("host"), p("w1", false)];
    const after = [p("host"), p("w2")];
    expect(presenceChanges(before, after, "me").left).toEqual([]);
    expect(goneIds(["w1", "host"], after)).toEqual(["w1"]);
    expect(goneIds([], after)).toEqual([]);
    expect(goneIds(["host", "w2"], after)).toEqual([]);
  });
});
