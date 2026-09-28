// Room-level data model: seats, lobby settings, match progress and clocks. The game itself (one
// round) lives in game/.

import type { DetectiveColour } from "./characters";
import type { HouseRules } from "./game/config";
import type { MatchRound } from "./game/score";
import type { GameState } from "./game/state";

export type RoomPhase = "lobby" | "game";
export type MatchMode = "single" | "match";
export type ThiefSelection = "random" | "volunteer" | "host";
export const TURN_TIMER_OPTIONS = [0, 60, 90, 120] as const;

export interface RoomSettings {
  /** One round (default), or a match where every human is the thief once. */
  mode: MatchMode;
  thiefSelection: ThiefSelection;
  /** Seconds per turn, 0 = no timer. Expired turns are finished by the bot logic. */
  turnTimerSec: number;
  /** How well the bots play. */
  botSkill: "rookie" | "pro";
  /** The classic museum, or a seeded remix (shareable seed). */
  layout: { kind: "classic" } | { kind: "remix"; seed: number };
  rules: HouseRules;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  /** Chosen detective character (also used for the second pawn's pick order). */
  character: DetectiveColour | null;
  /** Raised a hand to be the thief. */
  volunteer: boolean;
  /** A disconnected human whose turns the bot logic plays (host's choice, cleared on return). */
  botTakeover?: boolean;
}

export interface MatchState {
  /** Thief for each round, in order. */
  thieves: string[];
  /** Index of the current round. */
  round: number;
  results: MatchRound[];
}

/** Timers for the current decision. All times are server epoch ms. */
export interface RoomClock {
  /** Identifies the current turn; a new key resets the turn timer. */
  key: string;
  turnDeadline: number | null;
  /** Remaining turn time while paused (active human offline, or waiting on the thief). */
  pausedLeft: number | null;
  /** The turn timed out: the bot logic finishes it. */
  autoplay: boolean;
  motionDeadline: number | null;
  /** When the next bot (or auto-played) step happens. */
  botAt: number | null;
}

export interface RoomState {
  code: string;
  createdAt: number;
  inviteId?: string;
  phase: RoomPhase;
  players: Player[];
  /** People watching without a seat (they see only public information). */
  spectators?: Player[];
  /** Seat secrets by player id. Never sent to clients. */
  secrets: Record<string, string>;
  nextId: number;
  settings: RoomSettings;
  /** The host's pick when thiefSelection is "host". */
  hostThief: string | null;
  game: GameState | null;
  match: MatchState | null;
  clock: RoomClock | null;
}
