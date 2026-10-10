// Themed hover/focus tooltips. Any element opts in by spreading `tip(...)` onto itself; one `<TipLayer />`
// (mounted once in App) watches the document, so there's no wrapper element, no per-tip state and no
// layout change. It replaces the browser's native `title` bubble with a small panel that matches the
// game: a gold heading, a one-line explanation and the keyboard shortcut. The open/close rules and the
// placement maths live in tipLogic.ts.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createTipController, placeTip, splitKeys, type Placed, type TipSide } from "./tipLogic";

export { tip } from "./tipLogic";

interface Content {
  title: string;
  body: string;
  keys: string[];
  side: TipSide;
}

const read = (el: HTMLElement): Content => ({
  title: el.dataset.tip ?? "",
  body: el.dataset.tipBody ?? "",
  keys: splitKeys(el.dataset.tipKeys),
  side: el.dataset.tipSide === "top" ? "top" : "bottom",
});

const hostOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null);

export function TipLayer() {
  const id = useId();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const ctl = useMemo(
    () =>
      createTipController<HTMLElement>(
        {
          open: (el) => {
            setContent(read(el));
            setHost(el);
          },
          close: () => setHost(null),
        },
        { now: () => performance.now(), set: (fn, ms) => window.setTimeout(fn, ms), clear: (t) => clearTimeout(t as number) },
      ),
    [],
  );

  useEffect(() => {
    const over = (e: PointerEvent) => {
      // Touch has no hover; long-press would only fight the game's own gestures.
      if (e.pointerType !== "touch") ctl.pointerOver(hostOf(e.target));
    };
    const down = (e: PointerEvent) => ctl.pointerDown(hostOf(e.target));
    const focusIn = (e: FocusEvent) => ctl.focusIn(hostOf(e.target));
    const focusOut = (e: FocusEvent) => {
      if (hostOf(e.target)) ctl.focusOut();
    };
    const key = (e: KeyboardEvent) => ctl.keyDown(e.key);
    const page = document.documentElement;
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", ctl.close);
    window.addEventListener("resize", ctl.close);
    page.addEventListener("pointerleave", ctl.leave);
    return () => {
      ctl.close();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", ctl.close);
      window.removeEventListener("resize", ctl.close);
      page.removeEventListener("pointerleave", ctl.leave);
    };
  }, [ctl]);

  // While open: follow edits to the element's tip text (a power cut changes the power chip's), and close
  // if the element leaves the page (a panel closing under the pointer).
  useEffect(() => {
    if (!host) return;
    const mo = new MutationObserver(() => setContent(read(host)));
    mo.observe(host, { attributes: true, attributeFilter: ["data-tip", "data-tip-body", "data-tip-keys", "data-tip-side"] });
    const watch = setInterval(() => {
      if (!host.isConnected || host.hidden) ctl.close();
    }, 250);
    host.setAttribute("aria-describedby", id);
    return () => {
      mo.disconnect();
      clearInterval(watch);
      host.removeAttribute("aria-describedby");
    };
  }, [host, id, ctl]);

  // Measure and place before paint, so the tip never flashes at the wrong spot.
  useLayoutEffect(() => {
    const el = root.current;
    if (!host || !el || !content) return setPlaced(null);
    setPlaced(placeTip(host.getBoundingClientRect(), { w: el.offsetWidth, h: el.offsetHeight }, { w: innerWidth, h: innerHeight }, content.side));
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
