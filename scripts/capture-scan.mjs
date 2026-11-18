// Plays capture-mode solo games in Node, to find a seed worth filming (see src/client/capture.ts).
//
//   node scripts/capture-scan.mjs [--seeds 1-200] [--role thief|detectives] [--n 3] [--skill pro|rookie]
//       One line per seed: how the round ended, how long it took, and what happened in it. A round
//       still going after --max-turns thief turns (150) is "unfinished": dawn is off by default.
//   node scripts/capture-scan.mjs --seed 7 [--role ...] [--n ...] [--skill ...]
//       That seed's timeline: every notable event, at its time on the room's clock (ms since the room
//       opened), which is what window.__sneak.roomTime() reports in the browser.
//
// The room is set up by the same code as the browser's (src/client/soloRoom.ts), with bots on every
// seat (watch), so /solo?seed=7&watch&role=... plays exactly this game at exactly these times.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const role = arg("role", "thief") === "detectives" ? "detectives" : "thief";
const n = Number(arg("n", role === "thief" ? 3 : 0));
const skill = arg("skill", null);
const one = arg("seed", null);
const maxTurns = Number(arg("max-turns", 150));
const [lo, hi] = (arg("seeds", "1-100") ?? "").split("-").map(Number);

// Vite loads the shared engine and the solo set-up (TypeScript, imports without extensions) for Node.
const { module: solo } = await runnerImport(path.join(root, "src/client/soloRoom.ts"), { configFile: false, logLevel: "error" });
const { createSoloRoom } = solo;

/** One game with bots on every seat, played to its end on a simulated clock. */
function play(seed) {
  let t = 1_000_000;
  const capture = { seed, watch: true, start: true, turn: null, end: false, as: null, clean: false, hud: true, skill: skill === "rookie" || skill === "pro" ? skill : null };
  const { room, now } = createSoloRoom({ role, bots: n }, "You", capture, () => t);
  const t0 = room.state.createdAt;
  const log = [];
  let seen = 0;
  const collect = () => {
    const events = room.state.game?.events ?? [];
    for (; seen < events.length; seen++) log.push({ at: now() - t0, e: events[seen] });
  };
  collect();
  for (let guard = 0; guard < 10_000 && room.state.game?.phase !== "roundOver" && (room.state.game?.thief.turns ?? 0) <= maxTurns; guard++) {
    const at = room.nextAlarm();
    if (at === null) break;
    t = Math.max(t, at);
    room.tick();
    collect();
  }
  return { game: room.state.game, log };
}

const ROOM = (cell) => `cell ${cell}`;
function describe(e) {
  switch (e.type) {
    case "phase": return `phase: ${e.phase}`;
    case "playStarted": return "play starts";
    case "thiefTurn": return `thief turn ${e.turn}`;
    case "thiefMoved": return `thief moves${e.entry ? ` in through ${e.entry}` : ""}${e.path ? ` ${e.path.length}` : ""}`;
    case "paintingStolen": return `painting ${e.painting} stolen${e.pending ? " (hidden)" : ""}`;
    case "paintingVanished": return `painting ${e.painting} found missing`;
    case "cameraDisabled": return `camera ${e.n} disabled`;
    case "powerCut": return "POWER CUT";
    case "powerRestored": return `power restored by ${e.pawn}`;
    case "lockTried": return `thief tries lock ${e.slot} (${e.face})`;
    case "rolled": return `${e.pawn} rolls ${e.move} + ${e.action}`;
    case "detectiveMoved": return `${e.pawn} moves ${e.path.length}`;
    case "eye": return `${e.pawn} eye: ${e.seen ? "SEES THE THIEF" : "nothing"}`;
    case "thiefRevealed": return `THIEF REVEALED at ${ROOM(e.cell)} by ${e.by}`;
    case "camera": return `${e.pawn} checks camera ${e.n}: ${e.result}`;
    case "scan": return `${e.pawn} scans cameras: ${e.result}${e.seeing.length ? ` (seeing ${e.seeing.join(",")})` : ""}`;
    case "motion": return `${e.pawn} motion: ${e.result}${e.colour ? ` ${e.colour}` : ""}`;
    case "captured": return `CAPTURED by ${e.pawn}${e.wasHidden ? " (while hidden)" : ""}`;
    case "escaped": return `ESCAPED through ${e.slot} with ${e.paintings}`;
    case "dawn": return "DAWN";
    case "roundOver": return `round over: ${e.result.winner} (${e.result.reason})`;
    default: return null;
  }
}

const secs = (ms) => (ms / 1000).toFixed(1).padStart(6);
if (one !== null) {
  const { game, log } = play(Number(one));
  for (const { at, e } of log) {
    const text = describe(e);
    if (text && e.type !== "phase") console.log(`${secs(at)} s  ${text}`);
  }
  console.log(game.result ? `\n${game.result.winner} (${game.result.reason}), ${game.thief.turns} thief turns` : `\nunfinished after ${game.thief.turns} thief turns`);
} else {
  console.log("seed  result               turns  paintings  seen  power  cams  play starts  ends");
  for (let seed = lo; seed <= (hi || lo); seed++) {
    const { game, log } = play(seed);
    const count = (type, f = () => true) => log.filter(({ e }) => e.type === type && f(e)).length;
    const at = (type) => log.find(({ e }) => e.type === type)?.at;
    const r = game.result;
    const result = r ? `${r.winner} ${r.reason}`.padEnd(20) : "unfinished".padEnd(20);
    const power = at("powerCut") !== undefined ? `${secs(at("powerCut")).trim()}s` : "-";
    console.log(
      `${String(seed).padStart(4)}  ${result} ${String(game.thief.turns).padStart(5)}  ${String(r?.paintings ?? "-").padStart(9)}  ${String(count("thiefRevealed")).padStart(4)}  ${power.padStart(5)}  ${String(count("cameraDisabled")).padStart(4)}  ${secs(at("playStarted") ?? 0)} s  ${secs(log.at(-1)?.at ?? 0)} s`,
    );
  }
}
