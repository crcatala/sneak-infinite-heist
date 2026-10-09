import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { musicFor } from "../src/client/game/musicFor";

describe("which track a game screen plays", () => {
  const play = { phase: "play", revealed: false, powerCut: false, resultShown: false } as const;

  it("is calm until something happens", () => {
    expect(musicFor(play)).toBe("calm");
  });
  it("goes dark when the power is cut", () => {
    expect(musicFor({ ...play, powerCut: true })).toBe("lights-out");
  });
  it("lets the chase win over the blackout", () => {
    expect(musicFor({ ...play, revealed: true, powerCut: true })).toBe("chase");
    expect(musicFor({ ...play, revealed: true })).toBe("chase");
  });
  it("keeps the lobby's mood through every setup phase", () => {
    for (const phase of ["setupLocks", "setupPaintings", "setupCameras", "setupDetectives"] as const) {
      expect(musicFor({ ...play, phase })).toBe("lobby");
    }
  });
  it("starts the results only once the round-over screen is showing", () => {
    // Still in the capture or escape cinematic: leave the music alone so the stinger isn't cut short.
    expect(musicFor({ ...play, phase: "roundOver" })).toBeNull();
    expect(musicFor({ ...play, phase: "roundOver", resultShown: true })).toBe("results");
  });
  it("leaves the results behind when the next round starts", () => {
    // The presenter clears resultShown for the new game, and its setup then plays the lobby track.
    expect(musicFor({ ...play, phase: "setupLocks", resultShown: false })).toBe("lobby");
  });
});

// --- the player, on stand-ins for the Web Audio and media element APIs ----------------------------

class FakeParam {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
}
class FakeGain {
  gain = new FakeParam();
  connect<T>(to: T) {
    return to;
  }
  disconnect() {}
}
class FakeAudio {
  static all: FakeAudio[] = [];
  duration = Number.NaN;
  currentTime = 0;
  killed = false;
  preload = "";
  private on = new Map<string, () => void>();
  constructor(public src: string) {
    FakeAudio.all.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    this.on.set(type, fn);
  }
  emit(type: string) {
    this.on.get(type)?.();
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.killed = true;
  }
  removeAttribute() {}
  load() {}
}
const gains: FakeGain[] = [];
const fakeCtx = (state = "running") => ({
  state,
  currentTime: 0,
  createGain: () => {
    const g = new FakeGain();
    gains.push(g);
    return g;
  },
  createMediaElementSource: () => ({ connect: <T>(to: T) => to, disconnect() {} }),
});

const track = (a: FakeAudio) => /\/(\w[\w-]*)\.mp3$/.exec(a.src)?.[1];
const alive = () => FakeAudio.all.filter((a) => !a.killed).map(track);

async function load(state = "running") {
  vi.resetModules();
  const music = await import("../src/client/music");
  const ctx = fakeCtx(state);
  const bus = new FakeGain();
  music.attachMusic(ctx as unknown as AudioContext, bus as unknown as GainNode);
  return { music, ctx };
}

describe("music player", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.all = [];
    gains.length = 0;
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds a request made before the audio context runs, then starts it", async () => {
    const { music, ctx } = await load("suspended");
    music.setMusic("title");
    expect(FakeAudio.all).toHaveLength(0);
    ctx.state = "running";
    music.syncMusic();
    expect(alive()).toEqual(["title"]);
  });

  it("ignores a repeat of the current mode", async () => {
    const { music } = await load();
    music.setMusic("calm");
    music.setMusic("calm");
    expect(FakeAudio.all).toHaveLength(1);
  });

  it("crossfades to a new mode and removes the old track once it has faded", async () => {
    const { music } = await load();
    music.setMusic("calm");
    music.setMusic("chase");
    expect(alive()).toEqual(["calm", "chase"]);
    vi.advanceTimersByTime(2000);
    expect(alive()).toEqual(["chase"]);
  });

  it("stops everything for off", async () => {
    const { music } = await load();
    music.setMusic("lobby");
    music.setMusic("off");
    vi.advanceTimersByTime(2000);
    expect(alive()).toEqual([]);
  });

  it("holds a delayed change back, and a later request cancels it", async () => {
    const { music } = await load();
    music.setMusic("off");
    music.setMusic("results", 2);
    vi.advanceTimersByTime(1900);
    expect(alive()).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(alive()).toEqual(["results"]);

    music.setMusic("lobby", 2);
    music.setMusic("calm");
    vi.advanceTimersByTime(5000);
    expect(alive()).toEqual(["calm"]);
  });

  it("loops by starting the same track under its fading tail", async () => {
    const { music } = await load();
    music.setMusic("calm");
    const first = FakeAudio.all[0];
    first.duration = 100;
    first.currentTime = 50;
    vi.advanceTimersByTime(400);
    expect(FakeAudio.all).toHaveLength(1);

    first.currentTime = 97.6; // inside the final 2.5 s
    vi.advanceTimersByTime(400);
    expect(alive()).toEqual(["calm", "calm"]);
    vi.advanceTimersByTime(3000);
    expect(alive()).toEqual(["calm"]);
    expect(FakeAudio.all[0].killed).toBe(true);
  });

  it("keeps a track down if it is retired before its first audio arrives", async () => {
    const { music } = await load();
    music.setMusic("calm"); // still loading: no "playing" event yet
    music.setMusic("chase"); // retires calm
    expect(gains[0].gain.value).toBe(0);
    FakeAudio.all[0].emit("playing"); // the network finally delivers calm
    expect(gains[0].gain.value).toBe(0);
    FakeAudio.all[1].emit("playing");
    expect(gains[1].gain.value).toBe(1);
  });

  it("keeps looping when a track simply ends", async () => {
    const { music } = await load();
    music.setMusic("chase");
    FakeAudio.all[0].emit("ended");
    expect(FakeAudio.all).toHaveLength(2);
    expect(track(FakeAudio.all[1])).toBe("chase");
  });
});
