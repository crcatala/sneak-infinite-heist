// Bot entry point: the room asks for one action at a time, passing only the bot's own view.

import type { GameAction } from "../game/actions";
import type { GameView } from "../game/views";
import type { Rng } from "../rng";
import { detectiveAction } from "./detective";
import { randomAction } from "./random";
import { thiefAction } from "./thief";

export type BotLevel = "smart" | "rookie" | "random";

export function botAction(view: GameView, me: string, rng: Rng, level: BotLevel = "smart"): GameAction | null {
  if (level === "random") return randomAction(view, me, rng);
  // Rookies play smart most of the time, but fumble a third of their decisions.
  if (level === "rookie" && view.phase === "play" && rng() < 0.35) return randomAction(view, me, rng) ?? botAction(view, me, rng, "smart");
  const smart = view.thief.controller === me ? thiefAction(view, me, rng) : detectiveAction(view, me, rng);
  return smart ?? randomAction(view, me, rng);
}
