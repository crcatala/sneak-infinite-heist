import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../prefs";
import { sfx } from "../sfx";
import { Icon } from "./Icon";
import { tip } from "./Tip";

const MIXER: { key: "master" | "music" | "sfx"; label: string }[] = [
  { key: "master", label: "Master" },
  { key: "music", label: "Music" },
  { key: "sfx", label: "Effects" },
];

/**
 * A speaker button that opens a small mixer: master, music and effects volume plus a mute switch.
 * The Settings page has the same sliders; this is the one within reach on the title screen, in the
 * lobby and mid-game. `placement` picks the side the panel opens to, `align` the edge it hangs from.
 */
export function VolumeControl({ className = "", placement = "down", align = "end" }: { className?: string; placement?: "up" | "down"; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const prefs = usePrefs();
  const silent = prefs.muted || prefs.master === 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const toggle = () => {
    setOpen(!open);
    // Hands the keyboard to the first slider; the panel is rendered by the time this runs.
    if (!open) requestAnimationFrame(() => wrap.current?.querySelector<HTMLInputElement>("input[type=range]")?.focus());
  };

  return (
    <div
      ref={wrap}
      className={`vol ${placement} ${align}`}
      onBlur={(e) => {
        // Tabbing out closes it; a click on the panel's own padding (no related target) doesn't.
        const to = e.relatedTarget as Node | null;
        if (to && !wrap.current?.contains(to)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (!open || e.key === "Tab") return;
        // Arrow keys, letters and Enter belong to the mixer while it is open, not to the menu or
        // the board behind it.
        e.stopPropagation();
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        className={`btn small icon ${className}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={silent ? "Volume (muted)" : "Volume"}
        {...tip("Volume", "Master, music and sound-effect levels, plus a mute switch.", undefined, placement === "up" ? "top" : "bottom")}
        onClick={toggle}
      >
        <Icon name={silent ? "mute" : "volume"} size={18} />
      </button>
      {open && (
        <div className="vol-pop panel glass" role="group" aria-label="Volume">
          {MIXER.map(({ key, label }) => (
            <VolumeRow key={key} label={label} value={prefs[key]} dimmed={prefs.muted} onChange={(v) => prefs.set({ [key]: v })} onRelease={key === "sfx" ? sfx.menuMove : undefined} />
          ))}
          <div className="vol-mute">
            <span id="vol-mute-label">Mute all</span>
            <button className="switch" role="switch" aria-checked={prefs.muted} aria-labelledby="vol-mute-label" onClick={() => prefs.set({ muted: !prefs.muted })} />
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeRow({ label, value, dimmed, onChange, onRelease }: { label: string; value: number; dimmed: boolean; onChange: (v: number) => void; onRelease?: () => void }) {
  const pct = Math.round(value * 100);
  return (
    <label className={`vol-row${dimmed ? " dimmed" : ""}`}>
      <span className="vol-name">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        aria-valuetext={`${pct}%`}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onRelease}
      />
      <span className="vol-val">{pct}%</span>
    </label>
  );
}
