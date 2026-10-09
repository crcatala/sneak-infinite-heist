// Sound. Effects are short generated clips in public/audio/sfx (see docs/STYLE.md §8), decoded once and
// played through the sfx bus; if a clip fails to load, the original synthesized version (the "tiptoe
// pizzicato" palette) plays instead. Music and the round-end stingers live in music.ts.
// Buses: master → music, sfx. Volumes come from prefs. The audio context is created on the first
// user gesture (the title screen's "press any key"), as browsers require.

import { attachMusic, playStinger, setMusic, syncMusic } from "./music";
import { usePrefs } from "./prefs";

export { setMusic };
export type { MusicMode } from "./music";

/** Music bus level at a slider value of 1: the tracks are level-matched offline, this sits them under the effects. */
const MUSIC_BUS = 0.8;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function applyVolumes() {
  const p = usePrefs.getState();
  if (!ctx || !master || !musicBus || !sfxBus) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(p.muted ? 0 : p.master, t, 0.05);
  musicBus.gain.setTargetAtTime(p.music * MUSIC_BUS, t, 0.05);
  sfxBus.gain.setTargetAtTime(p.sfx, t, 0.05);
}
usePrefs.subscribe(applyVolumes);

/** Creates/resumes the audio context. Call from a user gesture. */
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    attachMusic(ctx, musicBus);
    applyVolumes();
    decodeSamples(ctx);
  }
  // Music asked for before the first gesture (a deep link, say) starts once the context runs.
  if (ctx.state === "suspended") void ctx.resume().then(syncMusic);
  else syncMusic();
}

export function audioReady() {
  return !!ctx && ctx.state === "running";
}

function a(): AudioContext | null {
  if (!ctx || ctx.state !== "running") return null;
  return ctx;
}

function tone(freq: number, when: number, dur: number, gain: number, type: OscillatorType = "sine", bus = sfxBus, glideTo?: number) {
  const c = a();
  if (!c || !bus) return;
  const osc = c.createOscillator();
  osc.type = type;
  const t = c.currentTime + when;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(when: number, dur: number, from: number, to: number, gain: number, q = 0.9, type: BiquadFilterType = "bandpass", bus = sfxBus) {
  const c = a();
  if (!c || !bus || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const t = c.currentTime + when;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/** A plucked string: triangle with a fast decay and a touch of noise on the attack. */
function pluck(freq: number, when = 0, gain = 0.16, dur = 0.35, bus = sfxBus) {
  tone(freq, when, dur, gain, "triangle", bus);
  tone(freq * 2, when, dur * 0.4, gain * 0.25, "sine", bus);
  noise(when, 0.03, 3000, 1500, gain * 0.25, 1, "bandpass", bus);
}

const N = (semi: number) => 220 * 2 ** (semi / 12); // A3 = 0

// --- sampled effects ---------------------------------------------------------------------------
// Clips are level-matched offline, so volume here is just taste: `gain` per play, `rate` for pitch,
// `jitter` for a little random pitch variation on sounds that repeat (footsteps, menu ticks).

const SAMPLE_IDS = [
  "alarm", "answer-no", "answer-yes", "banner-whoosh", "blocked-bump", "camera-check", "camera-disable", "camera-ping",
  "dice-roll", "emote-pop", "error", "flashlight-sweep", "footstep-detective", "lock-clunk",
  "lock-open", "mark-pencil", "menu-back", "menu-move", "menu-select", "motion-ping", "painting-steal", "painting-unhook",
  "piece-lift", "piece-place", "play-start", "player-back", "player-left", "power-cut", "power-restore", "round-lose",
  "round-win", "spotlight-reveal", "title-sting", "turn-chime", "wire-snip",
] as const;
type SampleId = (typeof SAMPLE_IDS)[number];
interface SampleOpts {
  gain?: number;
  rate?: number;
  jitter?: number;
}

const samples = new Map<SampleId, AudioBuffer>();
const failed = new Set<SampleId>();
/** Plays asked for before their clip finished decoding (e.g. the title sting on the first keypress). */
const waiting: { id: SampleId; o: SampleOpts; at: number }[] = [];
const WAIT_MS = 1500;

// Fetch starts at import so the files are usually in memory by the first user gesture.
const fetched = new Map<SampleId, Promise<ArrayBuffer | null>>();
if (typeof window !== "undefined" && typeof fetch === "function") {
  for (const id of SAMPLE_IDS) {
    fetched.set(
      id,
      fetch(`${import.meta.env.BASE_URL}audio/sfx/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    );
  }
}

function decodeSamples(c: AudioContext) {
  for (const id of SAMPLE_IDS) {
    void (fetched.get(id) ?? Promise.resolve(null))
      .then((data) => (data ? c.decodeAudioData(data) : null))
      .then((buf) => {
        if (!buf) throw new Error("no data");
        samples.set(id, buf);
        for (let i = waiting.length - 1; i >= 0; i--) {
          const w = waiting[i];
          if (w.id !== id) continue;
          waiting.splice(i, 1);
          if (performance.now() - w.at < WAIT_MS) startSample(c, buf, w.o);
        }
      })
      .catch(() => {
        failed.add(id);
        // Anything queued for it falls back to nothing: the synth fallback only covers new plays.
        for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].id === id) waiting.splice(i, 1);
      });
  }
}

function startSample(c: AudioContext, buf: AudioBuffer, o: SampleOpts) {
  if (!sfxBus) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0));
  const g = c.createGain();
  g.gain.value = o.gain ?? 1;
  src.connect(g).connect(sfxBus);
  src.start();
}

/** Returns false only when the clip is unavailable, so the caller can fall back to the synth. */
function sample(id: SampleId, o: SampleOpts = {}): boolean {
  if (failed.has(id)) return false;
  const c = a();
  if (!c) return true; // audio not unlocked (or suspended): the synth would be silent too
  const buf = samples.get(id);
  if (buf) startSample(c, buf, o);
  else waiting.push({ id, o, at: performance.now() });
  return true;
}

// --- synthesized originals (fallbacks) ---------------------------------------------------------

const synth = {
  menuMove() {
    noise(0, 0.05, 1800, 1200, 0.22, 4);
    tone(880, 0, 0.05, 0.05, "square");
  },
  menuSelect() {
    pluck(N(3), 0, 0.18);
    pluck(N(10), 0.07, 0.18);
  },
  menuBack() {
    pluck(N(10), 0, 0.14);
    pluck(N(3), 0.07, 0.14);
  },
  titleSting() {
    // "da-da-da-DUM!" + swish
    [0, 0.11, 0.22].forEach((w) => pluck(N(-5), w, 0.2, 0.2));
    tone(N(-2), 0.36, 0.9, 0.16, "sawtooth");
    tone(N(-14), 0.36, 1.1, 0.22, "triangle");
    tone(N(2), 0.36, 0.9, 0.08, "square");
    noise(0.34, 1.2, 9000, 3000, 0.12, 0.5, "highpass");
  },
  error() {
    tone(180, 0, 0.18, 0.12, "square", sfxBus, 120);
  },
  place() {
    noise(0, 0.07, 900, 400, 0.35, 2);
    tone(220, 0, 0.08, 0.08, "sine", sfxBus, 140);
  },
  lift() {
    noise(0, 0.12, 600, 1400, 0.18, 2);
  },
  dice() {
    for (let i = 0; i < 7; i++) noise(i * 0.07 + Math.random() * 0.03, 0.05, 2400 - i * 150, 1200, 0.3 - i * 0.03, 3);
  },
  step(n = 0) {
    noise(0, 0.06, 500 + (n % 2) * 120, 200, 0.28, 3);
  },
  cameraClick() {
    noise(0, 0.03, 4000, 3000, 0.35, 6);
    tone(1500, 0.02, 0.05, 0.05, "square");
    tone(2400, 0.08, 0.06, 0.04, "sine");
  },
  cameraPing(i = 0) {
    tone(1320 + i * 90, 0, 0.18, 0.07, "sine");
  },
  yes() {
    tone(N(7), 0, 0.15, 0.12, "triangle");
    tone(N(14), 0.08, 0.25, 0.12, "triangle");
  },
  no() {
    tone(N(5), 0, 0.2, 0.08, "sine");
    tone(N(0), 0.1, 0.3, 0.08, "sine");
  },
  alarm() {
    for (let i = 0; i < 4; i++) {
      tone(880, i * 0.36, 0.18, 0.1, "sawtooth");
      tone(660, i * 0.36 + 0.18, 0.18, 0.1, "sawtooth");
    }
  },
  spotlight() {
    noise(0, 0.25, 200, 4000, 0.25, 0.7, "lowpass");
    tone(90, 0, 0.3, 0.3, "sine", sfxBus, 45);
  },
  snip() {
    noise(0, 0.04, 6000, 5000, 0.35, 8);
    noise(0.09, 0.04, 6500, 5500, 0.35, 8);
    tone(3000, 0.09, 0.05, 0.04, "square");
  },
  powerDown() {
    tone(440, 0, 1.1, 0.14, "sawtooth", sfxBus, 40);
    noise(0.9, 0.3, 300, 60, 0.4, 1, "lowpass");
  },
  powerUp() {
    tone(50, 0, 0.9, 0.12, "sawtooth", sfxBus, 520);
    tone(1046, 0.85, 0.2, 0.06, "sine");
  },
  lockClunk() {
    noise(0, 0.1, 700, 200, 0.5, 2);
    tone(110, 0, 0.2, 0.25, "square", sfxBus, 70);
  },
  lockOpen() {
    noise(0, 0.08, 1500, 800, 0.4, 3);
    [0, 4, 7, 12].forEach((s, i) => pluck(N(7 + s), 0.1 + i * 0.07, 0.15));
  },
  steal() {
    noise(0, 0.3, 500, 3500, 0.2, 1.5);
    pluck(N(12), 0.15, 0.12);
    pluck(N(19), 0.22, 0.12);
  },
  capture() {
    // brass "wah-wah" + cymbal
    tone(N(-2), 0, 0.45, 0.18, "sawtooth", sfxBus, N(-4));
    tone(N(-4), 0.45, 0.45, 0.18, "sawtooth", sfxBus, N(-6));
    tone(N(-6), 0.9, 1.0, 0.2, "sawtooth", sfxBus, N(-9));
    noise(0.9, 1.4, 8000, 2500, 0.18, 0.4, "highpass");
  },
  escape() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(s), i * 0.08, 0.5, 0.1, "triangle"));
    tone(N(-12), 0, 1.2, 0.18, "sawtooth");
    noise(0.5, 1.2, 9000, 4000, 0.12, 0.4, "highpass");
  },
  timerTick() {
    tone(1600, 0, 0.04, 0.05, "square");
  },
  whoosh() {
    noise(0, 0.35, 300, 2500, 0.2, 0.8);
  },
  emote() {
    pluck(N(12), 0, 0.1, 0.2);
  },
  pinDrop() {
    tone(N(19), 0, 0.14, 0.08, "sine", sfxBus, N(12));
    noise(0.1, 0.03, 2400, 1400, 0.05, 1, "bandpass");
  },
  turnChime() {
    pluck(N(7), 0, 0.14);
    pluck(N(12), 0.1, 0.14);
    pluck(N(16), 0.2, 0.14);
  },
};

export const sfx = {
  menuMove() {
    sample("menu-move", { jitter: 0.05 }) || synth.menuMove();
  },
  menuSelect() {
    sample("menu-select") || synth.menuSelect();
  },
  menuBack() {
    sample("menu-back") || synth.menuBack();
  },
  titleSting() {
    sample("title-sting") || synth.titleSting();
  },
  error() {
    sample("error") || synth.error();
  },
  place() {
    sample("piece-place", { jitter: 0.03 }) || synth.place();
  },
  lift() {
    sample("piece-lift", { jitter: 0.03 }) || synth.lift();
  },
  dice() {
    sample("dice-roll") || synth.dice();
  },
  /** One detective footstep; `n` is the step's index along the path (alternates the pitch a touch). */
  step(n = 0) {
    sample("footstep-detective", { jitter: 0.06, rate: n % 2 ? 0.97 : 1.03 }) || synth.step(n);
  },
  /** The thief's own steps (never played for a hidden thief): the same clip, softer and a touch lower. */
  footstepThief(n = 0) {
    sample("footstep-detective", { gain: 0.75, jitter: 0.06, rate: n % 2 ? 0.88 : 0.93 }) || synth.step(n);
  },
  cameraClick() {
    sample("camera-check") || synth.cameraClick();
  },
  cameraDisable() {
    sample("camera-disable") || synth.cameraClick();
  },
  /** Scan ping `i` of a sequence: each one a whole tone higher than the last. */
  cameraPing(i = 0) {
    sample("camera-ping", { rate: 2 ** ((Math.min(i, 5) * 2) / 12) }) || synth.cameraPing(i);
  },
  yes() {
    sample("answer-yes") || synth.yes();
  },
  no() {
    sample("answer-no") || synth.no();
  },
  alarm() {
    sample("alarm") || synth.alarm();
  },
  spotlight() {
    sample("spotlight-reveal") || synth.spotlight();
  },
  snip() {
    sample("wire-snip") || synth.snip();
  },
  powerDown() {
    sample("power-cut") || synth.powerDown();
  },
  powerUp() {
    sample("power-restore") || synth.powerUp();
  },
  lockClunk() {
    sample("lock-clunk") || synth.lockClunk();
  },
  lockOpen() {
    sample("lock-open", { gain: 1.25 }) || synth.lockOpen();
  },
  steal() {
    sample("painting-steal") || synth.steal();
  },
  paintingUnhook() {
    sample("painting-unhook") || synth.lift();
  },
  capture() {
    playStinger("captured") || synth.capture();
  },
  escape() {
    playStinger("escaped") || synth.escape();
  },
  timerTick() {
    synth.timerTick();
  },
  whoosh() {
    sample("banner-whoosh") || synth.whoosh();
  },
  emote() {
    sample("emote-pop") || synth.emote();
  },
  /** Someone else's pin landing. */
  pinDrop() {
    synth.pinDrop();
  },
  turnChime() {
    sample("turn-chime") || synth.turnChime();
  },
  playStart() {
    sample("play-start") || synth.titleSting();
  },
  flashlightSweep() {
    sample("flashlight-sweep") || synth.whoosh();
  },
  motionPing() {
    sample("motion-ping") || synth.cameraClick();
  },
  blockedBump() {
    sample("blocked-bump");
  },
  markPencil() {
    sample("mark-pencil", { jitter: 0.04 }) || synth.menuMove();
  },
  dawn() {
    playStinger("museum-opens") || synth.powerUp();
  },
  roundWin() {
    sample("round-win");
  },
  roundLose() {
    sample("round-lose");
  },
  playerLeft() {
    sample("player-left");
  },
  playerBack() {
    sample("player-back");
  },
};
