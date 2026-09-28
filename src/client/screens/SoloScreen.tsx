// Offline solo mode: the room engine runs in this tab (see local.ts), no server involved.

import { useEffect } from "react";
import { startLocal, stopLocal } from "../local";
import { useStore } from "../store";
import { Notice, PhaseScreen } from "./RoomScreen";

export function SoloScreen() {
  const phase = useStore((s) => s.view?.phase);
  const started = useStore((s) => s.mode === "solo" && s.view !== null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const role = q.get("role") === "detectives" ? "detectives" : "thief";
    const n = Number(q.get("n") ?? (role === "thief" ? 3 : 0));
    startLocal({ role, bots: Number.isFinite(n) ? n : 3 });
    return () => stopLocal();
  }, []);

  // Nothing is saved in solo mode: warn before a refresh or close throws away a game in progress.
  const inProgress = !!phase && phase !== "lobby";
  useEffect(() => {
    if (!inProgress) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inProgress]);

  if (!started) {
    return (
      <Notice title="Solo heist">
        <div className="spinner" style={{ margin: "0 auto" }} />
      </Notice>
    );
  }
  return <PhaseScreen />;
}
