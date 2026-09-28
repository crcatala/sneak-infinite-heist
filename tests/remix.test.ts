import { describe, expect, it } from "vitest";
import { CLASSIC_BOARD } from "../src/shared/board/classic";
import { getBoard } from "../src/shared/board/model";
import { remixBoard } from "../src/shared/board/remix";
import { validateBoard } from "../src/shared/board/validate";
import { botAction } from "../src/shared/bots";
import { DEFAULT_RULES } from "../src/shared/game/config";
import { apply, waitingOn } from "../src/shared/game/engine";
import { createGame } from "../src/shared/game/setup";
import { viewFor } from "../src/shared/game/views";
import { mulberry32 } from "../src/shared/rng";

describe("board remix (the Infinite)", () => {
  it("always produces a valid board", () => {
    for (let seed = 1; seed <= 300; seed++) expect(validateBoard(remixBoard(seed)), `seed ${seed}`).toEqual([]);
  }, 60_000);

  it("is deterministic per seed and varies between seeds", () => {
    expect(remixBoard(42)).toEqual(remixBoard(42));
    const shapes = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(remixBoard(i + 1))));
    expect(shapes.size).toBeGreaterThan(25);
    expect(JSON.stringify(remixBoard(7))).not.toEqual(JSON.stringify(CLASSIC_BOARD));
  });

  it("changes colours, doorways and windows while keeping the essentials", () => {
    let movedDoor = 0;
    let movedWindow = 0;
    let recoloured = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = remixBoard(seed);
      const b = getBoard(r);
      expect(b.walkable).toHaveLength(104);
      expect(b.slots).toHaveLength(11);
      expect(b.mainRooms).toHaveLength(6);
      if (JSON.stringify(r.openings) !== JSON.stringify(CLASSIC_BOARD.openings)) movedDoor++;
      if (r.slots.some((s, i) => s.cell.join() !== CLASSIC_BOARD.slots[i].cell.join())) movedWindow++;
      if (r.colours && r.colours.R !== "red") recoloured++;
    }
    expect(movedDoor).toBeGreaterThan(30);
    expect(movedWindow).toBeGreaterThan(20);
    expect(recoloured).toBeGreaterThan(20);
  });

  it("plays complete bot games on remixed boards", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = mulberry32(seed);
      let s = createGame({ board: remixBoard(seed * 31), rules: { ...DEFAULT_RULES, dawnAfterThiefTurns: 30 }, seed, thief: "T", detectives: [{ character: "red", controller: "A" }, { character: "blue", controller: "B" }] });
      for (let i = 0; s.phase !== "roundOver" && i < 3000; i++) {
        const actor = waitingOn(s)[0] ?? "A";
        s = apply(s, actor, botAction(viewFor(s, actor === "T" ? "thief" : "detectives"), actor, rng)!).state;
      }
      expect(s.phase).toBe("roundOver");
    }
  }, 60_000);
});
