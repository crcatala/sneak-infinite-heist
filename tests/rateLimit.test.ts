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

  it("never drops four players pinning and emoting as fast as the room's own cooldowns allow", () => {
    const f = new FloodControl(0);
    const sent: { at: number; sid: string }[] = [];
    // Pins and emotes are stateless; the room already throttles them per player.
    for (let p = 0; p < 4; p++) {
      for (let t = p * 37; t < 10 * 60_000; t += PIN_COOLDOWN_MS * 4) sent.push({ at: t, sid: `s${p}` });
      for (let t = p * 53; t < 10 * 60_000; t += EMOTE_COOLDOWN_MS) sent.push({ at: t, sid: `s${p}` });
    }
    sent.sort((a, b) => a.at - b.at);
    const verdicts = new Set(sent.map((m) => f.check(m.sid, m.sid.replace("s", "p"), false, m.at).verdict));
    expect(verdicts).toEqual(new Set(["ok"]));
  });
});
