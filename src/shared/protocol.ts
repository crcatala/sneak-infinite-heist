// Wire protocol between browser and room Durable Object.
// Client messages are validated with zod on the server; server messages are trusted by the client.

import { z } from "zod";
import type { DetectiveColour } from "./characters";
import { gameActionSchema } from "./game/actions";
import type { MatchRound, Standing } from "./game/score";
import type { GameView } from "./game/views";
import type { MatchMode, Player, RoomPhase, RoomSettings } from "./roomTypes";

const id = z.string().min(1).max(64);
const colour = z.enum(["red", "yellow", "green", "blue", "purple", "white"]);

const rulesPatch = z
  .object({
    minPaintingsToEscape: z.number().int().min(1).max(9),
    lockPlacement: z.enum(["random", "detectives"]),
    detectiveMayStay: z.boolean(),
    assist: z.enum(["off", "marks", "overlay"]),
    dawnAfterThiefTurns: z.union([z.literal(0), z.literal(20), z.literal(30), z.literal(40)]),
  })
  .partial();

const settingsPatch = z
  .object({
    mode: z.enum(["single", "match"]),
    thiefSelection: z.enum(["random", "volunteer", "host"]),
    turnTimerSec: z.union([z.literal(0), z.literal(60), z.literal(90), z.literal(120)]),
    botSkill: z.enum(["rookie", "pro"]),
    layout: z.discriminatedUnion("kind", [z.object({ kind: z.literal("classic") }), z.object({ kind: z.literal("remix"), seed: z.number().int().min(0).max(4294967295) })]),
    rules: rulesPatch,
  })
  .partial();

export const DEBUG_COMMANDS = ["autoSetup", "skipToPlay", "forceRoll", "givePaintings", "cutPower", "restorePower", "endRound", "viewAs", "startNow"] as const;
export type DebugCommand = (typeof DEBUG_COMMANDS)[number];
/** Debug commands that reveal hidden information: solo mode and dev builds only. */
export const CHEAT_COMMANDS: DebugCommand[] = ["viewAs"];

export const EMOTES = ["👍", "😂", "😱", "🕵️", "🤫", "💰", "🚨", "👀"] as const;

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("ping") }),
  z.object({ t: z.literal("setName"), name: z.string().trim().min(1).max(24) }),
  z.object({ t: z.literal("setReady"), ready: z.boolean() }),
  z.object({ t: z.literal("setCharacter"), character: colour.nullable() }),
  z.object({ t: z.literal("volunteer"), on: z.boolean() }),
  z.object({ t: z.literal("settings"), patch: settingsPatch }),
  z.object({ t: z.literal("setThief"), playerId: id.nullable() }),
  z.object({ t: z.literal("addBot") }),
  z.object({ t: z.literal("kick"), playerId: id }),
  z.object({ t: z.literal("game"), action: gameActionSchema }),
  z.object({ t: z.literal("nextRound") }),
  z.object({ t: z.literal("backToLobby") }),
  z.object({ t: z.literal("sit") }),
  z.object({ t: z.literal("botTakeover"), playerId: id, on: z.boolean() }),
  z.object({ t: z.literal("emote"), emote: z.enum(EMOTES) }),
  /** A detective's pointer pin, in board-grid units (a cell's centre is a whole number). */
  z.object({ t: z.literal("pin"), x: z.number().min(-1).max(100), y: z.number().min(-1).max(100) }),
  z.object({
    t: z.literal("debug"),
    cmd: z.enum(DEBUG_COMMANDS),
    move: z.number().int().min(1).max(6).optional(),
    action: z.enum(["eye", "scan", "motion"]).optional(),
    n: z.number().int().min(0).max(9).optional(),
    winner: z.enum(["thief", "detectives"]).optional(),
    as: z.enum(["thief", "detectives", "omniscient"]).nullable().optional(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- Server → client --------------------------------------------------------------------------

export type Role = "thief" | "detective" | "spectator";

export interface ClockView {
  kind: "turn" | "motion";
  /** Server epoch ms, or null while paused. */
  deadline: number | null;
  pausedLeft: number | null;
  /** The turn ran out and the bots are finishing it. */
  autoplay: boolean;
}

export interface MatchView {
  mode: MatchMode;
  round: number;
  total: number;
  thieves: string[];
  results: MatchRound[];
  standings: Standing[];
  done: boolean;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  you: string;
  players: Player[];
  spectators: Player[];
  settings: RoomSettings;
  hostThief: string | null;
  /** Why the game can't start yet, or null. */
  startBlocker: string | null;
  /** Your role this round (spectators aren't seated). */
  role: Role | null;
  game: GameView | null;
  match: MatchView | null;
  clock: ClockView | null;
  /** Player ids the game is waiting on. */
  waitingOn: string[];
  /** Debug tools that reveal secrets are available (solo mode, local dev). */
  cheats: boolean;
  /** What you're peeking as, when a cheat view is on. */
  viewAs: "thief" | "detectives" | "omniscient" | null;
  serverNow: number;
}

export type ServerMessage =
  | { t: "welcome"; you: string; secret: string; code: string }
  /** Sent before closing with CLOSE.claim: the game has started, pick a free seat to rejoin. */
  | { t: "claim"; seats: { id: string; name: string }[] }
  /** The server is ending this session for good (e.g. the room was deleted). */
  | { t: "closed"; code: number; message: string }
  | { t: "state"; view: RoomView }
  | { t: "emote"; by: string; emote: string }
  /** A teammate's pointer pin (detectives only; the thief never receives these). */
  | { t: "pin"; by: string; x: number; y: number }
  | { t: "error"; message: string }
  | { t: "pong" };

export { CLOSE } from "./close";

export type { DetectiveColour };
