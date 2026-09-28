import { expect, it } from "vitest";
import { runLeakFuzz } from "./leakFuzz";

it("leak fuzz: seeds 126–250 never leak secrets to the detectives", () => {
  const outcomes = runLeakFuzz(126, 250);
  // Random play should produce every ending.
  expect(Object.keys(outcomes).sort()).toEqual(["captured", "dawn", "escaped"]);
}, 300_000);
