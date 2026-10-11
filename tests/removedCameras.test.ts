import { describe, expect, it } from "vitest";
import { removedCameras } from "../src/client/game/derive";
import { viewFor } from "../src/shared/game/views";
import { act, c, D1, detectiveTurn, inPlay, THIEF } from "./helpers";

describe("removedCameras", () => {
  it("is empty until a cut camera is found, then remembers where it stood", () => {
    let g = inPlay();
    g.thief.cell = c(4, 2);
    g.thief.entry = "a";
    g.thief.turns = 1;
    g = act(g, THIEF, { a: "thiefTurn", dest: c(4, 3), disableCamera: true });
    // Cut but not found: detectives still see camera 1 as working, so nothing is marked as gone.
    expect(removedCameras(viewFor(g, "detectives"))).toEqual([]);
    g = detectiveTurn(g, D1, { move: 1, action: "eye" }, { a: "eye", target: 1 });
    for (const who of ["detectives", "spectator", "thief"] as const) {
      expect(removedCameras(viewFor(g, who))).toEqual([{ n: 1, cell: c(4, 3) }]);
    }
  });

  it("is empty before play starts", () => {
    const g = inPlay();
    g.events = [];
    expect(removedCameras(viewFor(g, "detectives"))).toEqual([]);
  });
});
