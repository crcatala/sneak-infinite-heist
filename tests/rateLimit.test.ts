import { describe, expect, it } from "vitest";
import { FloodControl, RATE_LIMITS } from "../src/shared/rateLimit";
import { EMOTE_COOLDOWN_MS, PIN_COOLDOWN_MS } from "../src/shared/room";

describe("flood control", () => {
  it("lets normal play through, including a burst of taps", () => {
    const f = new FloodControl(0);
    for (let i = 0; i < 25; i++) expect(f.check("s1", "p1", true, i * 50).verdict).toBe("ok");
  });

  it("drops over-budget messages with an occasional notice, then closes a socket that keeps at it", () => {
    const f = new FloodControl(0);
    for (let i = 0; i < RATE_LIMITS.socket.capacity; i++) f.check("s1", "p1", false, 0);
    expect(f.check("s1", "p1", false, 0)).toEqual({ verdict: "drop", notice: true });
    expect(f.check("s1", "p1", false, 0)).toEqual({ verdict: "drop", notice: false });
    let last = f.check("s1", "p1", false, 0);
    while (last.verdict === "drop") last = f.check("s1", "p1", false, 0);
    expect(last.verdict).toBe("close");
    // The player sits out the penalty, then may rejoin.
    expect(f.penalized("p1", 1000)).toBe(true);
    expect(f.penalized("p2", 1000)).toBe(false);
    expect(f.penalized("p1", RATE_LIMITS.penaltyMs + 1)).toBe(false);
  });

  it("caps sustained sending per socket, not just bursts", () => {
    const f = new FloodControl(0);
    // 10 messages a second fits the short-term bucket but not the sustained one, for long.
    let t = 0;
    let verdict = "ok";
    while (verdict === "ok" && t < 30 * 60_000) verdict = f.check("s1", "p1", false, (t += 100)).verdict;
    expect(verdict).toBe("drop");
    expect(t).toBeGreaterThan(60_000);
  });

  it("caps state changes per room, without blaming whoever hits the empty budget", () => {
    const f = new FloodControl(0);
    let writes = 0;
    for (let i = 0; i < 300; i++) if (f.check(`s${i % 4}`, `p${i % 4}`, true, i * 100).verdict === "ok") writes++;
    // 30 seconds: the burst of 60 plus about one per second.
    expect(writes).toBeGreaterThanOrEqual(RATE_LIMITS.roomWrites.capacity);
    expect(writes).toBeLessThan(RATE_LIMITS.roomWrites.capacity + 35);
    // A player sending at a normal pace into the empty budget gets drops, never a close.
    const verdicts = new Set<string>();
    for (let i = 0; i < 400; i++) verdicts.add(f.check("s9", "p9", true, 30_000 + i * 250).verdict);
    expect(verdicts).toEqual(new Set(["ok", "drop"]));
  });

  /** Three detectives pinning every `pinMs` and four players emoting at their cooldown, for `ms`. */
  function spam(pinMs: number, ms: number) {
    const f = new FloodControl(0);
    const sent: { at: number; sid: string }[] = [];
    for (let p = 0; p < 4; p++) {
      if (p < 3) for (let t = p * 37; t < ms; t += pinMs) sent.push({ at: t, sid: `s${p}` });
      for (let t = p * 53; t < ms; t += EMOTE_COOLDOWN_MS) sent.push({ at: t, sid: `s${p}` });
    }
    sent.sort((a, b) => a.at - b.at);
    // Pins and emotes are stateless; the room already throttles them per player.
    return sent.map((m) => f.check(m.sid, m.sid.replace("s", "p"), false, m.at).verdict);
  }

  it("never drops realistic heavy use: three detectives pinning twice a second plus emotes, for 10 minutes", () => {
    expect(new Set(spam(500, 10 * 60_000))).toEqual(new Set(["ok"]));
  });

  it("throttles but never closes anyone sending at the room's own cooldown limits (5 pins/s each) for 40 minutes", () => {
    const verdicts = spam(PIN_COOLDOWN_MS, 40 * 60_000);
    // Faster than any person keeps up for minutes: the sustained limits drop some of it...
    expect(verdicts).toContain("drop");
    // ...but only as notices; a socket is closed for its own flood, not for being at human maximum.
    expect(verdicts).not.toContain("close");
  });
});

describe("flood control across a room being evicted", () => {
  it("restores bucket levels, refilled for the time that passed", () => {
    const f = new FloodControl(0);
    // Four sockets, so the per-socket burst limit is not what runs out first.
    for (let i = 0; i < RATE_LIMITS.roomWrites.capacity; i++) f.check(`s${i % 4}`, `p${i % 4}`, true, 0);
    const snap = f.snapshot(0);
    expect(snap.writes).toBeLessThan(1);

    const woken = new FloodControl(5_000);
    woken.restore(snap, 5_000, new Set(["s1"]));
    // 5 s at 1/s: about 5 state changes fit, not a fresh 60.
    let ok = 0;
    for (let i = 0; i < 20; i++) if (woken.check("s1", "p1", true, 5_000).verdict === "ok") ok++;
    expect(ok).toBe(5);
  });

  it("keeps a socket's long-term budget but forgets sockets that are gone", () => {
    const f = new FloodControl(0);
    for (let i = 0; i < 3000; i++) f.check("gone", "p1", false, i * 40);
    f.check("here", "p2", false, 0);
    const snap = f.snapshot(120_000);

    const woken = new FloodControl(120_000);
    woken.restore(snap, 120_000, new Set(["here"]));
    expect(Object.keys(snap.sustained).sort()).toEqual(["gone", "here"]);
    expect(woken.snapshot(120_000).sustained).toHaveProperty("here");
    expect(woken.snapshot(120_000).sustained).not.toHaveProperty("gone");
  });

  it("keeps a penalty until it ends", () => {
    const f = new FloodControl(0);
    for (let i = 0; i < RATE_LIMITS.socket.capacity + RATE_LIMITS.floodDrops + 1; i++) f.check("s1", "p1", false, 0);
    const snap = f.snapshot(1_000);

    const woken = new FloodControl(30_000);
    woken.restore(snap, 30_000, new Set());
    expect(woken.penalized("p1", 30_000)).toBe(true);
    expect(woken.penalized("p1", RATE_LIMITS.penaltyMs + 1)).toBe(false);
  });

  it("says when it is worth saving", () => {
    const f = new FloodControl(0);
    expect(f.pressured(0)).toBe(false);
    for (let i = 0; i < 40; i++) f.check(`s${i % 4}`, `p${i % 4}`, true, 0);
    expect(f.pressured(0)).toBe(true);
  });
});
