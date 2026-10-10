// The tooltip's decisions, kept free of the DOM and React so they can be tested (see tests/tip.test.ts):
// where it goes, and when it opens and closes. Tip.tsx wires these to real events and the real layout.

export type TipSide = "top" | "bottom";

export interface TipProps {
  "data-tip": string;
  "data-tip-body"?: string;
  "data-tip-keys"?: string;
  "data-tip-side"?: TipSide;
}

/**
 * Props that give an element a tooltip.
 * @param title short name of the thing ("Danger overlay")
 * @param body one sentence on what it is or does; omit for a self-explanatory control
 * @param keys the keyboard shortcut, shown as a key cap ("L", or "Shift+1"); " / " separates alternatives
 * @param side which side of the element it prefers (it flips if there's no room)
 */
export function tip(title: string, body?: string, keys?: string, side?: TipSide): TipProps {
  const props: TipProps = { "data-tip": title };
  if (body) props["data-tip-body"] = body;
  if (keys) props["data-tip-keys"] = keys;
  if (side) props["data-tip-side"] = side;
  return props;
}

/** "2 / T" -> ["2", "T"]. */
export const splitKeys = (keys: string | undefined): string[] => (keys ? keys.split(" / ") : []);

// --- placement ---------------------------------------------------------------------------------

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placed {
  x: number;
  y: number;
  /** Where the caret sits, measured from the tooltip's left edge. */
  arrow: number;
  side: TipSide;
}

/** Space between the element and the tooltip. */
export const GAP = 12;
/** The tooltip keeps this far from the viewport edge. */
export const MARGIN = 8;
/** The caret stays this far from the tooltip's corners. */
const ARROW_INSET = 16;

/**
 * Puts a `w`×`h` tooltip on the preferred side of `host`, flipped to the other side if it wouldn't fit
 * there but would fit on the other, then slid sideways to stay on screen with the caret still on the host.
 */
export function placeTip(host: Box, size: { w: number; h: number }, view: { w: number; h: number }, prefer: TipSide): Placed {
  const { w, h } = size;
  const fitsBelow = host.bottom + GAP + h <= view.h - MARGIN;
  const fitsAbove = host.top - GAP - h >= MARGIN;
  let side = prefer;
  if (prefer === "bottom" && !fitsBelow && fitsAbove) side = "top";
  else if (prefer === "top" && !fitsAbove && fitsBelow) side = "bottom";
  const centre = host.left + (host.right - host.left) / 2;
  const x = Math.max(MARGIN, Math.min(view.w - w - MARGIN, Math.round(centre - w / 2)));
  const y = Math.round(side === "bottom" ? host.bottom + GAP : host.top - GAP - h);
  return { x, y, arrow: Math.max(ARROW_INSET, Math.min(w - ARROW_INSET, Math.round(centre - x))), side };
}

// --- when it opens ------------------------------------------------------------------------------

/** Hover has to rest this long before a tip opens, so sweeping across the HUD doesn't flicker. */
export const SHOW_DELAY = 320;
/** Moving to a neighbouring control within this window opens its tip at once. */
export const WARM_MS = 700;

export interface TipClock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

export interface TipHooks<T> {
  open(el: T): void;
  close(): void;
}

/**
 * The open/close rules, driven by the page's pointer, focus and key events:
 * - Hover opens a tip after SHOW_DELAY, or at once if another closed less than WARM_MS ago.
 * - A click on an element keeps its tip away until the pointer has left and come back.
 * - Keyboard focus opens one only when it came from Tab: a button that grabs focus by itself (the Roll
 *   button on a new turn) must stay quiet.
 * - Escape, leaving the page and blur close it.
 */
export function createTipController<T>(hooks: TipHooks<T>, clock: TipClock) {
  let target: T | null = null; // what the pointer is over, whether or not its tip has opened
  let muted: T | null = null; // clicked: no tip until the pointer leaves
  let isOpen = false;
  let lastClosed = -Infinity;
  let tabbed = false; // set by Tab, used up by the focus it causes
  let timer: unknown;

  const hide = () => {
    clock.clear(timer);
    if (isOpen) lastClosed = clock.now();
    isOpen = false;
    hooks.close();
  };
  const show = (el: T, immediate: boolean) => {
    clock.clear(timer);
    const open = () => {
      isOpen = true;
      hooks.open(el);
    };
    if (immediate || clock.now() - lastClosed < WARM_MS) open();
    else timer = clock.set(open, SHOW_DELAY);
  };

  return {
    /** The pointer moved onto `el` (the element carrying a tip), or onto something without one (null). */
    pointerOver(el: T | null) {
      if (el === target) return;
      target = el;
      if (el !== muted) muted = null;
      hide();
      if (el && el !== muted) show(el, false);
    },
    pointerDown(el: T | null) {
      tabbed = false;
      if (el) muted = el;
      hide();
    },
    /** Focus moved onto `el` (null: onto something without a tip). */
    focusIn(el: T | null) {
      const byTab = tabbed;
      tabbed = false;
      if (el && byTab) show(el, true);
    },
    focusOut() {
      hide();
    },
    keyDown(key: string) {
      if (key === "Escape") hide();
      if (key === "Tab") tabbed = true;
    },
    /** The pointer left the page. */
    leave() {
      target = null;
      muted = null;
      hide();
    },
    /** Close for any other reason (window blur or resize, the element left the page). */
    close: hide,
  };
}
