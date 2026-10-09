// What the log and the announcements say about each event, from the viewer's point of view. Pure
// functions over the viewer's own GameView (no browser, store or audio imports), so they can be unit
// tested and so hidden information can't leak: they only ever see events the viewer is allowed to see.

import { COLOUR_LABEL, colourOf, getBoard, type FloorColour } from "../../shared/board/model";
import { ARTWORKS } from "../../shared/characters";
import type { GameEvent } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
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


/** The most recent event worth a headline (docked, not played): what the dock shows after a reload or late join. */
export function lastAnnouncement(ctx: Ctx): Omit<Announcement, "id" | "stage"> | null {
  for (let i = ctx.game.events.length - 1; i >= 0; i--) {
    const a = announceOf(ctx.game.events[i], ctx);
    if (a) return a;
  }
  return null;
}

/** This turn's dice, if a detective has rolled: restored (already at rest) after a reload or late join. */
export function restoredRoll(game: GameView): { move: number; action: "eye" | "scan" | "motion"; pawn: string } | null {
  const t = game.turn;
  return game.phase === "play" && t.kind === "detective" && t.roll ? { move: t.roll.move, action: t.roll.action, pawn: t.pawn } : null;
}

/** "just now", "42s ago", "3m ago", "2h ago". */
export function relativeTime(at: number, now: number): string {
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return hr < 24 ? `${hr}h ago` : `${Math.floor(hr / 24)}d ago`;
}
