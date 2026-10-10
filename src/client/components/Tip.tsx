// Themed hover/focus tooltips. Any element opts in by spreading `tip(...)` onto itself; one `<TipLayer />`
// (mounted once in App) watches the document, so there's no wrapper element, no per-tip state and no
// layout change. It replaces the browser's native `title` bubble with a small panel that matches the
// game: a gold heading, a one-line explanation and the keyboard shortcut.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

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
 * @param keys the keyboard shortcut, shown as a key cap ("L", or "Shift+1")
 * @param side which side of the element it prefers (it flips if there's no room)
 */
export function tip(title: string, body?: string, keys?: string, side?: TipSide): TipProps {
  const props: TipProps = { "data-tip": title };
  if (body) props["data-tip-body"] = body;
  if (keys) props["data-tip-keys"] = keys;
  if (side) props["data-tip-side"] = side;
  return props;
}

interface Content {
  title: string;
  body: string;
  keys: string[];
  side: TipSide;
}

const read = (el: HTMLElement): Content => ({
  title: el.dataset.tip ?? "",
  body: el.dataset.tipBody ?? "",
  keys: el.dataset.tipKeys ? el.dataset.tipKeys.split(" / ") : [],
  side: el.dataset.tipSide === "top" ? "top" : "bottom",
});

/** Hover has to rest this long before a tip opens, so sweeping across the HUD doesn't flicker. */
const SHOW_DELAY = 320;
/** Moving to a neighbouring control within this window opens its tip at once. */
const WARM_MS = 700;
const GAP = 12;
const MARGIN = 8;

interface Placed {
  x: number;
  y: number;
  arrow: number;
  side: TipSide;
}

export function TipLayer() {
  const id = useId();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const lastShown = useRef(0);
  // After a click the tip stays away until the pointer leaves, so it never sits on a button being used.
  const muted = useRef<HTMLElement | null>(null);
  // The element the pointer is over (whether or not its tip has opened yet).
  const target = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);
  // Set by Tab / Shift+Tab and used up by the focus it causes: a button that grabs focus by itself (the
  // Roll button on each new turn) shouldn't pop a tip open.
  const tabbed = useRef(false);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    if (isOpen.current) lastShown.current = performance.now();
    isOpen.current = false;
    setHost(null);
  }, []);

  const show = useCallback((el: HTMLElement, immediate: boolean) => {
    clearTimeout(timer.current);
    const open = () => {
      isOpen.current = true;
      setContent(read(el));
      setHost(el);
    };
    const warm = performance.now() - lastShown.current < WARM_MS;
    if (immediate || warm) open();
    else timer.current = window.setTimeout(open, SHOW_DELAY);
  }, []);

  useEffect(() => {
    const hostOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null);
    const over = (e: PointerEvent) => {
      // Touch has no hover; long-press would only fight the game's own gestures.
      if (e.pointerType === "touch") return;
      const el = hostOf(e.target);
      if (el === target.current) return;
      target.current = el;
      if (el !== muted.current) muted.current = null;
      hide();
      if (el && el !== muted.current) show(el, false);
    };
    const down = (e: PointerEvent) => {
      const el = hostOf(e.target);
      tabbed.current = false;
      if (el) muted.current = el;
      hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = hostOf(e.target);
      const byTab = tabbed.current;
      tabbed.current = false;
      if (el && byTab) show(el, true);
    };
    const focusOut = (e: FocusEvent) => {
      if (hostOf(e.target)) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
      if (e.key === "Tab") tabbed.current = true;
    };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    const leave = () => {
      target.current = null;
      muted.current = null;
      hide();
    };
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [hide, show]);

  // While open: follow edits to the element's tip text (a power cut changes the power chip's), and close
  // if the element leaves the page (a panel closing under the pointer).
  useEffect(() => {
    if (!host) return;
    const mo = new MutationObserver(() => setContent(read(host)));
    mo.observe(host, { attributes: true, attributeFilter: ["data-tip", "data-tip-body", "data-tip-keys", "data-tip-side"] });
    const watch = setInterval(() => {
      if (!host.isConnected || host.hidden) hide();
    }, 250);
    host.setAttribute("aria-describedby", id);
    return () => {
      mo.disconnect();
      clearInterval(watch);
      host.removeAttribute("aria-describedby");
    };
  }, [host, id, hide]);

  // Measure and place before paint, so the tip never flashes at the wrong spot.
  useLayoutEffect(() => {
    const el = root.current;
    if (!host || !el || !content) return setPlaced(null);
    const r = host.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let side = content.side;
    if (side === "bottom" && r.bottom + GAP + h > innerHeight - MARGIN && r.top - GAP - h >= MARGIN) side = "top";
    else if (side === "top" && r.top - GAP - h < MARGIN && r.bottom + GAP + h <= innerHeight - MARGIN) side = "bottom";
    const centre = r.left + r.width / 2;
    const x = Math.max(MARGIN, Math.min(innerWidth - w - MARGIN, Math.round(centre - w / 2)));
    const y = Math.round(side === "bottom" ? r.bottom + GAP : r.top - GAP - h);
    setPlaced({ x, y, arrow: Math.max(16, Math.min(w - 16, Math.round(centre - x))), side });
  }, [host, content]);

  const open = !!host && !!content;
  return (
    <div
      ref={root}
      id={id}
      role="tooltip"
      className="tip"
      data-open={open && !!placed}
      data-side={placed?.side ?? "bottom"}
      style={{ transform: `translate3d(${placed?.x ?? 0}px, ${placed?.y ?? 0}px, 0)`, ["--arrow" as string]: `${placed?.arrow ?? 24}px` }}
    >
      {content && (
        <>
          <div className="tip-head">
            <b className="tip-title">{content.title}</b>
            {content.keys.map((k) => (
              <kbd key={k} className="tip-key">
                {k}
              </kbd>
            ))}
          </div>
          {content.body && <p className="tip-body">{content.body}</p>}
        </>
      )}
    </div>
  );
}
