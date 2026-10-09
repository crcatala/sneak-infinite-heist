import type { MusicMode } from "../music";

/**
 * Which background track the board is playing. Only public facts go in: `powerCut` is already
 * redacted per viewer (a detective's view reports it once the cut is discovered), so the music
 * never tells anyone what the lighting doesn't.
 */
export function musicFor(s: { revealed: boolean; powerCut: boolean }): Extract<MusicMode, "calm" | "lights-out" | "chase"> {
  if (s.revealed) return "chase";
  return s.powerCut ? "lights-out" : "calm";
}
