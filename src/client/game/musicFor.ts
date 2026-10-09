import type { GamePhase } from "../../shared/game/state";
import type { MusicMode } from "../music";

/**
 * Which background track a game screen is playing, or null to leave the music as it is.
 *
 * Only public facts go in: `powerCut` is already redacted per viewer (a detective's view reports it
 * once the cut is discovered), so the music never tells anyone what the lighting doesn't.
 * `resultShown` is the presenter's flag for the round-over screen, which turns on only after the
 * capture or escape cinematic has played, and also on first sight of a finished round (a reload).
 * Until then the round-over state returns null so the stinger isn't cut short.
 */
export function musicFor(s: { phase: GamePhase; revealed: boolean; powerCut: boolean; resultShown: boolean }): MusicMode | null {
  if (s.phase === "play") return s.revealed ? "chase" : s.powerCut ? "lights-out" : "calm";
  if (s.phase === "roundOver") return s.resultShown ? "results" : null;
  return "lobby"; // the four setup phases keep the lobby's mood
}
