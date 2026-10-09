// Turns raw music exports into the level-matched MP3s the game ships in public/audio/music.
//
//   node scripts/normalize-music.mjs <dir-with-source-audio>
//
// For each track: trim the near-silent head and tail (so a crossfaded loop never waits on a quiet
// tail), measure integrated loudness (EBU R128), apply the gain that lands on the track's target,
// catch strays with a limiter, and encode a VBR MP3. Needs ffmpeg on the PATH (or set FFMPEG).
// Source files are matched by name, ignoring case and extension.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const OUT = resolve("public/audio/music");

// Integrated loudness targets (LUFS). Loops that play for long stretches sit lower than the title
// and the chase. The music bus in src/client/sfx.ts then sets the level against the sound effects.
const TRACKS = [
  { src: "title", id: "title", lufs: -17 },
  { src: "lobby", id: "lobby", lufs: -19 },
  { src: "calm-sneaking-loop", id: "calm", lufs: -20 },
  { src: "lights-out", id: "lights-out", lufs: -20 },
  { src: "chase", id: "chase", lufs: -17 },
  { src: "results-screen-victory", id: "results", lufs: -19 },
  { src: "captured", id: "captured", lufs: -17 },
  { src: "escaped", id: "escaped", lufs: -17 },
  { src: "museum-opens", id: "museum-opens", lufs: -17 },
];

/** Sample-peak ceiling after gain, leaving room for MP3 overshoot (-1.5 dBFS). */
const CEILING = 0.84;

const TRIM = "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,areverse";

function run(args) {
  const r = spawnSync(FFMPEG, ["-nostats", "-hide_banner", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${r.stderr}`);
  return r.stderr; // ffmpeg prints its reports on stderr
}

/** Integrated loudness (LUFS) and sample peak (dBFS) of `input` after the `filters` prefix. */
function loudness(input, filters = "") {
  const report = run(["-i", input, "-af", `${filters}ebur128=peak=true`, "-f", "null", "-"]);
  const summary = report.slice(report.lastIndexOf("Summary:"));
  const lufs = Number(/^\s+I:\s+(-?[\d.]+) LUFS/m.exec(summary)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs)) throw new Error(`could not read the loudness of ${input}`);
  return { lufs, peak };
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/normalize-music.mjs <dir-with-source-audio>");
  process.exit(1);
}
const sources = new Map(readdirSync(dir).map((f) => [basename(f, extname(f)).toLowerCase(), join(dir, f)]));
mkdirSync(OUT, { recursive: true });

const rows = [];
for (const t of TRACKS) {
  const input = sources.get(t.src.toLowerCase());
  if (!input) {
    console.error(`missing source for "${t.src}" in ${dir}`);
    process.exitCode = 1;
    continue;
  }
  const before = loudness(input, `${TRIM},`);
  const gain = t.lufs - before.lufs;
  const output = join(OUT, `${t.id}.mp3`);
  run(["-i", input, "-af", `${TRIM},volume=${gain.toFixed(2)}dB,alimiter=limit=${CEILING}:level=0`, "-map_metadata", "-1", "-write_id3v2", "0", "-c:a", "libmp3lame", "-q:a", "4", output]);
  const after = loudness(output);
  rows.push({ track: t.id, was: before.lufs, gain: +gain.toFixed(2), now: after.lufs, target: t.lufs, peak: after.peak });
}
console.table(rows);
