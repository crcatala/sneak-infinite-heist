// Event presentation: every new event in the viewer's log becomes a log line, and plays one at a
// time as sound, toast, banner and scene effect. Cinematics are short and skippable (click / Space /
// Esc), hold Space to fast-forward, reduced motion shortens everything, and the debug slow-motion
// switch stretches them 6×. Hidden information never animates: the log only contains what the
// viewer is allowed to see, so there's nothing hidden to play.

import { create } from "zustand";
import { COLOUR_LABEL, colourOf, getBoard, type Cell, type FloorColour } from "../../shared/board/model";
import { ARTWORKS } from "../../shared/characters";
import type { GameEvent } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { reducedMotion } from "../prefs";
import { setMusic, sfx } from "../sfx";
import { useStore } from "../store";
import { cellLabel, pawnHex, pawnName, playerName, slotLabel } from "./derive";

export type Tone = "info" | "good" | "bad" | "secret" | "alarm";

/**
 * One piece of a log sentence. Plain strings are prose; the rest are the nouns worth a glance, styled
 * by the case notes (the thief, a detective in their colour, a room in its floor colour, a number,
 * a painting, an action die face, a verdict).
 */
export type Part = string | { k: "thief" | "det" | "place" | "num" | "art" | "act" | "res"; t: string; hex?: string; colour?: FloorColour; tone?: Tone };

/** What sort of thing happened: the case notes colour each kind's icon badge from CSS (`data-kind`). */
export type LogKind = "setup" | "sneak" | "steal" | "sabotage" | "power" | "lock" | "roll" | "move" | "eye" | "camera" | "scan" | "motion" | "spotted" | "capture" | "escape" | "dawn" | "start" | "idle";

export interface LogLine {
  seq: number;
  /** Epoch ms the event happened (server clock), for the "2m ago" stamp. */
  at: number;
  /** Name of an icon in components/Icon.tsx. */
  icon: string;
  kind: LogKind;
  parts: Part[];
  /** The sentence without styling (screen readers, announcements). */
  text: string;
  tone: Tone;
  /** Only the thief could see this (shown with a lock in the log). */
  secret: boolean;
  /** Thief turn this happened in. */
  turn: number;
  /** The detective pawn whose turn it was (null for the thief's own lines and setup). */
  pawn: string | null;
  /** The acting detective's colour, when there is one. */
  hex?: string;
}

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: "gold" | "alarm" | "mint" | "moon";
}

/**
 * The "last big thing that happened" card: shown large for a few seconds when it happens, then it
 * glides up beside the turn bar and stays there until the next one.
 */
export interface Announcement {
  id: number;
  icon: string;
  kind: LogKind;
  title: string;
  sub?: string;
  tone: Tone;
  /** The acting detective's colour, when there is one. */
  hex?: string;
  /** Large in the middle of the screen first? Events with their own banner skip straight to the dock. */
  hero: boolean;
  stage: "hero" | "docked";
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
  announce: Announcement | null;
  flashes: Flash[];
  /** The detective's roll for the turn in progress: it stays up (docked beside the turn bar) until the turn ends. */
  dice: DiceRoll | null;
  /** The dice have moved out of the middle of the board into the dock. */
  diceDocked: boolean;
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
  announce: null,
  flashes: [],
  dice: null,
  diceDocked: false,
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

const plain = (parts: Part[]) => parts.map((p) => (typeof p === "string" ? p : p.t)).join("");
const ACTION_WORD = { eye: "an Eye", scan: "Scan", motion: "Motion" } as const;
const ACTION_NAME = { eye: "Eye", scan: "Scan", motion: "Motion" } as const;
const s = (n: number) => (n === 1 ? "" : "s");

/** Log line for an event, from the viewer's point of view. */
export function describe(e: GameEvent, ctx: Ctx): LogLine | null {
  const { game, view } = ctx;
  const board = getBoard(game.board);
  const thiefName = playerName(view, game.thief.controller);
  const iAmThief = view.role === "thief";

  const det = (pawn: string): Part => ({ k: "det", t: pawnName(game, pawn), hex: pawnHex(game, pawn) });
  const thief = (t = "The thief"): Part => ({ k: "thief", t });
  const num = (n: number | string): Part => ({ k: "num", t: String(n) });
  const spaces = (n: number): Part[] => [num(n), ` space${s(n)}`];
  const place = (cell: number): Part => ({ k: "place", t: cellLabel(board, cell), colour: colourOf(board, cell) });
  const slot = (id: string): Part => ({ k: "place", t: slotLabel(board, id), colour: board.slotById[id] ? colourOf(board, board.slotById[id].inside) : "grey" });
  const art = (id: number): Part => ({ k: "art", t: `"${ARTWORKS[id].title}"` });
  const res = (t: string, tone: Tone = "info"): Part => ({ k: "res", t, tone });
  const cam = (n: number): Part => ({ k: "num", t: `camera ${n}` });
  const cams = (ns: number[]): Part => ({ k: "num", t: `camera${s(ns.length)} ${ns.join(", ")}` });
  const line = (kind: LogKind, icon: string, parts: Part[], tone: Tone = "info", hex?: string): LogLine => ({
    seq: e.seq,
    at: e.at,
    icon,
    kind,
    parts,
    text: plain(parts),
    tone,
    secret: e.vis === "thief",
    turn: 0,
    pawn: null,
    hex,
  });
  const as = (pawn: string) => pawnHex(game, pawn);

  switch (e.type) {
    case "phase":
      return e.phase === "setupPaintings"
        ? line("setup", "frame", ["The detectives hang the paintings."])
        : e.phase === "setupCameras"
          ? line("setup", "camera", ["The detectives install the cameras."])
          : e.phase === "setupDetectives"
            ? line("setup", "badge", ["The detectives take their posts."])
            : e.phase === "setupLocks"
              ? line("setup", "lock", ["The detectives set the locks."])
              : null;
    case "locksShuffled":
      return line("lock", "shuffle", ["The locks are shuffled face down."]);
    case "locksPlaced":
      return line("lock", "lock", ["Locks placed: you know which exits are open."], "secret");
    case "playStarted":
      return line("start", "moon", ["Lights out. The heist begins!"], "good");
    case "thiefTurn":
      return null;
    case "thiefMoved":
      if (e.vis === "thief") return line("sneak", "footprints", e.entry ? ["You slipped in through the ", slot(e.entry), " and crept ", ...spaces(e.path!.length), "."] : ["You crept ", ...spaces(e.path!.length), "."], "secret");
      if (e.path) return line("sneak", "footprints", [thief(thiefName), ", the thief, dashed ", ...spaces(e.path.length), " in plain sight."], "alarm");
      return line("sneak", "footprints", [thief(), e.turn === 1 ? " slipped inside…" : " moved."]);
    case "paintingVanished":
      return line("steal", "steal", [art(e.painting), " vanished from the ", place(e.cell), "!"], "bad");
    case "paintingStolen":
      if (e.pending) return line("steal", "steal", ["You marked ", art(e.painting), ". It leaves the wall at the start of your next turn."], "secret");
      return line("steal", "steal", [thief(), " grabbed ", art(e.painting), e.onReveal ? " as the lights hit them" : "", "!"], "bad");
    case "cameraDisabled":
      return line("sabotage", "camera", ["You disabled ", cam(e.n), ". Nobody knows… yet."], "secret");
    case "powerCut":
      return line("power", "boltOff", ["You cut the power. Cameras and motion detectors are dead until someone finds out."], "secret");
    case "lockTried":
      return e.face === "open"
        ? line("lock", "unlock", ["The ", slot(e.slot), " is ", res("OPEN", "alarm"), "!"], "alarm")
        : line("lock", "lock", ["Someone rattled the ", slot(e.slot), ": ", res("LOCKED", "info"), ". The thief was right there!"], "info");
    case "detectiveTurn":
      return null;
    case "rolled":
      return line("roll", "dice", [det(e.pawn), " rolled ", num(e.move), " and ", { k: "act", t: ACTION_WORD[e.action] }], "info", as(e.pawn));
    case "boxedIn":
      return line("move", "block", [det(e.pawn), " is boxed in and can't move."], "info", as(e.pawn));
    case "detectiveMoved":
      return line("move", "footprints", [det(e.pawn), " moved ", ...spaces(e.path.length), " to the ", place(e.to), "."], "info", as(e.pawn));
    case "powerRestored":
      return e.silent
        ? line("power", "bulb", [det(e.pawn), " stepped on the switch and quietly restored your power cut."], "secret", as(e.pawn))
        : line("power", "bulb", [det(e.pawn), " flipped the switch: the lights are ", res("back on", "good"), "!"], "good", as(e.pawn));
    case "eye":
      return e.seen
        ? line("eye", "eye", [det(e.pawn), " looked around… and ", res("SAW THE THIEF!", "alarm")], "alarm", as(e.pawn))
        : line("eye", "eye", [det(e.pawn), " looked around: ", res("nothing", "info"), "."], "info", as(e.pawn));
    case "thiefRevealed":
      return line("spotted", "siren", iAmThief ? ["You've been ", res("spotted", "alarm"), "! Everyone can see you now."] : ["The thief is ", res("revealed", "alarm"), "! Chase them down!"], "alarm");
    case "camera":
      return e.result === "sees"
        ? line("camera", "camera", [det(e.pawn), " checked ", cam(e.n), ": ", res("it sees the thief!", "alarm")], "alarm", as(e.pawn))
        : e.result === "clear"
          ? line("camera", "camera", [det(e.pawn), " checked ", cam(e.n), ": ", res("no sign of the thief", "info"), "."], "info", as(e.pawn))
          : e.result === "dead"
            ? line("camera", "burst", [det(e.pawn), " checked ", cam(e.n), ": ", res("sabotaged!", "bad"), " It's taken away."], "bad", as(e.pawn))
            : line("camera", "camera", [det(e.pawn), " tried ", cam(e.n), "…"], "info", as(e.pawn));
    case "scan": {
      if (e.result === "powerOut") return line("scan", "scan", [det(e.pawn), " tried a scan…"], "info", as(e.pawn));
      const parts: Part[] = [det(e.pawn), " scanned the cameras: "];
      if (e.removed.length) parts.push(cams(e.removed), ` found `, res("dead", "bad"), " and removed. ");
      if (e.seeing.length) parts.push(cams(e.seeing), ` see${e.seeing.length > 1 ? "" : "s"} the thief!`);
      else parts.push("no camera sees the thief.");
      return line("scan", "scan", parts, e.seeing.length ? "alarm" : e.removed.length ? "bad" : "info", as(e.pawn));
    }
    case "powerOutDiscovered":
      return line("power", "boltOff", ["The ", res("power is out", "bad"), "! Cameras and motion detectors are dead."], "bad");
    case "motionAsked":
      return line("motion", "motion", [det(e.pawn), " triggered the motion detectors…"], "info", as(e.pawn));
    case "motion":
      return e.result === "answered"
        ? line("motion", "motion", ["Motion detectors: the thief is on ", { k: "place", t: COLOUR_WORD(e.colour!), colour: e.colour }, "."], "alarm")
        : e.result === "snipped"
          ? line("motion", "scissors", [thief(), " ", res("snipped", "bad"), " the motion detectors (", num(e.snipsLeft), ` snip${s(e.snipsLeft)} left).`], "bad")
          : line("motion", "motion", [det(e.pawn), " tried the motion detectors…"], "info", as(e.pawn));
    case "actionSkipped":
      return line("idle", "zzz", [det(e.pawn), " skipped their action."], "info", as(e.pawn));
    case "captured":
      return line("capture", "handcuffs", [det(e.pawn), " ", res("NABBED", e.vis === "all" && iAmThief ? "bad" : "good"), ` the thief${e.wasHidden ? " in the dark" : ""}!`], e.vis === "all" && iAmThief ? "bad" : "good", as(e.pawn));
    case "escaped":
      return line("escape", "escape", [thief(), " ", res("ESCAPED", iAmThief ? "good" : "bad"), " through the ", slot(e.slot), " with ", num(e.paintings), ` painting${s(e.paintings)}!`], iAmThief ? "good" : "bad");
    case "dawn":
      return line("dawn", "sunrise", ["Dawn breaks and the museum opens. The thief is trapped!"], iAmThief ? "bad" : "good");
    case "roundOver":
      return null;
  }
}

/** Builds the full log with thief-turn numbers and the detective whose turn each line belongs to. */
export function buildLog(ctx: Ctx): LogLine[] {
  const out: LogLine[] = [];
  const events = ctx.game.events;
  let turn = 0;
  let pawn: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "thiefTurn") {
      turn = e.turn;
      pawn = null;
    }
    if (e.type === "detectiveTurn") pawn = e.pawn;
    const l = describe(e, ctx);
    if (!l) continue;
    // Paintings vanish just before the thief's turn is announced: they belong to that turn.
    const next = events[i + 1];
    const lead = e.type === "paintingVanished" && next?.type === "thiefTurn";
    out.push(lead ? { ...l, turn: next.turn, pawn: null } : { ...l, turn, pawn });
  }
  return out;
}

// --- announcements ------------------------------------------------------------------------------

/** Events with their own full-width banner: their announcement goes straight to the dock. */
const BANNERED = new Set(["playStarted", "powerOutDiscovered", "thiefRevealed", "captured", "escaped", "dawn"]);

/** The headline for a big move, or null for events that aren't worth one (bookkeeping, setup). */
export function announceOf(e: GameEvent, ctx: Ctx): Omit<Announcement, "id" | "stage"> | null {
  const { game, view } = ctx;
  const board = getBoard(game.board);
  const iAmThief = view.role === "thief";
  const who = (pawn: string) => pawnName(game, pawn);
  const hex = (pawn: string) => pawnHex(game, pawn);
  const n = (k: number, word: string) => `${k} ${word}${s(k)}`;
  const a = (kind: LogKind, icon: string, title: string, sub: string | undefined, tone: Tone, extra: { hex?: string; hero?: boolean } = {}) => ({
    kind,
    icon,
    title,
    sub,
    tone,
    hex: extra.hex,
    hero: extra.hero ?? !BANNERED.has(e.type),
  });

  switch (e.type) {
    case "playStarted":
      return a("start", "moon", "Lights out!", iAmThief ? "Pick a window or door to sneak in through." : "The thief is somewhere outside…", "good");
    case "thiefMoved":
      if (e.vis === "thief") return a("sneak", "footprints", `You crept ${n(e.path!.length, "space")}`, e.entry ? `Slipped in through the ${slotLabel(board, e.entry)}` : "Nobody saw a thing.", "secret");
      if (e.path) return a("sneak", "footprints", `The thief dashed ${n(e.path.length, "space")}`, "In plain sight!", "alarm");
      return a("sneak", "footprints", e.turn === 1 ? "The thief slipped inside…" : "The thief moved", "Somewhere in the dark.", "info");
    case "paintingVanished":
      return a("steal", "steal", "Painting stolen!", `"${ARTWORKS[e.painting].title}" from the ${cellLabel(board, e.cell)}`, "bad");
    case "paintingStolen":
      return e.pending
        ? a("steal", "steal", "Painting marked", `"${ARTWORKS[e.painting].title}" leaves the wall next turn`, "secret")
        : a("steal", "steal", "Painting stolen!", `"${ARTWORKS[e.painting].title}" from the ${cellLabel(board, e.cell)}`, "bad");
    case "cameraDisabled":
      return a("sabotage", "camera", `Camera ${e.n} disabled`, "Secret until someone checks it.", "secret");
    case "powerCut":
      return a("power", "boltOff", "Power cut", "Cameras and motion detectors are dead (secret).", "secret");
    case "lockTried":
      return e.face === "open"
        ? a("lock", "unlock", "Lock is OPEN!", `The ${slotLabel(board, e.slot)}`, "alarm")
        : a("lock", "lock", "Locked!", `The ${slotLabel(board, e.slot)}: the thief was right there.`, "info");
    case "rolled":
      return a("roll", "dice", `${who(e.pawn)} rolled`, `Move up to ${e.move} · ${ACTION_NAME[e.action]} action`, "info", { hex: hex(e.pawn) });
    case "boxedIn":
      return a("move", "block", `${who(e.pawn)} is boxed in`, "No room to move this turn.", "info", { hex: hex(e.pawn) });
    case "detectiveMoved":
      return a("move", "footprints", `${who(e.pawn)} moved`, `${n(e.path.length, "space")} to the ${cellLabel(board, e.to)}`, "info", { hex: hex(e.pawn) });
    case "powerRestored":
      return e.silent
        ? a("power", "bulb", "Power quietly restored", `${who(e.pawn)} stepped on the switch.`, "secret", { hex: hex(e.pawn) })
        : a("power", "bulb", "Lights back on!", `${who(e.pawn)} flipped the switch.`, "good", { hex: hex(e.pawn), hero: false });
    case "eye":
      return e.seen
        ? a("eye", "eye", `${who(e.pawn)} saw the thief!`, "Looked around with their own eyes.", "alarm", { hex: hex(e.pawn) })
        : a("eye", "eye", `${who(e.pawn)} looked around`, "Nothing in sight.", "info", { hex: hex(e.pawn) });
    case "thiefRevealed":
      return a("spotted", "siren", "Thief revealed!", iAmThief ? "You've been spotted: run for an exit!" : "Chase them down!", "alarm");
    case "camera":
      return e.result === "sees"
        ? a("camera", "camera", `Camera ${e.n} sees the thief!`, `${who(e.pawn)} checked it.`, "alarm", { hex: hex(e.pawn) })
        : e.result === "clear"
          ? a("camera", "camera", `Camera ${e.n}: all clear`, `${who(e.pawn)} checked it.`, "info", { hex: hex(e.pawn) })
          : e.result === "dead"
            ? a("camera", "burst", `Camera ${e.n} was sabotaged!`, "It's taken off the board.", "bad", { hex: hex(e.pawn) })
            : a("camera", "camera", `${who(e.pawn)} tried camera ${e.n}`, "No response…", "info", { hex: hex(e.pawn) });
    case "scan":
      if (e.result === "powerOut") return a("scan", "scan", `${who(e.pawn)} tried a scan`, "No response…", "info", { hex: hex(e.pawn) });
      return a(
        "scan",
        "scan",
        e.seeing.length ? `Scan: ${e.seeing.length > 1 ? "cameras" : "camera"} ${e.seeing.join(", ")} see${e.seeing.length > 1 ? "" : "s"} the thief!` : "Scan: nothing seen",
        e.removed.length ? `${e.removed.length > 1 ? "Cameras" : "Camera"} ${e.removed.join(", ")} found dead and removed.` : `${who(e.pawn)} checked every camera.`,
        e.seeing.length ? "alarm" : e.removed.length ? "bad" : "info",
        { hex: hex(e.pawn) },
      );
    case "powerOutDiscovered":
      return a("power", "boltOff", "The power is out!", "Cameras and motion detectors are dead.", "bad");
    case "motionAsked":
      return a("motion", "motion", `${who(e.pawn)} triggered the motion detectors`, "Waiting for the thief to answer…", "info", { hex: hex(e.pawn) });
    case "motion":
      return e.result === "answered"
        ? a("motion", "motion", `Motion detectors: ${COLOUR_WORD(e.colour!)}`, `The thief is standing on a ${COLOUR_LABEL[e.colour!].toLowerCase()} floor.`, "alarm")
        : e.result === "snipped"
          ? a("motion", "scissors", "Wires snipped!", `The thief cut the motion detectors (${e.snipsLeft} snip${s(e.snipsLeft)} left).`, "bad")
          : a("motion", "motion", `${who(e.pawn)} tried the motion detectors`, "No response…", "info", { hex: hex(e.pawn) });
    case "captured":
      return a("capture", "handcuffs", `${who(e.pawn)} nabbed the thief!`, e.wasHidden ? "Caught in the dark." : undefined, iAmThief ? "bad" : "good", { hex: hex(e.pawn) });
    case "escaped":
      return a("escape", "escape", "The thief escaped!", `With ${n(e.paintings, "painting")}.`, iAmThief ? "good" : "bad");
    case "dawn":
      return a("dawn", "sunrise", "Dawn breaks", "The museum opens: the thief is trapped.", iAmThief ? "bad" : "good");
    default:
      return null;
  }
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

/** Skips the event currently playing (and its banner), and docks the announcement. */
export function skipFx() {
  dockAnnouncement();
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
  clearTimeout(dockTimer);
  useFx.setState({ banner: null, announce: null, flashes: [], dice: null, diceDocked: false, hint: null, lifting: null, flipping: null, playing: false, showResult: false });
}

/** Feed the latest view: new events are queued and played in order. */
export function ingest(ctx: Ctx) {
  const events = ctx.game.events;
  if (lastSeq < 0) {
    // First look at this game: don't replay history, just show the state.
    lastSeq = events.length ? events[events.length - 1].seq : 0;
    useFx.setState({ showResult: ctx.game.phase === "roundOver" });
    seedFromHistory(ctx);
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
  // The banner is the headline now: tuck any announcement out of its way.
  dockAnnouncement();
  useFx.setState({ banner: { id: bannerOf, text, sub, tone } });
}

// --- announcements and dice -----------------------------------------------------------------------

const HERO_MS = 3000;
let dockTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a headline large for a few seconds, then docks it. Pass `heroMs` to shorten the big moment. */
function announce(a: Omit<Announcement, "id" | "stage">, heroMs = HERO_MS) {
  clearTimeout(dockTimer);
  useFx.setState({ announce: { ...a, id: nextId++, stage: a.hero ? "hero" : "docked" } });
  if (a.hero) dockTimer = setTimeout(dockAnnouncement, heroMs * speed());
}

/** Glides the current announcement (and the dice, if they're out) to the dock. */
export function dockAnnouncement() {
  clearTimeout(dockTimer);
  const { announce: a, dice } = useFx.getState();
  if (a?.stage === "hero") useFx.setState({ announce: { ...a, stage: "docked" } });
  if (dice && !useFx.getState().diceDocked) useFx.setState({ diceDocked: true });
}

/** After a reload or a late join: restore the dock (last big move, and this turn's dice) without playing anything. */
function seedFromHistory(ctx: Ctx) {
  const { game } = ctx;
  for (let i = game.events.length - 1; i >= 0; i--) {
    const a = announceOf(game.events[i], ctx);
    if (a) {
      useFx.setState({ announce: { ...a, id: nextId++, stage: "docked" } });
      break;
    }
  }
  const t = game.turn;
  if (game.phase === "play" && t.kind === "detective" && t.roll) {
    useFx.setState({ dice: { id: nextId++, move: t.roll.move, action: t.roll.action, pawn: t.pawn, until: 0 }, diceDocked: true });
  }
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
  const iAmThief = view.role === "thief";
  const myTurnPawn = (pawn: string) => game.detectives.find((d) => d.id === pawn)?.controller === view.you;

  const headline = announceOf(e, ctx);
  if (headline && e.type !== "rolled") announce(headline);

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
      // A new round of turns: last turn's dice are done with.
      useFx.setState({ dice: null, diceDocked: false });
      if (iAmThief) sfx.turnChime();
      return 0;
    case "detectiveTurn":
      useFx.setState({ dice: null, diceDocked: false });
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
      return 1100;
    case "paintingStolen":
      if (e.pending) {
        sfx.lift();
        return 500;
      }
      useFx.setState({ lifting: { painting: e.painting, cell: e.cell, until: performance.now() + 1100 * speed() } });
      sfx.steal();
      return 1000;
    case "cameraDisabled":
      sfx.cameraClick();
      return 500;
    case "powerCut":
      sfx.powerDown();
      return 900;
    case "lockTried":
      useFx.setState({ flipping: { slot: e.slot, until: performance.now() + 1000 * speed() } });
      sfx.lockClunk();
      if (e.face === "open") setTimeout(() => sfx.lockOpen(), 500 * speed());
      flash({ kind: "ping", cells: [e.cell] }, 2000);
      return 1200;
    case "rolled":
      // The dice tumble in the middle of the board, then dock with the headline and stay for the turn.
      useFx.setState({ dice: { id: nextId++, move: e.move, action: e.action, pawn: e.pawn, until: performance.now() + 1100 * speed() }, diceDocked: false });
      announce(headline!, 2400);
      sfx.dice();
      return 1100;
    case "boxedIn":
      return 600;
    case "detectiveMoved":
      e.path.forEach((_, i) => setTimeout(() => sfx.step(i), i * 170 * speed()));
      return 150 + e.path.length * 170;
    case "powerRestored":
      if (e.silent) return 600;
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
      } else if (e.result === "clear" && cam !== null) {
        flash({ kind: "sightMiss", cells: board.sight[cam], source: e.n }, 1000);
        setTimeout(() => sfx.no(), 300 * speed());
      } else if (e.result === "dead" && cam !== null) {
        flash({ kind: "spark", cells: [cam] }, 1200);
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
        sfx.yes();
        return 1400;
      }
      if (e.result === "snipped") {
        sfx.snip();
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
      useFx.setState({ showResult: true, dice: null, diceDocked: false });
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
