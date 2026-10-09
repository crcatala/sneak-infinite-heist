// The "last big move" card. When someone's action lands it appears large in the middle of the
// screen for a few seconds, then glides into its slot in the top-right corner and stays there until
// the next big move, so everyone can always see what just happened (the case notes keep the full
// story). The slot is always the same size in the same place, so nothing around it shifts. The
// detective's dice dock into the left of the card. It never takes clicks.

import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useFx } from "../game/present";

/** Where the card goes for its big moment, as a transform from its slot: centred, near the top, scaled up. */
function heroTransform(slot: HTMLElement) {
  const r = slot.getBoundingClientRect();
  const w = Math.min(580, innerWidth - 24);
  const k = Math.max(1, w / r.width);
  return { ["--hero-x" as string]: `${(innerWidth - w) / 2 - r.left}px`, ["--hero-y" as string]: `${innerHeight * 0.17 - r.top}px`, ["--hero-k" as string]: k };
}

export function Announcer({ active }: { active: boolean }) {
  const a = useFx((s) => s.announce);
  const hasDice = useFx((s) => !!s.dice && s.diceDocked);
  const slot = useRef<HTMLDivElement>(null);
  const [hero, setHero] = useState<Record<string, string | number>>({});

  // The hero transform depends on the slot's position and the window size.
  useLayoutEffect(() => {
    const measure = () => slot.current && setHero(heroTransform(slot.current));
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [active, a === null]);

  if (!active && !a) return null;
  return (
    <>
      <div className="announce-slot" ref={slot} data-hud="side" aria-hidden>
        Latest move
      </div>
      {a && (
        <div className={`announce stage-${a.stage} tone-${a.tone} kind-${a.kind}${hasDice ? " has-dice" : ""}`} style={{ ...hero, ...(a.hex ? { ["--who" as string]: a.hex } : {}) }} role="status" aria-live="polite">
          <div className="announce-body" key={a.id}>
            <span className="announce-icon">
              <Icon name={a.icon} size={28} />
            </span>
            <div className="announce-text">
              <div className="announce-title">{a.title}</div>
              {a.sub && <div className="announce-sub">{a.sub}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
