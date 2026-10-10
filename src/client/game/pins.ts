// Pointer pins: short-lived 3D markers detectives drop for each other. Pure bookkeeping (cap per
// player, fade timing) so it can be tested without a renderer; scene/Pins.tsx draws them.

/** How long a pin stays before it has fully faded. */
export const PIN_LIFETIME_MS = 8000;
/** The last stretch of that lifetime is the fade-out. */
export const PIN_FADE_MS = 1500;
/** A player's pins on the board at once; placing another fades their oldest. */
export const PIN_MAX_PER_PLAYER = 3;
/** A pin pushed out by a newer one fades this quickly. */
export const PIN_EVICT_FADE_MS = 350;

export interface Pin {
  id: number;
  by: string;
  /** Board-grid units: a cell's centre is a whole number, so pins can sit anywhere between. */
  x: number;
  y: number;
  born: number;
  fadeStart: number;
  until: number;
}

/** 0 once gone, 1 while fully visible, in between while fading. */
export function pinOpacity(pin: Pin, now: number): number {
  if (now >= pin.until) return 0;
  if (now <= pin.fadeStart) return 1;
  return (pin.until - now) / (pin.until - pin.fadeStart);
}

/**
 * Adds a pin, fading the sender's oldest ones beyond the cap, and drops pins that are already gone.
 * Every pin still on screen counts, including ones in their natural fade (they're sped up if they're
 * over the cap); only pins about to vanish anyway (or already being pushed out) don't.
 */
export function placePin(pins: Pin[], pin: Pick<Pin, "id" | "by" | "x" | "y">, now: number): Pin[] {
  const fresh: Pin = { ...pin, born: now, fadeStart: now + PIN_LIFETIME_MS - PIN_FADE_MS, until: now + PIN_LIFETIME_MS };
  const live = pins.filter((p) => p.until > now);
  const mine = live.filter((p) => p.by === pin.by && p.until > now + PIN_EVICT_FADE_MS);
  const excess = new Set(mine.slice(0, Math.max(0, mine.length + 1 - PIN_MAX_PER_PLAYER)));
  return [...live.map((p) => (excess.has(p) ? { ...p, fadeStart: Math.min(p.fadeStart, now), until: now + PIN_EVICT_FADE_MS } : p)), fresh];
}
