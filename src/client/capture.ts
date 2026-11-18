// Capture mode, for recording footage (trailers, the SnackPack title-screen preview): URL flags on
// /solo that make a solo game repeatable and let it play itself. Development builds only: in a
// production build `captureOptions()` is always null and nothing here changes the game.
//
//   /solo?role=thief&n=3&seed=7&watch&as=omniscient&turn=6&clean&hud=0
//
//   seed=<n>      The room's RNG (dice, bots, setup) and the page's Math.random start from n, so the
//                 same flags give the same game. Pair it with a controlled clock (Playwright's
//                 page.clock) and the same frames come out every time.
//   watch         Bots play every seat, yours included: the game plays itself from start to finish.
//   start         Skips the lobby and starts the heist at once (implied by turn and end).
//   turn=<n>      Fast-forwards to the start of the thief's turn n (bots play, instantly), so the
//                 first frame is already mid-game. Implies start and watch.
//   end           Fast-forwards to the end of the round: the round-over recap. Implies start and watch.
//   as=<who>      Whose eyes the board shows: thief, detectives or omniscient (the debug peek).
//   clean         Hides the chrome a clip doesn't want: the debug gear, toasts, hand-written hints,
//                 tooltips, the board cursor and the "peeking" badge. The HUD itself stays.
//   hud=0         Hides the game's HUD too (turn bar, pad, log, action panel), so the camera frames
//                 the whole board. The dice, banners, big headlines and the round-over card still
//                 show; a headline that has docked to the corner doesn't.
//   skill=rookie  Bot skill (pro by default), for a longer round with more near misses.
//
// window.__sneak (dev builds) also gets `capture`: the options in force, and `send` to issue debug
// commands mid-take (cutPower, forceRoll and so on) from an automation script.

import { mulberry32 } from "../shared/rng";

export interface CaptureOptions {
  seed: number | null;
  watch: boolean;
  start: boolean;
  turn: number | null;
  end: boolean;
  as: "thief" | "detectives" | "omniscient" | null;
  clean: boolean;
  /** False with hud=0: no turn bar, pad, log or action panel. */
  hud: boolean;
  skill: "rookie" | "pro" | null;
}

const VIEWERS = ["thief", "detectives", "omniscient"] as const;

function parse(search: string): CaptureOptions | null {
  const q = new URLSearchParams(search);
  const flag = (k: string) => q.has(k) && q.get(k) !== "0";
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };
  const as = q.get("as");
  const skill = q.get("skill");
  const opts: CaptureOptions = {
    seed: num("seed"),
    turn: num("turn"),
    end: flag("end"),
    watch: flag("watch"),
    start: flag("start"),
    as: (VIEWERS as readonly string[]).includes(as ?? "") ? (as as CaptureOptions["as"]) : null,
    clean: flag("clean"),
    hud: q.get("hud") !== "0",
    skill: skill === "rookie" || skill === "pro" ? skill : null,
  };
  if (opts.turn !== null || opts.end) opts.watch = opts.start = true;
  const any = opts.seed !== null || opts.watch || opts.start || opts.as !== null || opts.clean || !opts.hud || opts.skill !== null;
  return any ? opts : null;
}

const options: CaptureOptions | null = import.meta.env.DEV && location.pathname === "/solo" ? parse(location.search) : null;

/** The capture flags on this page, or null (always null in production builds). */
export function captureOptions(): CaptureOptions | null {
  return options;
}

// Seed the page's own randomness (particles, idle animations) before any other module asks for it:
// main.tsx imports this module first.
if (options?.seed != null) Math.random = mulberry32(options.seed ^ 0x9e3779b9);
if (options?.clean) document.documentElement.classList.add("capture-clean");
if (options && !options.hud) document.documentElement.classList.add("capture-nohud");
