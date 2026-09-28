import { expect, it } from "vitest";
import { runLeakFuzz } from "./leakFuzz";

it("leak fuzz: seeds 251–375 never leak secrets to the detectives", () => {
  const outcomes = runLeakFuzz(251, 375);
  // Random play should produce every ending.
  expect(Object.keys(outcomes).sort()).toEqual(["captured", "dawn", "escaped"]);
}, 300_000);
