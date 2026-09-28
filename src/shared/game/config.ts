// House rules (analysis §5 rulings marked "Setting?") and fixed constants.

export type LockPlacement = "random" | "detectives";
export type Assist = "off" | "marks" | "overlay";

export interface HouseRules {
  /** R11/R12: paintings the thief must hold before a lock may be tried. */
  minPaintingsToEscape: number;
  /** R7: locks shuffled at random, or placed by the detectives (who then know the faces). */
  lockPlacement: LockPlacement;
  /** R5: a detective may stay put (matters only on a roll of 1). */
  detectiveMayStay: boolean;
  /** Detective deduction aids: nothing, shared suspect marks, or marks plus the possible-location overlay. */
  assist: Assist;
  /** "The museum opens at dawn": the detectives win once the thief has taken this many turns (0 = off). */
  dawnAfterThiefTurns: number;
}

export const DEFAULT_RULES: HouseRules = {
  minPaintingsToEscape: 3,
  lockPlacement: "random",
  detectiveMayStay: false,
  assist: "marks",
  dawnAfterThiefTurns: 0,
};

export const DAWN_OPTIONS = [0, 20, 30, 40] as const;

export type ActionFace = "eye" | "scan" | "motion";

/** R13: the action die is fixed at 4 Eye / 1 Scan / 1 Motion (confirmed from the physical die). */
export const ACTION_DIE: readonly ActionFace[] = ["eye", "eye", "eye", "eye", "scan", "motion"];

export const PAINTINGS = 9;
export const CAMERAS = 6;
export const SNIPS = 2;
export const OPEN_LOCKS = 6;
export const LOCKED_LOCKS = 5;
/** How long the thief has to answer or snip the motion detectors. */
export const MOTION_RESPONSE_MS = 20_000;
