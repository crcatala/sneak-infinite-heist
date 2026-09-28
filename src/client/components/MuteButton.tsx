import { usePrefs } from "../prefs";
import { Icon } from "./Icon";

/** Quick mute toggle (the Settings page has the full volume mixer). */
export function MuteButton({ className = "" }: { className?: string }) {
  const muted = usePrefs((s) => s.muted);
  const set = usePrefs((s) => s.set);
  return (
    <button className={`btn small icon ${className}`} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} onClick={() => set({ muted: !muted })}>
      <Icon name={muted ? "mute" : "volume"} size={18} />
    </button>
  );
}
