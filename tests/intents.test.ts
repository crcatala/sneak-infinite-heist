import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/client/store";
import type { Intent } from "../src/shared/protocol";

const pick: Intent = { k: "turn", pawn: "d1", move: 5 };

describe("other detectives' pending choices in the store", () => {
  beforeEach(() => useStore.setState({ intents: {} }));

  it("records and takes back a choice per player", () => {
    const s = useStore.getState();
    s.setIntent("a", pick);
    s.setIntent("b", { k: "liftPawn", pawn: "d2" });
    s.setIntent("a", null);
    expect(Object.keys(useStore.getState().intents)).toEqual(["b"]);
  });

  it("forgets the choices of players who have disconnected, so coming back can't revive one", () => {
    const s = useStore.getState();
    s.setIntent("a", pick);
    s.setIntent("b", pick);
    s.pruneIntents((id) => id === "b");
    expect(Object.keys(useStore.getState().intents)).toEqual(["b"]);
  });

  it("leaves the state object alone when there is nothing to change", () => {
    const s = useStore.getState();
    s.setIntent("a", pick);
    const before = useStore.getState().intents;
    s.pruneIntents(() => true);
    expect(useStore.getState().intents).toBe(before);
    s.setIntent("zzz", null);
    expect(useStore.getState().intents).toBe(before);
  });

  it("clears everything", () => {
    const s = useStore.getState();
    s.setIntent("a", pick);
    s.clearIntents();
    expect(useStore.getState().intents).toEqual({});
  });
});
