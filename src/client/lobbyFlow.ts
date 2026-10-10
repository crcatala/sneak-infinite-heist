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
