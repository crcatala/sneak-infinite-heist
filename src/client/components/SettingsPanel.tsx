// The Settings page (title menu and in-game pause menu): volumes, graphics, motion, UI scale,
// colour-blind patterns and the player name. Arrow keys move between rows and adjust values.

import { useState } from "react";
import { loadName, saveName } from "../identity";
import { usePrefs, type MotionPref, type Quality } from "../prefs";
import { sfx } from "../sfx";
import { useStore } from "../store";
import { useMenuKeys } from "./Menu";

type Row =
  | { id: string; label: string; kind: "slider"; get: () => number; set: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }
  | { id: string; label: string; kind: "choice"; options: { value: string; label: string }[]; get: () => string; set: (v: string) => void; help?: string }
  | { id: string; label: string; kind: "toggle"; get: () => boolean; set: (v: boolean) => void; help?: string }
  | { id: string; label: string; kind: "name" };

export function SettingsPanel({ onBack, enabled = true }: { onBack?: () => void; enabled?: boolean }) {
  const prefs = usePrefs();
  const [focus, setFocus] = useState(0);
  const [name, setName] = useState(loadName());
  const send = useStore((s) => s.send);
  const inRoom = useStore((s) => !!s.view);

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: Row[] = [
    { id: "master", label: "Master volume", kind: "slider", get: () => prefs.master, set: (v) => prefs.set({ master: v }), min: 0, max: 1, step: 0.05, fmt: pct },
    { id: "music", label: "Music", kind: "slider", get: () => prefs.music, set: (v) => prefs.set({ music: v }), min: 0, max: 1, step: 0.05, fmt: pct },
    { id: "sfx", label: "Sound effects", kind: "slider", get: () => prefs.sfx, set: (v) => prefs.set({ sfx: v }), min: 0, max: 1, step: 0.05, fmt: pct },
    {
      id: "quality",
      label: "Graphics",
      kind: "choice",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      get: () => prefs.quality,
      set: (v) => prefs.set({ quality: v as Quality }),
      help: "Low: no shadows, sharper on slow devices. High: soft shadows, bloom and full resolution.",
    },
    {
      id: "motion",
      label: "Motion",
      kind: "choice",
      options: [
        { value: "system", label: "System" },
        { value: "reduced", label: "Reduced" },
        { value: "full", label: "Full" },
      ],
      get: () => prefs.motion,
      set: (v) => prefs.set({ motion: v as MotionPref }),
      help: "Reduced swaps moves and cinematics for quick fades.",
    },
    { id: "scale", label: "UI scale", kind: "slider", get: () => prefs.uiScale, set: (v) => prefs.set({ uiScale: v }), min: 0.8, max: 1.4, step: 0.05, fmt: pct },
    { id: "cb", label: "Colour-blind patterns", kind: "toggle", get: () => prefs.colourBlind, set: (v) => prefs.set({ colourBlind: v }), help: "Adds a pattern to every room floor: stripes, dots, waves, chevrons, crosses." },
    { id: "name", label: "Your name", kind: "name" },
  ];

  const commitName = () => {
    const n = name.trim().slice(0, 24);
    if (!n) return;
    saveName(n);
    if (inRoom) send({ t: "setName", name: n });
    sfx.menuSelect();
  };

  const adjust = (i: number, dir: -1 | 1) => {
    const row = rows[i];
    if (row.kind === "slider") {
      const v = Math.min(row.max, Math.max(row.min, Math.round((row.get() + dir * row.step) * 100) / 100));
      row.set(v);
      return true;
    }
    if (row.kind === "choice") {
      const idx = row.options.findIndex((o) => o.value === row.get());
      row.set(row.options[(idx + dir + row.options.length) % row.options.length].value);
      return true;
    }
    if (row.kind === "toggle") {
      row.set(!row.get());
      return true;
    }
    return false;
  };

  useMenuKeys({
    count: rows.length,
    focus,
    setFocus: (i) => {
      setFocus(i);
      document.getElementById(`set-${rows[i].id}`)?.focus({ preventScroll: false });
    },
    onSelect: (i) => {
      const row = rows[i];
      if (row.kind === "toggle") adjust(i, 1);
      if (row.kind === "name") document.getElementById("set-name-input")?.focus();
    },
    onAdjust: adjust,
    onBack,
    enabled,
  });

  return (
    <div className="settings-grid">
      {rows.map((row, i) => (
        <div key={row.id} className={`settings-row${i === focus ? " focused" : ""}`} onMouseEnter={() => setFocus(i)}>
          <label className="settings-label" htmlFor={`set-${row.id}`}>
            {row.label}
            {"help" in row && row.help && <span className="settings-help">{row.help}</span>}
          </label>
          <div className="settings-control">
            {row.kind === "slider" && (
              <>
                <input
                  id={`set-${row.id}`}
                  type="range"
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  value={row.get()}
                  style={{ ["--pct" as string]: `${((row.get() - row.min) / (row.max - row.min)) * 100}%` }}
                  onChange={(e) => row.set(Number(e.target.value))}
                  onPointerUp={() => row.id !== "scale" && sfx.menuMove()}
                  onFocus={() => setFocus(i)}
                />
                <span className="settings-value">{row.fmt(row.get())}</span>
              </>
            )}
            {row.kind === "choice" && (
              <div className="seg" id={`set-${row.id}`} tabIndex={-1} onFocus={() => setFocus(i)}>
                {row.options.map((o) => (
                  <button
                    key={o.value}
                    aria-pressed={row.get() === o.value}
                    onClick={() => {
                      row.set(o.value);
                      sfx.menuMove();
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {row.kind === "toggle" && (
              <button
                id={`set-${row.id}`}
                className="switch"
                role="switch"
                aria-checked={row.get()}
                aria-label={row.label}
                onFocus={() => setFocus(i)}
                onClick={() => {
                  row.set(!row.get());
                  sfx.menuMove();
                }}
              />
            )}
            {row.kind === "name" && (
              <div className="row" id={`set-${row.id}`} tabIndex={-1}>
                <input
                  id="set-name-input"
                  className="input"
                  maxLength={24}
                  value={name}
                  onFocus={() => setFocus(i)}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                  }}
                  onBlur={commitName}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
