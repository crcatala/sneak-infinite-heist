// Event presentation: every new event in the viewer's log becomes a log line, and plays one at a
// time as sound, toast, banner and scene effect. Cinematics are short and skippable (click / Space /
// Esc), hold Space to fast-forward, reduced motion shortens everything, and the debug slow-motion
// switch stretches them 6×. Hidden information never animates: the log only contains what the
// viewer is allowed to see, so there's nothing hidden to play.

import { create } from "zustand";
import { COLOUR_LABEL, getBoard, type Cell, type FloorColour } from "../../shared/board/model";
import { ARTWORKS } from "../../shared/characters";
import type { GameEvent } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { reducedMotion } from "../prefs";
import { setMusic, sfx } from "../sfx";
import { useStore } from "../store";
import { cellLabel, pawnName, playerName, slotLabel } from "./derive";

export type Tone = "info" | "good" | "bad" | "secret" | "alarm";

export interface LogLine {
  seq: number;
  icon: string;
  text: string;
  tone: Tone;
  /** Only the thief could see this (shown with a lock in the log). */
  secret: boolean;
  /** Thief turn this happened in. */
  turn: number;
}

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: "gold" | "alarm" | "mint" | "moon";
}

export interface Flash {
  id: number;
  kind: "sight" | "sightHit" | "sightMiss" | "colour" | "spark" | "ping" | "spot";
  cells: Cell[];
  colour?: FloorColour;
  /** Camera number or pawn id the flash belongs to. */
  source?: string | number;
  until: number;
}

export interface DiceRoll {
  id: number;
  move: number;
  action: "eye" | "scan" | "motion";
  pawn: string;
  until: number;
}

interface Fx {
  banner: Banner | null;
  flashes: Flash[];
  dice: DiceRoll | null;
  /** "Somewhere on these lines": a camera saw the hidden thief. Cleared on the next thief move. */
  hint: { cells: Cell[]; camera: number } | null;
  lifting: { painting: number; cell: Cell; until: number } | null;
  flipping: { slot: string; until: number } | null;
  /** The event currently playing (for "skip"). */
  playing: boolean;
  /** Round-over panel may show (after its banner). */
  showResult: boolean;
  set: (p: Partial<Fx>) => void;
}

export const useFx = create<Fx>((set) => ({
  banner: null,
  flashes: [],
  dice: null,
  hint: null,
  lifting: null,
  flipping: null,
  playing: false,
  showResult: false,
  set: (p) => set(p),
}));

let nextId = 1;

export interface Ctx {
  view: RoomView;
  game: GameView;
}

const COLOUR_WORD = (c: FloorColour) => COLOUR_LABEL[c].toUpperCase();

/** Log line for an event, from the viewer's point of view. */
export function describe(e: GameEvent, ctx: Ctx): LogLine | null {
  const { game, view } = ctx;
  const board = getBoard(game.board);
  const who = (pawn: string) => pawnName(game, pawn);
  const thiefName = playerName(view, game.thief.controller);
  const iAmThief = view.role === "thief";
  const line = (icon: string, text: string, tone: Tone = "info"): LogLine => ({ seq: e.seq, icon, text, tone, secret: e.vis === "thief", turn: 0 });
  switch (e.type) {
    case "phase":
      return e.phase === "setupPaintings"
        ? line("🖼️", "The detectives hang the paintings.")
        : e.phase === "setupCameras"
          ? line("📹", "The detectives install the cameras.")
          : e.phase === "setupDetectives"
            ? line("🕵️", "The detectives take their posts.")
            : e.phase === "setupLocks"
              ? line("🔒", "The detectives set the locks.")
              : null;
    case "locksShuffled":
      return line("🔒", "The locks are shuffled face down.");
    case "locksPlaced":
      return line("🔒", "Locks placed: you know which exits are open.", "secret");
    case "playStarted":
      return line("🌙", "Lights out. The heist begins!", "good");
    case "thiefTurn":
      return null;
    case "thiefMoved":
      if (e.vis === "thief") return line("👣", e.entry ? `You slipped in through the ${slotLabel(board, e.entry)} and crept ${e.path!.length} space${e.path!.length === 1 ? "" : "s"}.` : `You crept ${e.path!.length} space${e.path!.length === 1 ? "" : "s"}.`, "secret");
      if (e.path) return line("🏃", `${thiefName}, the thief, dashed ${e.path.length} space${e.path.length === 1 ? "" : "s"} in plain sight.`, "alarm");
      return line("👣", e.turn === 1 ? "The thief slipped inside…" : "The thief moved.");
    case "paintingVanished":
      return line("🖼️", `"${ARTWORKS[e.painting].title}" vanished from the ${cellLabel(board, e.cell)}!`, "bad");
    case "paintingStolen":
      if (e.pending) return line("💰", `You marked "${ARTWORKS[e.painting].title}". It leaves the wall at the start of your next turn.`, "secret");
      return line("💰", `The thief grabbed "${ARTWORKS[e.painting].title}"${e.onReveal ? " as the lights hit them" : ""}!`, "bad");
    case "cameraDisabled":
      return line("📹", `You disabled camera ${e.n}. Nobody knows… yet.`, "secret");
    case "powerCut":
      return line("⚡", "You cut the power. Cameras and motion detectors are dead until someone finds out.", "secret");
    case "lockTried":
      return e.face === "open" ? line("🔓", `The ${slotLabel(board, e.slot)} is OPEN!`, "alarm") : line("🔒", `Someone rattled the ${slotLabel(board, e.slot)}: LOCKED. The thief was right there!`, "info");
    case "detectiveTurn":
      return null;
    case "rolled":
      return line("🎲", `${who(e.pawn)} rolled ${e.move} and ${e.action === "eye" ? "an Eye" : e.action === "scan" ? "Scan" : "Motion"}.`);
    case "boxedIn":
      return line("🧱", `${who(e.pawn)} is boxed in and can't move.`);
    case "detectiveMoved":
      return line("👟", `${who(e.pawn)} moved ${e.path.length} space${e.path.length === 1 ? "" : "s"} to the ${cellLabel(board, e.to)}.`);
    case "powerRestored":
      return e.silent ? line("💡", `${who(e.pawn)} stepped on the switch and quietly restored your power cut.`, "secret") : line("💡", `${who(e.pawn)} flipped the switch: the lights are back on!`, "good");
    case "eye":
      return e.seen ? line("👁️", `${who(e.pawn)} looked around… and SAW THE THIEF!`, "alarm") : line("👁️", `${who(e.pawn)} looked around: nothing.`);
    case "thiefRevealed":
      return line("🚨", iAmThief ? "You've been spotted! Everyone can see you now." : "The thief is revealed! Chase them down!", "alarm");
    case "camera":
      return e.result === "sees"
        ? line("📹", `Camera ${e.n} can see the thief!`, "alarm")
        : e.result === "clear"
          ? line("📹", `Camera ${e.n}: no sign of the thief.`)
          : e.result === "dead"
            ? line("💥", `Camera ${e.n} isn't working: sabotaged! It's taken away.`, "bad")
            : line("⚡", `${who(e.pawn)} tried camera ${e.n}…`);
    case "scan":
      if (e.result === "powerOut") return line("⚡", `${who(e.pawn)} tried a scan…`);
      return line(
        "📡",
        `Scan: ${e.removed.length ? `camera${e.removed.length > 1 ? "s" : ""} ${e.removed.join(", ")} found dead and removed. ` : ""}${e.seeing.length ? `camera${e.seeing.length > 1 ? "s" : ""} ${e.seeing.join(", ")} see${e.seeing.length > 1 ? "" : "s"} the thief!` : "no camera sees the thief."}`,
        e.seeing.length ? "alarm" : e.removed.length ? "bad" : "info",
      );
    case "powerOutDiscovered":
      return line("⚡", "The power is out! Cameras and motion detectors are dead.", "bad");
    case "motionAsked":
      return line("📶", `${who(e.pawn)} triggered the motion detectors…`);
    case "motion":
      return e.result === "answered"
        ? line("📶", `Motion detectors: the thief is on ${COLOUR_WORD(e.colour!)}.`, "alarm")
        : e.result === "snipped"
          ? line("✂️", `The thief snipped the motion detectors (${e.snipsLeft} snip${e.snipsLeft === 1 ? "" : "s"} left).`, "bad")
          : line("⚡", `${who(e.pawn)} tried the motion detectors…`);
    case "actionSkipped":
      return line("💤", `${who(e.pawn)} skipped their action.`);
    case "captured":
      return line("🚔", `${who(e.pawn)} NABBED the thief${e.wasHidden ? " in the dark" : ""}!`, e.vis === "all" && iAmThief ? "bad" : "good");
    case "escaped":
      return line("🏃", `The thief ESCAPED through the ${slotLabel(board, e.slot)} with ${e.paintings} painting${e.paintings === 1 ? "" : "s"}!`, iAmThief ? "good" : "bad");
    case "dawn":
      return line("🌅", "Dawn breaks and the museum opens. The thief is trapped!", iAmThief ? "bad" : "good");
    case "roundOver":
      return null;
  }
}

/** Builds the full log with thief-turn numbers. */
export function buildLog(ctx: Ctx): LogLine[] {
  const out: LogLine[] = [];
  let turn = 0;
  for (const e of ctx.game.events) {
    if (e.type === "thiefTurn") turn = e.turn;
    const l = describe(e, ctx);
    if (l) out.push({ ...l, turn });
  }
  return out;
}

// --- the player ---------------------------------------------------------------------------------

let queue: GameEvent[] = [];
let lastSeq = -1;
let timer: ReturnType<typeof setTimeout> | undefined;
let fastForward = false;
let skipCurrent: (() => void) | null = null;

export function setFastForward(on: boolean) {
  fastForward = on;
}

/** Skips the event currently playing (and its banner). */
export function skipFx() {
  skipCurrent?.();
}

function speed() {
  const slow = useStore.getState().debug.slowMotion ? 6 : 1;
  return (reducedMotion() ? 0.5 : 1) * slow / (fastForward ? 4 : 1);
}

/** Forget what's been played (new round / new room). */
export function resetPlayer(seq = -1) {
  queue = [];
  lastSeq = seq;
  clearTimeout(timer);
  timer = undefined;
  skipCurrent = null;
  useFx.setState({ banner: null, flashes: [], dice: null, hint: null, lifting: null, flipping: null, playing: false, showResult: false });
}

/** Feed the latest view: new events are queued and played in order. */
export function ingest(ctx: Ctx) {
  const events = ctx.game.events;
  if (lastSeq < 0) {
    // First look at this game: don't replay history, just show the state.
    lastSeq = events.length ? events[events.length - 1].seq : 0;
    useFx.setState({ showResult: ctx.game.phase === "roundOver" });
    return;
  }
  const fresh = events.filter((e) => e.seq > lastSeq);
  if (!fresh.length) return;
  lastSeq = fresh[fresh.length - 1].seq;
  queue.push(...fresh);
  if (!timer && !useFx.getState().playing) playNext(ctx);
  latestCtx = ctx;
}

let latestCtx: Ctx | null = null;

function playNext(ctx: Ctx) {
  const e = queue.shift();
  if (!e) {
    useFx.setState({ playing: false });
    timer = undefined;
    return;
  }
  useFx.setState({ playing: true });
  const ms = play(e, latestCtx ?? ctx) * speed();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    skipCurrent = null;
    const fx = useFx.getState();
    if (fx.banner && fx.banner.id === bannerOf) useFx.setState({ banner: null });
    timer = undefined;
    playNext(latestCtx ?? ctx);
  };
  skipCurrent = finish;
  timer = setTimeout(finish, ms);
}

let bannerOf = 0;

function banner(text: string, tone: Banner["tone"], sub?: string) {
  bannerOf = nextId++;
  useFx.setState({ banner: { id: bannerOf, text, sub, tone } });
}

function flash(f: Omit<Flash, "id" | "until">, ms: number) {
  const until = performance.now() + ms * speed();
  const item = { ...f, id: nextId++, until };
  useFx.setState((s) => ({ flashes: [...s.flashes.filter((x) => x.until > performance.now()), item] }));
  setTimeout(() => useFx.setState((s) => ({ flashes: s.flashes.filter((x) => x.id !== item.id) })), ms * speed() + 50);
}

/** Plays one event; returns how long it takes (ms at normal speed). */
function play(e: GameEvent, ctx: Ctx): number {
  const { game, view } = ctx;
  const board = getBoard(game.board);
  const toast = useStore.getState().toast;
  const iAmThief = view.role === "thief";
  const myTurnPawn = (pawn: string) => game.detectives.find((d) => d.id === pawn)?.controller === view.you;
  const line = describe(e, ctx);

  switch (e.type) {
    case "phase":
      if (e.phase === "play") return 0;
      banner(e.phase === "setupPaintings" ? "HANG THE PAINTINGS" : e.phase === "setupCameras" ? "INSTALL CAMERAS" : e.phase === "setupDetectives" ? "TAKE YOUR POSTS" : "SET THE LOCKS", "moon", iAmThief ? "Watch closely: remember everything." : undefined);
      sfx.whoosh();
      return 1300;
    case "playStarted":
      banner("LIGHTS OUT!", "gold", iAmThief ? "Pick a window or door to sneak in through." : "The thief is somewhere outside…");
      sfx.titleSting();
      setMusic("calm");
      return 1800;
    case "thiefTurn":
      if (iAmThief) sfx.turnChime();
      return 0;
    case "detectiveTurn":
      if (myTurnPawn(e.pawn)) sfx.turnChime();
      return 0;
    case "thiefMoved":
      useFx.setState({ hint: null });
      if (e.path) {
        e.path.forEach((_, i) => setTimeout(() => sfx.step(i), i * 170 * speed()));
        return 200 + e.path.length * 170;
      }
      if (e.vis === "thief") return 250;
      // The hidden thief makes no sound and nothing moves: just a note.
      return 350;
    case "paintingVanished":
      useFx.setState({ lifting: { painting: e.painting, cell: e.cell, until: performance.now() + 1100 * speed() } });
      sfx.steal();
      toast(`Stolen from the ${cellLabel(board, e.cell)}!`, "bad", "🖼️");
      return 1100;
    case "paintingStolen":
      if (e.pending) {
        sfx.lift();
        toast(`Marked "${ARTWORKS[e.painting].title}" (secret)`, "secret", "🔒");
        return 500;
      }
      useFx.setState({ lifting: { painting: e.painting, cell: e.cell, until: performance.now() + 1100 * speed() } });
      sfx.steal();
      toast(`Stolen from the ${cellLabel(board, e.cell)}!`, "bad", "🖼️");
      return 1000;
    case "cameraDisabled":
      sfx.cameraClick();
      toast(`Camera ${e.n} disabled (secret)`, "secret", "🔒");
      return 500;
    case "powerCut":
      sfx.powerDown();
      toast("You cut the power (secret)", "secret", "🔒");
      return 900;
    case "lockTried":
      useFx.setState({ flipping: { slot: e.slot, until: performance.now() + 1000 * speed() } });
      sfx.lockClunk();
      if (e.face === "open") setTimeout(() => sfx.lockOpen(), 500 * speed());
      else toast(`${slotLabel(board, e.slot)}: LOCKED`, iAmThief ? "bad" : "info", "🔒");
      flash({ kind: "ping", cells: [e.cell] }, 2000);
      return 1200;
    case "rolled":
      useFx.setState({ dice: { id: nextId++, move: e.move, action: e.action, pawn: e.pawn, until: performance.now() + 1100 * speed() } });
      sfx.dice();
      return 1100;
    case "boxedIn":
      toast(line!.text, "info", "🧱");
      return 600;
    case "detectiveMoved":
      e.path.forEach((_, i) => setTimeout(() => sfx.step(i), i * 170 * speed()));
      return 150 + e.path.length * 170;
    case "powerRestored":
      if (e.silent) {
        toast(line!.text, "secret", "🔒");
        return 600;
      }
      sfx.powerUp();
      banner("LIGHTS ON", "mint");
      return 1100;
    case "eye": {
      const cells = board.sight[e.from] ?? [];
      flash({ kind: e.seen ? "sightHit" : "sightMiss", cells, source: e.pawn }, e.seen ? 1600 : 1000);
      sfx.whoosh();
      if (!e.seen) setTimeout(() => sfx.no(), 500 * speed());
      return e.seen ? 500 : 1000;
    }
    case "thiefRevealed":
      flash({ kind: "spot", cells: [e.cell] }, 2200);
      sfx.spotlight();
      setTimeout(() => sfx.alarm(), 200 * speed());
      banner("CHASE!", "alarm", iAmThief ? "You've been spotted: run for an exit!" : "The thief is revealed!");
      setMusic("chase");
      return 1900;
    case "camera": {
      const cam = cameraCell(ctx, e.n);
      sfx.cameraClick();
      if (e.result === "sees" && cam !== null) {
        const cells = board.sight[cam];
        flash({ kind: "sightHit", cells, source: e.n }, 1500);
        if (!game.thief.revealed || iAmThief) useFx.setState({ hint: { cells, camera: e.n } });
        setTimeout(() => sfx.yes(), 300 * speed());
        toast(`Camera ${e.n} sees the thief!`, "bad", "📹");
      } else if (e.result === "clear" && cam !== null) {
        flash({ kind: "sightMiss", cells: board.sight[cam], source: e.n }, 1000);
        setTimeout(() => sfx.no(), 300 * speed());
      } else if (e.result === "dead" && cam !== null) {
        flash({ kind: "spark", cells: [cam] }, 1200);
        toast(`Camera ${e.n} was sabotaged!`, "bad", "💥");
      }
      return e.result === "powerOut" ? 400 : 1200;
    }
    case "scan": {
      if (e.result === "powerOut") return 400;
      const all = [...e.removed, ...e.checked];
      all.forEach((n, i) =>
        setTimeout(() => {
          const cam = cameraCell(ctx, n);
          if (cam === null) return;
          if (e.removed.includes(n)) flash({ kind: "spark", cells: [cam] }, 900);
          else flash({ kind: e.seeing.includes(n) ? "sightHit" : "sightMiss", cells: board.sight[cam], source: n }, e.seeing.includes(n) ? 1600 : 700);
          sfx.cameraPing(i);
        }, i * 220 * speed()),
      );
      if (e.seeing.length) {
        const cells = e.seeing.map((n) => cameraCell(ctx, n)).filter((c): c is Cell => c !== null).flatMap((c) => board.sight[c]);
        useFx.setState({ hint: { cells, camera: e.seeing[0] } });
        setTimeout(() => sfx.yes(), all.length * 220 * speed());
      }
      toast(line!.text, e.seeing.length ? "bad" : "info", "📡");
      return 400 + all.length * 220;
    }
    case "powerOutDiscovered":
      sfx.powerDown();
      banner("LIGHTS OUT!", "alarm", "The power is cut: cameras and motion detectors are dead.");
      return 1500;
    case "motionAsked":
      sfx.cameraClick();
      return 300;
    case "motion":
      if (e.result === "answered") {
        flash({ kind: "colour", cells: board.walkable.filter((c) => (board.region[c] ? board.colours[board.region[c]!] : "grey") === e.colour), colour: e.colour }, 2200);
        toast(`Motion detectors: ${COLOUR_WORD(e.colour!)}`, "bad", "📶");
        sfx.yes();
        return 1400;
      }
      if (e.result === "snipped") {
        sfx.snip();
        toast(`✂ Motion detectors snipped (${e.snipsLeft} left)`, "info");
        return 900;
      }
      return 300;
    case "actionSkipped":
      return 0;
    case "captured":
      flash({ kind: "spot", cells: [e.cell] }, 2600);
      sfx.capture();
      setMusic("off");
      banner("NABBED!", iAmThief ? "alarm" : "mint", `${pawnName(game, e.pawn)} makes the arrest${e.wasHidden ? " in the dark" : ""}!`);
      return 2400;
    case "escaped":
      sfx.escape();
      setMusic("off");
      banner("ESCAPED!", iAmThief ? "gold" : "alarm", `…with ${e.paintings} painting${e.paintings === 1 ? "" : "s"}`);
      return 2400;
    case "dawn":
      sfx.powerUp();
      setMusic("off");
      banner("DAWN BREAKS", iAmThief ? "alarm" : "mint", "The museum opens: the thief is trapped inside.");
      return 2200;
    case "roundOver":
      useFx.setState({ showResult: true });
      return 0;
    case "locksPlaced":
    case "locksShuffled":
      return 0;
  }
  return 0;
}

function cameraCell(ctx: Ctx, n: number): Cell | null {
  const cam = ctx.game.cameras.find((c) => c.n === n);
  if (cam) return cam.cell;
  // Removed cameras aren't in the view any more: find them in the layout at play start.
  const start = ctx.game.events.find((e) => e.type === "playStarted");
  return start && start.type === "playStarted" ? (start.cameras[n] ?? null) : null;
}
