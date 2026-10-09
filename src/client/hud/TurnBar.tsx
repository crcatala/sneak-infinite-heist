// Top bar: round status chips, a big "whose turn" line with who we're waiting on and why, the clock,
// and view controls (camera presets, overlays, pad, log, pause).

import { useEffect, useState } from "react";
import { character, THIEF } from "../../shared/characters";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { MuteButton } from "../components/MuteButton";
import { activePawn, pawnName, playerName } from "../game/derive";
import { useGameUi, type CameraPreset } from "../game/uiStore";
import { serverNow } from "../store";
import { sfx } from "../sfx";

export function whoseTurn(view: RoomView, game: GameView): { text: string; sub: string; colour: string; mine: boolean } {
  const t = game.turn;
  const me = view.you;
  if (game.phase === "roundOver") return { text: "Round over", sub: "", colour: "#ffc14d", mine: false };
  if (game.phase.startsWith("setup")) {
    const phaseText = game.phase === "setupPaintings" ? "Hanging the paintings" : game.phase === "setupCameras" ? "Installing cameras" : game.phase === "setupDetectives" ? "Detectives take their posts" : "Setting the locks";
    const waiting = view.waitingOn.map((id) => playerName(view, id));
    const mine = view.role === "detective" && view.waitingOn.includes(me);
    return { text: phaseText, sub: mine ? "Your team is setting up: place, then press Ready." : waiting.length ? `Waiting for ${waiting.join(", ")}` : "The detectives are setting up…", colour: "#8fb0ff", mine };
  }
  if (t.kind === "thief") {
    const mine = game.thief.controller === me;
    return {
      text: mine ? "Your turn: sneak!" : "The thief is moving…",
      sub: mine ? (game.thief.cell === null ? "Pick a way in." : "Move 1 to 3 spaces.") : `Waiting for ${playerName(view, game.thief.controller)} (the thief)`,
      colour: THIEF.hex === "#34343f" ? "#ffc14d" : THIEF.hex,
      mine,
    };
  }
  if (t.kind === "detective") {
    const pawn = activePawn(game)!;
    const ch = character(pawn.character);
    const mine = pawn.controller === me;
    if (t.awaitingThief) {
      const thiefMine = game.thief.controller === me;
      return { text: thiefMine ? "Motion detectors! Answer or snip" : "Motion detectors triggered…", sub: thiefMine ? "" : `Waiting for ${playerName(view, game.thief.controller)} (the thief) to answer`, colour: "#ff6b81", mine: thiefMine };
    }
    const stage = !t.roll ? "rolling" : !t.moved && !t.acted ? "moving and acting" : !t.moved ? "moving" : "acting";
    return {
      text: mine ? `Your turn: ${ch.short}` : `${ch.short}'s turn`,
      sub: mine ? (!t.roll ? "Roll the dice." : "Move and use your action, in either order.") : `Waiting for ${playerName(view, pawn.controller)} (${pawnName(game, pawn.id)}) · ${stage}`,
      colour: ch.hex,
      mine,
    };
  }
  return { text: "", sub: "", colour: "#fff", mine: false };
}

export function TurnBar({ view, game }: { view: RoomView; game: GameView }) {
  const ui = useGameUi();
  const turn = whoseTurn(view, game);
  const setCam = (camera: CameraPreset) => {
    useGameUi.getState().set({ camera, cameraNonce: ui.cameraNonce + 1 });
    sfx.menuMove();
  };
  const iAmThief = view.role === "thief";
  const heatOn = game.rules.assist === "overlay" && view.role === "detective";

  return (
    <header className="turnbar">
      <div className="turnbar-stats">
        <span className="chip gold" title="Thief turns">
          <Icon name="footprints" size={14} /> T{game.thief.turns}
          {game.rules.dawnAfterThiefTurns > 0 && `/${game.rules.dawnAfterThiefTurns}`}
        </span>
        <span className="chip gold" title="Paintings stolen (as far as you know)">
          <Icon name="frame" size={14} /> {game.thief.haul}/{game.rules.minPaintingsToEscape}
        </span>
        <span className="chip" title="Wire snips left">
          <Icon name="scissors" size={14} /> {game.thief.snipsLeft}
        </span>
        <span className={`chip ${game.power.cut ? "alarm" : "mint"}`} title={game.power.cut ? (iAmThief && !game.power.discovered ? "Power cut (secret)" : "Power out") : "Power on"}>
          <Icon name="bolt" size={14} /> {game.power.cut ? (iAmThief && !game.power.discovered ? "Cut 🔒" : "Out") : "On"}
        </span>
        {game.thief.revealed && game.phase === "play" && <span className="chip alarm pulse">CHASE</span>}
      </div>

      <div data-hud="band" className={`turnbar-main${turn.mine ? " mine" : ""}`} style={{ ["--c" as string]: turn.colour }} aria-live="polite">
        <span className="turn-dot" />
        <div>
          <div className="turn-text">{turn.text}</div>
          {turn.sub && <div className="turn-sub">{turn.sub}</div>}
        </div>
        <ClockChip view={view} />
      </div>

      <div className="turnbar-tools">
        <div className="seg compact" role="group" aria-label="Camera">
          <button aria-pressed={ui.camera === "overview"} onClick={() => setCam("overview")} title="Overview (1)">
            1
          </button>
          <button aria-pressed={ui.camera === "top"} onClick={() => setCam("top")} title="Top-down (2 / T)">
            2
          </button>
          <button aria-pressed={ui.camera === "focus"} onClick={() => setCam("focus")} title="Focus on my pawn (F)">
            F
          </button>
        </div>
        {iAmThief && (
          <button className={`btn small icon ${ui.danger ? "danger" : ""}`} aria-pressed={ui.danger} title="Danger overlay (D)" onClick={() => ui.set({ danger: !ui.danger })}>
            <Icon name="eye" size={18} />
          </button>
        )}
        {heatOn && (
          <button className={`btn small icon ${ui.heat ? "primary" : ""}`} aria-pressed={ui.heat} title="Possible thief locations (H)" onClick={() => ui.set({ heat: !ui.heat })}>
            <Icon name="target" size={18} />
          </button>
        )}
        {iAmThief && (
          <button className={`btn small icon ${ui.padOpen ? "primary" : ""}`} aria-pressed={ui.padOpen} title="Plotting pad (P)" onClick={() => ui.set({ padOpen: !ui.padOpen })}>
            <Icon name="pad" size={18} />
          </button>
        )}
        <button className={`btn small icon ${ui.logOpen ? "primary" : ""}`} aria-pressed={ui.logOpen} title="Log (L)" onClick={() => ui.set({ logOpen: !ui.logOpen })}>
          <Icon name="layers" size={18} />
        </button>
        <MuteButton />
        <button className="btn small icon" title="Menu (Esc)" aria-label="Menu" onClick={() => ui.set({ paused: true })}>
          <Icon name="gear" size={18} />
        </button>
      </div>
    </header>
  );
}

export function ClockChip({ view }: { view: RoomView }) {
  const [, tick] = useState(0);
  const clock = view.clock;
  useEffect(() => {
    if (!clock) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [clock]);
  if (!clock) return null;
  if (clock.autoplay) return <span className="chip alarm">Time's up: bot finishing</span>;
  const left = clock.deadline !== null ? Math.max(0, clock.deadline - serverNow()) : (clock.pausedLeft ?? 0);
  const secs = Math.ceil(left / 1000);
  const low = secs <= 10 && clock.deadline !== null;
  return (
    <span className={`chip clock ${low ? "alarm pulse" : "dim"}`} title={clock.deadline === null ? "Paused" : "Time left"}>
      <Icon name="timer" size={14} /> {clock.deadline === null ? "paused" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}
    </span>
  );
}
