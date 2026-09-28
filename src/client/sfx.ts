// Synthesized sound (WebAudio, no asset files): the "tiptoe pizzicato" palette from docs/STYLE.md.
// Buses: master → music, sfx. Volumes come from prefs. The audio context is created on the first
// user gesture (the title screen's "press any key"), as browsers require.

import { usePrefs } from "./prefs";

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
  musicBus.gain.setTargetAtTime(p.music * 0.55, t, 0.05);
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
    applyVolumes();
  }
  if (ctx.state === "suspended") void ctx.resume();
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

export const sfx = {
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
  turnChime() {
    pluck(N(7), 0, 0.14);
    pluck(N(12), 0.1, 0.14);
    pluck(N(16), 0.2, 0.14);
  },
};

// --- music -----------------------------------------------------------------------------------

type MusicMode = "off" | "title" | "calm" | "chase";
let mode: MusicMode = "off";
let timer: ReturnType<typeof setInterval> | undefined;
let nextBeat = 0;
let beat = 0;

// D minor walking line (semitones from A3) and a pad chord per bar.
const BASS = [-7, -2, 1, 3, 5, 3, 1, -2, -5, -2, 0, 3, 4, 3, 0, -3];
const PADS = [
  [5, 8, 12],
  [3, 7, 10],
  [0, 5, 8],
  [1, 4, 8],
];

function schedule() {
  const c = a();
  if (!c || !musicBus) return;
  const bpm = mode === "chase" ? 150 : mode === "title" ? 96 : 88;
  const spb = 60 / bpm / 2; // eighth notes
  while (nextBeat < c.currentTime + 0.15) {
    const when = nextBeat - c.currentTime;
    const step = beat % 16;
    if (beat % 2 === 0) pluck(N(BASS[(beat / 2) % 16] - 12), when, mode === "chase" ? 0.2 : 0.16, 0.3, musicBus);
    if (step === 0) PADS[Math.floor(beat / 16) % 4].forEach((s) => tone(N(s), when, spb * 15, 0.025, "sine", musicBus));
    if (mode === "chase") {
      noise(when, 0.03, 9000, 7000, beat % 2 ? 0.05 : 0.09, 3, "highpass", musicBus);
      if (step % 4 === 0) tone(60, when, 0.15, 0.25, "sine", musicBus, 40);
    } else if (step % 4 === 2) noise(when, 0.02, 5000, 4000, 0.03, 4, "bandpass", musicBus);
    if (mode === "title" && step % 8 === 6) pluck(N(12 + [0, 3, 7, 10][(beat / 8) % 4 | 0]), when, 0.05, 0.4, musicBus);
    nextBeat += spb;
    beat++;
  }
}

export function setMusic(next: MusicMode) {
  if (next === mode) return;
  mode = next;
  clearInterval(timer);
  timer = undefined;
  if (mode === "off") return;
  const c = a();
  if (c) nextBeat = c.currentTime + 0.1;
  timer = setInterval(() => {
    if (!a()) return;
    if (nextBeat === 0 || nextBeat < a()!.currentTime) nextBeat = a()!.currentTime + 0.05;
    schedule();
  }, 40);
}

export function musicMode(): MusicMode {
  return mode;
}
