// A small "can't do that" bubble that follows the pointer while it hovers an illegal target. It replaces
// a line in the bottom panel, whose height changed every time the message appeared and disappeared.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";

/** Gap between the pointer tip and the bubble. */
const OFFSET_X = 18;
const OFFSET_Y = 22;
/** Keep the bubble this far from the viewport edge. */
const MARGIN = 8;

export function CursorTip({ reason }: { reason: string | null }) {
  // The last message stays rendered while the bubble animates out.
  const [shown, setShown] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const place = () => {
    const el = root.current;
    if (!el) return;
    const p = pointer.current ?? { x: innerWidth / 2, y: innerHeight / 2 };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Flip to the other side of the pointer instead of running off the screen.
    const x = p.x + OFFSET_X + w > innerWidth - MARGIN ? p.x - OFFSET_X - w : p.x + OFFSET_X;
    const y = p.y + OFFSET_Y + h > innerHeight - MARGIN ? p.y - OFFSET_Y - h : p.y + OFFSET_Y;
    el.style.transform = `translate3d(${Math.max(MARGIN, Math.round(x))}px, ${Math.max(MARGIN, Math.round(y))}px, 0)`;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      place();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("resize", place);
    };
  }, []);

  useEffect(() => {
    if (reason) setShown(reason);
  }, [reason]);

  // Position before paint so a new bubble never flashes at the old spot.
  useLayoutEffect(place, [shown]);

  return (
    <div ref={root} className="cursor-tip-anchor" role="status" aria-live="polite">
      {shown && (
        <div key={shown} className="cursor-tip" data-state={reason ? "in" : "out"} onAnimationEnd={(e) => e.target === e.currentTarget && !reason && setShown(null)}>
          <span className="cursor-tip-icon" aria-hidden>
            <Icon name="block" size={18} />
          </span>
          <span className="cursor-tip-text">{shown}</span>
        </div>
      )}
    </div>
  );
}
