// The in-game keyboard shortcuts' decisions, kept free of the DOM and the stores so they can be tested.
// Game.tsx reads the real state, asks these, and performs whatever they answer.

export interface FocusInfo {
  tag: string;
  role: string | null;
  /** Reached by keyboard (Tab/arrows), as opposed to a mouse click or a programmatic autofocus after one. */
  focusVisible: boolean;
}

/**
 * Enter and Space belong to a focused button or link when the player tabbed there: pressing Enter on
 * Cancel must cancel, not trigger the turn's primary shortcut. A click leaves focus on a button too,
 * but that isn't a keyboard choice, so shortcuts keep working after mouse use.
 */
export function defersToFocusedControl(key: string, focus: FocusInfo): boolean {
  if (key !== "Enter" && key !== " ") return false;
  const clickable = focus.tag === "BUTTON" || focus.tag === "A" || focus.tag === "SUMMARY" || focus.role === "button" || focus.role === "link";
  return clickable && focus.focusVisible;
}

export type PrimaryIntent =
  | { kind: "eye"; target: "self" | number }
  | { kind: "boardClick"; cell: number }
  | { kind: "roll" }
  | { kind: "move"; dest: number }
  | { kind: "ready"; ready: boolean };

export interface PrimaryState {
  role: "thief" | "detective" | "spectator" | null;
  setup: boolean;
  /** It's my detective's turn and nobody is waiting on the thief. */
  myDet: boolean;
  rolled: boolean;
  eyeRoll: boolean;
  acted: boolean;
  eyeTarget: "self" | number | null;
  cursor: number | null;
  moveDest: number | null;
  thiefPlanDest: number | null;
  iAmReady: boolean;
}

/** What Enter / Space should do right now (the turn's "primary action"), or null for nothing. */
export function primaryIntent(key: string, s: PrimaryState): PrimaryIntent | null {
  // Eye is two steps: a picked target waits for Enter (or the Confirm button).
  if (key === "Enter" && s.myDet && s.eyeRoll && !s.acted && s.eyeTarget !== null) return { kind: "eye", target: s.eyeTarget };
  if (key !== "Enter" && key !== " ") return null;
  if (key === "Enter" && s.cursor !== null && !(s.role === "thief" && s.thiefPlanDest === s.cursor) && s.moveDest !== s.cursor) return { kind: "boardClick", cell: s.cursor };
  if (s.myDet && !s.rolled) return { kind: "roll" };
  if (s.myDet && s.moveDest !== null) return { kind: "move", dest: s.moveDest };
  if (s.setup && s.role === "detective" && key === "Enter") return { kind: "ready", ready: !s.iAmReady };
  return null;
}
