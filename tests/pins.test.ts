import { describe, expect, it } from "vitest";
import { PIN_EVICT_FADE_MS, PIN_FADE_MS, PIN_LIFETIME_MS, PIN_MAX_PER_PLAYER, pinOpacity, placePin, type Pin } from "../src/client/game/pins";

const at = (id: number, by = "alice") => ({ id, by, x: 3.4, y: 5.1 });

describe("pin lifetime", () => {
  it("is solid, then fades out over the last stretch, then is gone", () => {
    const [pin] = placePin([], at(1), 1000);
    expect(pinOpacity(pin, 1000)).toBe(1);
    expect(pinOpacity(pin, 1000 + PIN_LIFETIME_MS - PIN_FADE_MS)).toBe(1);
    expect(pinOpacity(pin, 1000 + PIN_LIFETIME_MS - PIN_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(pinOpacity(pin, 1000 + PIN_LIFETIME_MS)).toBe(0);
  });

  it("keeps the exact (non-cell-centred) position", () => {
    const [pin] = placePin([], at(1), 0);
    expect([pin.x, pin.y]).toEqual([3.4, 5.1]);
  });
});

describe("pin cap per player", () => {
  const liveIds = (pins: Pin[], now: number) => pins.filter((p) => pinOpacity(p, now) === 1).map((p) => p.id);

  it("lets a player stack pins up to the cap", () => {
    let pins: Pin[] = [];
    for (let i = 1; i <= PIN_MAX_PER_PLAYER; i++) pins = placePin(pins, at(i), i * 100);
    expect(liveIds(pins, 1000)).toEqual([1, 2, 3]);
  });

  it("fades the oldest quickly when a player goes over, leaving the newest", () => {
    let pins: Pin[] = [];
    for (let i = 1; i <= PIN_MAX_PER_PLAYER + 1; i++) pins = placePin(pins, at(i), i * 100);
    const now = (PIN_MAX_PER_PLAYER + 1) * 100;
    expect(liveIds(pins, now + 1)).toEqual([2, 3, 4]);
    const evicted = pins.find((p) => p.id === 1)!;
    expect(pinOpacity(evicted, now + PIN_EVICT_FADE_MS)).toBe(0);
  });

  it("still holds the cap when older pins are already in their natural fade", () => {
    // Regression: pins that had started fading used to be left out of the count, so a player who kept
    // placing pins as the old ones faded could have five on the board at once.
    let pins: Pin[] = [];
    for (const [id, when] of [[1, 0], [2, 200], [3, 400], [4, 6600], [5, 6800]]) pins = placePin(pins, at(id), when);
    // Once the pushed-out pins' quick fade is over, exactly the cap remains, and it's the newest.
    expect(pins.filter((p) => pinOpacity(p, 6800 + PIN_EVICT_FADE_MS + 1) > 0).map((p) => p.id)).toEqual([3, 4, 5]);
    // And right after the last placement, nothing but those and the two being pushed out is visible.
    expect(pins.filter((p) => pinOpacity(p, 6801) > 0)).toHaveLength(PIN_MAX_PER_PLAYER + 2);
  });

  it("counts each player separately", () => {
    let pins: Pin[] = [];
    for (let i = 0; i < PIN_MAX_PER_PLAYER; i++) pins = placePin(pins, at(i, "alice"), 0);
    pins = placePin(pins, at(10, "bob"), 0);
    expect(liveIds(pins, 0)).toHaveLength(PIN_MAX_PER_PLAYER + 1);
  });

  it("drops pins that have already expired", () => {
    let pins = placePin([], at(1), 0);
    pins = placePin(pins, at(2), PIN_LIFETIME_MS + 1);
    expect(pins.map((p) => p.id)).toEqual([2]);
  });
});
