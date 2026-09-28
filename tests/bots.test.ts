import { describe, expect, it } from "vitest";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { botAction, type BotLevel } from "../src/shared/bots";
import { DEFAULT_RULES } from "../src/shared/game/config";
import { apply, waitingOn } from "../src/shared/game/engine";
import { createGame } from "../src/shared/game/setup";
import type { GameState } from "../src/shared/game/state";
import { viewFor } from "../src/shared/game/views";
import { mulberry32 } from "../src/shared/rng";

function play(seed: number, thief: BotLevel, detectives: BotLevel, dawn = 40): GameState {
  const rng = mulberry32(seed);
  let s = createGame({
    board: CLASSIC_BOARD,
    rules: { ...DEFAULT_RULES, dawnAfterThiefTurns: dawn },
    seed,
    thief: "T",
    detectives: [
      { character: "red", controller: "A" },
      { character: "blue", controller: "B" },
      { character: "green", controller: "C" },
    ],
  });
  for (let steps = 0; s.phase !== "roundOver" && steps < 3000; steps++) {
    const actor = waitingOn(s)[0] ?? s.detectives[0].controller;
    const isThief = actor === "T";
    const action = botAction(viewFor(s, isThief ? "thief" : "detectives"), actor, rng, isThief ? thief : detectives);
    expect(action, `seed ${seed}: bot had nothing to do`).not.toBeNull();
    s = apply(s, actor, action!).state; // throws on any illegal bot move
  }
  return s;
}

describe("smart bots", () => {
  it("play legal, complete games against each other", () => {
    const results: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const s = play(seed, "smart", "smart");
      expect(s.phase).toBe("roundOver");
      results[`${s.result!.winner}:${s.result!.reason}`] = (results[`${s.result!.winner}:${s.result!.reason}`] ?? 0) + 1;
    }
    console.log("smart vs smart:", results);
    // Both sides should win some games.
    const thiefWins = Object.entries(results).filter(([k]) => k.startsWith("thief")).reduce((a, [, n]) => a + n, 0);
    expect(thiefWins).toBeGreaterThan(0);
    expect(thiefWins).toBeLessThan(40);
  }, 120_000);

  it("smart detectives catch a random thief more often than random detectives do", () => {
    let smart = 0;
    let random = 0;
    for (let seed = 100; seed < 130; seed++) {
      if (play(seed, "random", "smart").result!.reason === "captured") smart++;
      if (play(seed, "random", "random").result!.reason === "captured") random++;
    }
    console.log("captures of a random thief: smart", smart, "random", random);
    expect(smart).toBeGreaterThan(random);
  }, 120_000);

  it("a smart thief escapes random detectives more often than a random thief does", () => {
    let smart = 0;
    let random = 0;
    for (let seed = 200; seed < 230; seed++) {
      if (play(seed, "smart", "random").result!.reason === "escaped") smart++;
      if (play(seed, "random", "random").result!.reason === "escaped") random++;
    }
    expect(smart).toBeGreaterThan(random);
  }, 120_000);
});
