// Pure helpers for the lobby: the detective carousel's ring maths and the first-time hint steps.
// No DOM or storage in here, so they can be unit-tested (tests/lobbyFlow.test.ts).

/** Signed shortest distance from the focused slot to slot `i` on a ring of `n` (so -2..2 for n = 6, and 3 is "behind"). */
export function ringOffset(i: number, focus: number, n: number): number {
  const half = Math.floor(n / 2);
  const raw = (((i - focus) % n) + n) % n; // 0..n-1
  return raw > half ? raw - n : raw;
}

/** How a carousel slot at ring offset `d` is drawn: the focused one full size, neighbours smaller, dimmer and further back. */
export function flowPose(d: number): { scale: number; opacity: number; brightness: number; z: number } {
  const a = Math.abs(d);
  return {
    scale: d === 0 ? 1 : Math.max(0.4, 1 - 0.2 * a) * 0.82,
    opacity: a > 2 ? 0 : 1 - 0.22 * a,
    brightness: 1 - 0.18 * Math.min(a, 3),
    z: 10 - a,
  };
}

/** The slot one step left (-1) or right (+1) of `focus`, wrapping around. */
export function cycle(focus: number, dir: 1 | -1, n: number): number {
  return (((focus + dir) % n) + n) % n;
}

/** Which way a horizontal drag of `dx` px swipes the carousel: dragging left brings the next detective (1), right the previous (-1). 0 = too short to count. */
export function swipeDir(dx: number, threshold = 40): 1 | -1 | 0 {
  if (Math.abs(dx) <= threshold) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Where keyboard focus is, as far as the lobby's shortcuts care. `idle` is nothing focused (the state after a
 * mouse click, which the lobby blurs on purpose, and the state a gamepad lives in). `other` is any focused
 * control, which keeps its own Enter and Space behaviour.
 */
export type LobbyFocus = "idle" | "input" | "other";

export type LobbyKeyAction = "prev" | "next" | "choose" | "ready" | "leave" | "closeSheet" | null;

export interface LobbyKeyContext {
  focus: LobbyFocus;
  /** The rules sheet is open on top. */
  sheet: boolean;
  /** There is a carousel to browse (not a solo thief). */
  canBrowse: boolean;
  /** The browsed detective can be chosen right now (seated, and not taken by someone else). */
  canChoose: boolean;
}

/**
 * What a key press does in the lobby. Arrows and R work wherever focus is. Enter (choose) and Space (ready)
 * only act when nothing is focused, so they never hijack a focused button; the gamepad's A and X arrive as
 * Enter and Space.
 */
export function lobbyKey(key: string, ctx: LobbyKeyContext): LobbyKeyAction {
  if (ctx.focus === "input") return null;
  if (key === "Escape") return ctx.sheet ? "closeSheet" : "leave";
  if (ctx.sheet) return null;
  if (key === "r" || key === "R") return "ready";
  if (key === "ArrowLeft") return ctx.canBrowse ? "prev" : null;
  if (key === "ArrowRight") return ctx.canBrowse ? "next" : null;
  if (ctx.focus !== "idle") return null;
  if (key === " ") return "ready";
  if (key === "Enter") return ctx.canBrowse && ctx.canChoose ? "choose" : null;
  return null;
}

/** Which first-time hint arrow the lobby shows. Stored as two booleans so each step is remembered on its own. */
export interface HintProgress {
  picked: boolean;
  readied: boolean;
}

export type HintStep = "pick" | "ready" | null;

export interface HintContext {
  /** Has a seat (not just watching). */
  seated: boolean;
  /** This player is already ready, so there is nothing to remind them about. */
  ready: boolean;
  /** A dialog (the rules sheet) is open on top. */
  busy: boolean;
  /** There is a detective to choose (solo thieves have no carousel). */
  canPick: boolean;
}

/**
 * Step one points at the Choose button until the player has chosen a detective once, step two points
 * at the ready button until they have readied up once. A returning player who has done both sees neither.
 */
export function hintStep(progress: HintProgress, ctx: HintContext): HintStep {
  if (!ctx.seated || ctx.busy || ctx.ready) return null;
  if (ctx.canPick && !progress.picked) return "pick";
  if (!progress.readied) return "ready";
  return null;
}
