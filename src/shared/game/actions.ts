// Every game action as a zod schema (validated in the Durable Object) and its TypeScript type.

import { z } from "zod";

const cell = z.number().int().min(0).max(4095);
const slot = z.string().min(1).max(4);

export const gameActionSchema = z.discriminatedUnion("a", [
  // setup (any detective, collaboratively)
  z.object({ a: z.literal("setLock"), slot, face: z.enum(["open", "locked"]).nullable() }),
  z.object({ a: z.literal("place"), cell }),
  z.object({ a: z.literal("remove"), cell }),
  z.object({ a: z.literal("movePiece"), from: cell, to: cell }),
  z.object({ a: z.literal("placeDetective"), pawn: z.string().max(4), cell }),
  z.object({ a: z.literal("autoPlace") }),
  z.object({ a: z.literal("clear") }),
  z.object({ a: z.literal("setupReady"), ready: z.boolean() }),
  // thief: the whole turn in one message
  z.object({
    a: z.literal("thiefTurn"),
    entry: slot.optional(),
    dest: cell,
    path: z.array(cell).min(1).max(3).optional(),
    disableCamera: z.boolean().optional(),
    cutPower: z.boolean().optional(),
    tryLock: z.boolean().optional(),
  }),
  z.object({ a: z.literal("motionResponse"), snip: z.boolean() }),
  // detectives
  z.object({ a: z.literal("roll") }),
  z.object({ a: z.literal("move"), dest: cell }),
  z.object({ a: z.literal("eye"), target: z.union([z.literal("self"), z.number().int().min(1).max(6)]) }),
  z.object({ a: z.literal("scan") }),
  z.object({ a: z.literal("motion") }),
  z.object({ a: z.literal("skipAction") }),
  z.object({ a: z.literal("endTurn") }),
  z.object({ a: z.literal("mark"), cell, on: z.boolean() }),
  z.object({ a: z.literal("clearMarks") }),
]);

export type GameAction = z.infer<typeof gameActionSchema>;
export type ThiefTurnAction = Extract<GameAction, { a: "thiefTurn" }>;
