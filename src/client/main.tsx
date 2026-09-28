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
  void Promise.all([import("./store"), import("../shared/bots/random"), import("../shared/bots")]).then(([store, bots, smart]) => {
    (window as unknown as Record<string, unknown>).__sneak = { store: store.useStore, randomAction: bots.randomAction, botAction: smart.botAction };
  });
}

const hadInvite = new URLSearchParams(location.search).has("invite");
captureInviteFromUrl();
startGamepad();

createRoot(document.getElementById("root")!).render(<App inviteCaptured={hadInvite} />);
