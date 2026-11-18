// First, so a capture seed (dev builds) is in place before anything else draws a random number.
import { captureOptions } from "./capture";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startGamepad } from "./gamepad";
import { captureInviteFromUrl } from "./invite";
import "./styles.css";
import "./title.css";
import "./lobby.css";
import "./game.css";

if (import.meta.env.DEV) {
  // Dev-only hooks for browser automation (multi-tab playtests). Not in production builds.
  void Promise.all([import("./store"), import("../shared/bots/random"), import("../shared/bots"), import("./local")]).then(([store, bots, smart, local]) => {
    (window as unknown as Record<string, unknown>).__sneak = {
      store: store.useStore,
      randomAction: bots.randomAction,
      botAction: smart.botAction,
      // Capture mode (capture.ts): the flags in force, and a way to send debug commands mid-take.
      capture: captureOptions(),
      roomTime: local.soloRoomTime,
      send: (msg: Parameters<ReturnType<typeof store.useStore.getState>["send"]>[0]) => store.useStore.getState().send(msg),
    };
  });
}

const hadInvite = new URLSearchParams(location.search).has("invite");
captureInviteFromUrl();
startGamepad();

createRoot(document.getElementById("root")!).render(<App inviteCaptured={hadInvite} />);
