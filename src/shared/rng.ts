// Small seedable RNG so every game is deterministic under test. The game keeps its RNG state as a
// plain number inside GameState (see `stateRng`), so a saved room resumes the exact same sequence.

export type Rng = () => number;

/** One mulberry32 step: returns the next state word and a float in [0, 1). */
export function mulberryStep(state: number): { next: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    const { next, value } = mulberryStep(a);
    a = next;
    return value;
  };
}

/** An Rng whose state lives in `holder.rng` (e.g. GameState), advanced in place. */
export function stateRng(holder: { rng: number }): Rng {
  return () => {
    const { next, value } = mulberryStep(holder.rng);
    holder.rng = next;
    return value;
  };
}

/** A fresh 32-bit seed. */
export function randomSeed(rng: Rng): number {
  return Math.floor(rng() * 4294967296) >>> 0;
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** No 0/O/1/I/L to keep share codes easy to read aloud. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(rng: Rng, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return out;
}
