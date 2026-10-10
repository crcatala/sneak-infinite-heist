import { lazy, Suspense, useEffect } from "react";
import { DebugConsole } from "./debug/DebugConsole";
import { Toasts } from "./components/Toasts";
import { TipLayer } from "./components/Tip";
import { usePrefs, useReducedMotion } from "./prefs";
import { roomCodeFromPath, usePath } from "./router";
import { Title } from "./screens/Title";
import { unlockAudio } from "./sfx";
import { useStore } from "./store";

const RoomScreen = lazy(() => import("./screens/RoomScreen").then((m) => ({ default: m.RoomScreen })));
const SoloScreen = lazy(() => import("./screens/SoloScreen").then((m) => ({ default: m.SoloScreen })));
const HowToPlay = lazy(() => import("./screens/HowToPlay").then((m) => ({ default: m.HowToPlay })));

export function App({ inviteCaptured }: { inviteCaptured: boolean }) {
  const path = usePath();
  const code = roomCodeFromPath(path);
  const uiScale = usePrefs((s) => s.uiScale);
  const reduced = useReducedMotion();

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    document.body.classList.toggle("reduced-motion", reduced);
  }, [reduced]);

  useEffect(() => {
    if (inviteCaptured) useStore.getState().toast("Invite saved: you can host online games from Play Online.", "good");
  }, [inviteCaptured]);

  useEffect(() => {
    // Any interaction unlocks audio (deep links skip the title's "press any key").
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" || e.key === "~") {
        e.preventDefault();
        const s = useStore.getState();
        s.setDebug({ open: !s.debug.open });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <Suspense fallback={<div className="screen boot-fallback" />}>
        {path === "/solo" ? <SoloScreen /> : path === "/how-to-play" ? <HowToPlay /> : code ? <RoomScreen code={code} /> : <Title />}
      </Suspense>
      <Toasts />
      <TipLayer />
      <DebugConsole />
    </>
  );
}
