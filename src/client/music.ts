// Music: the tracks in public/audio/music, streamed through <audio> elements into the music bus.
// A decoded two-minute stereo track would cost tens of MB of RAM, so only the short stingers are
// decoded. Switching tracks crossfades, and a long track loops by crossfading its tail into its
// own start (the tracks end in a fade-out rather than on a loop point).
//
// The module has no audio context of its own: sfx.ts creates it on the first user gesture and
// hands it over through attachMusic(). A mode requested before that is remembered and starts then.

export type MusicMode = "off" | "title" | "lobby" | "calm" | "lights-out" | "chase" | "results";
export type Stinger = "captured" | "escaped" | "museum-opens";

type Playing = Exclude<MusicMode, "off">;

const src = (id: string) => `${import.meta.env.BASE_URL}audio/music/${id}.mp3`;

/** Seconds a looping track spends crossfading its tail into its start. */
const LOOP_FADE = 2.5;
/** Seconds to fade between modes: the chase has to land with its banner. */
const SWITCH_FADE = 1.4;
const CHASE_FADE = 0.4;
const OFF_FADE = 0.5;
/** A stinger asked for before it finished decoding is dropped after this long. */
const STINGER_WAIT_MS = 1500;

interface Voice {
  mode: Playing;
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
  /** Already handed over to its successor or told to fade out. */
  retired: boolean;
}

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let wanted: MusicMode = "off";
let current: Voice | null = null;
const voices = new Set<Voice>();
let delayTimer: ReturnType<typeof setTimeout> | undefined;
let watchTimer: ReturnType<typeof setInterval> | undefined;

// --- stingers ----------------------------------------------------------------------------------

const STINGERS: Stinger[] = ["captured", "escaped", "museum-opens"];
const stingerData = new Map<Stinger, Promise<ArrayBuffer | null>>();
const stingerBuf = new Map<Stinger, Promise<AudioBuffer | null>>();
const stingerFailed = new Set<Stinger>();
// Fetch starts at import, as the effects do, so the files are in memory before the first round ends.
if (typeof window !== "undefined" && typeof fetch === "function") {
  for (const id of STINGERS) {
    stingerData.set(
      id,
      fetch(src(id))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    );
  }
}

function decodeStinger(c: AudioContext, id: Stinger): Promise<AudioBuffer | null> {
  let p = stingerBuf.get(id);
  if (!p) {
    p = (stingerData.get(id) ?? Promise.resolve(null))
      .then((data) => (data ? c.decodeAudioData(data) : null))
      .catch(() => null)
      .then((buf) => {
        if (!buf) stingerFailed.add(id);
        return buf;
      });
    stingerBuf.set(id, p);
  }
  return p;
}

/**
 * Plays a one-shot through the music bus. Returns false only when the clip is known to be
 * unavailable, so the caller can fall back to the synthesized sound.
 */
export function playStinger(id: Stinger): boolean {
  if (stingerFailed.has(id)) return false;
  if (!ctx || !bus) return true; // audio not unlocked: the fallback would be silent too
  const c = ctx;
  const at = performance.now();
  void decodeStinger(c, id).then((buf) => {
    if (!buf || !bus || performance.now() - at > STINGER_WAIT_MS) return;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(bus);
    s.start();
  });
  return true;
}

// --- tracks ------------------------------------------------------------------------------------

/** Ramps a gain to `to` over `secs` on an equal-power curve, from wherever it is now. */
function fade(g: GainNode, to: 0 | 1, secs: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const from = g.gain.value;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(from, t);
  if (secs <= 0 || from === to) {
    g.gain.setValueAtTime(to, t);
    return;
  }
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const x = i / steps;
    const k = to === 1 ? Math.sin((x * Math.PI) / 2) : 1 - Math.cos((x * Math.PI) / 2);
    g.gain.linearRampToValueAtTime(from + (to - from) * k, t + secs * x);
  }
}

function kill(v: Voice) {
  voices.delete(v);
  if (current === v) current = null;
  v.el.pause();
  v.el.removeAttribute("src");
  v.el.load();
  v.node.disconnect();
  v.gain.disconnect();
}

function retire(v: Voice, secs: number) {
  if (v.retired) return;
  v.retired = true;
  fade(v.gain, 0, secs);
  setTimeout(() => kill(v), secs * 1000 + 150);
}

function start(mode: Playing, secs: number): Voice | null {
  if (!ctx || !bus) return null;
  const el = new Audio(src(mode));
  el.preload = "auto";
  const node = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  node.connect(gain).connect(bus);
  const v: Voice = { mode, el, node, gain, retired: false };
  voices.add(v);
  // Begin the fade when sound actually starts, not when the request goes out. A voice that was
  // retired while it was still loading must stay down, or it would fade up and then be cut off.
  el.addEventListener("playing", () => !v.retired && fade(gain, 1, secs), { once: true });
  el.addEventListener("error", () => kill(v), { once: true });
  // Safety net for a throttled tab that never saw the loop point.
  el.addEventListener("ended", () => handOver(v, 0.2), { once: true });
  el.play().catch(() => kill(v));
  watchTimer ??= setInterval(watch, 200);
  return v;
}

/** Starts the same track again underneath `v`, which fades away. */
function handOver(v: Voice, secs: number) {
  if (v.retired) return;
  const next = start(v.mode, secs);
  if (current === v) current = next;
  retire(v, secs);
}

function watch() {
  if (!voices.size) {
    clearInterval(watchTimer);
    watchTimer = undefined;
    return;
  }
  for (const v of voices) {
    const d = v.el.duration;
    if (!v.retired && Number.isFinite(d) && d > LOOP_FADE * 2 && v.el.currentTime >= d - LOOP_FADE) handOver(v, LOOP_FADE);
  }
}

function apply() {
  if (!ctx || ctx.state !== "running") return; // syncMusic() retries once the context runs
  const mode = wanted;
  if ((mode === "off" && !current) || (current && current.mode === mode && !current.retired)) return;
  const secs = mode === "chase" ? CHASE_FADE : mode === "off" ? OFF_FADE : SWITCH_FADE;
  for (const v of voices) retire(v, secs);
  current = mode === "off" ? null : start(mode, secs);
}

/** Hands over the audio context and the bus the music plays into. Called once, from a gesture. */
export function attachMusic(c: AudioContext, musicBus: GainNode) {
  ctx = c;
  bus = musicBus;
}

/** Starts whatever mode was asked for before the audio context was running. */
export function syncMusic() {
  apply();
}

/**
 * Switches the background music. `delay` (seconds) holds the change back, e.g. so a stinger can
 * finish first; any later call cancels a pending one.
 */
export function setMusic(next: MusicMode, delay = 0) {
  if (next === wanted && !delayTimer) return;
  clearTimeout(delayTimer);
  delayTimer = undefined;
  if (delay > 0) {
    delayTimer = setTimeout(() => {
      delayTimer = undefined;
      wanted = next;
      apply();
    }, delay * 1000);
    return;
  }
  wanted = next;
  apply();
}
