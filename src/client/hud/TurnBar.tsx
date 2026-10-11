// Top bar: round status chips, a big "whose turn" line with who we're waiting on and why, the clock,
// and view controls (camera presets, overlays, pad, log, pause).

import { useEffect, useState } from "react";
import { character, THIEF } from "../../shared/characters";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { tip } from "../components/Tip";
import { VolumeControl } from "../components/VolumeControl";
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
  const heatOn = game.rules.assist === "overlay" && (view.role === "detective" || view.role === "spectator");
  // Normally one, but rooms from before the cap can hold more.
  const watchers = view.spectators.filter((w) => w.connected);
  const watcherNames = watchers.map((w) => (w.id === view.you ? "You" : w.name)).join(", ");
  const watcherLabel = watchers.length === 1 && watchers[0].id === view.you ? "You're watching" : `${watcherNames} ${watchers.length === 1 ? "is" : "are"} watching`;
  const dawn = game.rules.dawnAfterThiefTurns;
  const powerLabel = game.power.cut ? (iAmThief && !game.power.discovered ? "Power cut (secret)" : "Power out") : "Power on";

  return (
    <header className="turnbar">
      <div className="turnbar-stats" role="group" aria-label="Thief stats">
        <span
          className="chip gold"
          tabIndex={0}
          aria-label={`Thief turns: ${game.thief.turns}${dawn > 0 ? ` of ${dawn}` : ""}`}
          {...tip(
            "Thief turns",
            dawn > 0
              ? `How many moves the thief has made this round. If they're still free after turn ${dawn}, dawn breaks and the detectives win.`
              : "How many moves the thief has made this round. The longer it runs, the more the detectives learn.",
          )}
        >
          <Icon name="footprints" size={14} /> T{game.thief.turns}
          {dawn > 0 && `/${dawn}`}
        </span>
        <span
          className="chip gold"
          tabIndex={0}
          aria-label={`Paintings stolen: ${game.thief.haul} of ${game.rules.minPaintingsToEscape} needed`}
          {...tip(
            "Paintings stolen",
            iAmThief
              ? `You need ${game.rules.minPaintingsToEscape} paintings before an exit will let you out. Step onto one to take it.`
              : `The thief needs ${game.rules.minPaintingsToEscape} paintings before they can escape. This counts the ones you know have gone.`,
          )}
        >
          <Icon name="frame" size={14} /> {game.thief.haul}/{game.rules.minPaintingsToEscape}
        </span>
        <span
          className="chip"
          tabIndex={0}
          aria-label={`Wire snips left: ${game.thief.snipsLeft}`}
          {...tip("Wire snips left", "When motion detectors go off, the thief can snip the wires instead of telling you their floor colour. Only 2 snips per round, and everyone sees them.")}
        >
          <Icon name="scissors" size={14} /> {game.thief.snipsLeft}
        </span>
        <span
          className={`chip ${game.power.cut ? "alarm" : "mint"}`}
          tabIndex={0}
          aria-label={`Power: ${powerLabel}`}
          {...tip(
            powerLabel,
            game.power.cut
              ? iAmThief && !game.power.discovered
                ? "You cut it, and no one has noticed yet. Cameras and motion detectors are dead until a detective steps on the power switch."
                : "Cameras and motion detectors don't work. A detective can restore it by ending a move on the power switch."
              : "Cameras and motion detectors are working. The thief can cut the power from the switch in the Power Room.",
          )}
        >
          <Icon name="bolt" size={14} /> {game.power.cut ? (iAmThief && !game.power.discovered ? "Cut 🔒" : "Out") : "On"}
        </span>
        {watchers.length > 0 && (
          <span
            className="chip dim"
            tabIndex={0}
            aria-label={watcherLabel}
            {...tip(watcherLabel, "A spectator follows along from the detectives' side. They can't see the thief or play, and they can't affect the game.")}
          >
            <Icon name="eye" size={14} />
          </span>
        )}
        {game.thief.revealed && game.phase === "play" && (
          <span className="chip alarm pulse" tabIndex={0} {...tip("Chase!", "A detective spotted the thief. Their pawn stays on the board and every move is public, and paintings vanish the moment they land on one.")}>
            CHASE
          </span>
        )}
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
          <button aria-pressed={ui.camera === "overview"} onClick={() => setCam("overview")} {...tip("Overview", "The whole museum from a three-quarter angle.", "1")}>
            1
          </button>
          <button aria-pressed={ui.camera === "top"} onClick={() => setCam("top")} {...tip("Top-down", "A straight-down map view, easiest for counting spaces.", "2 / T")}>
            2
          </button>
          <button aria-pressed={ui.camera === "focus"} onClick={() => setCam("focus")} {...tip("Focus", "Zoom in close on your own pawn.", "F")}>
            F
          </button>
        </div>
        {iAmThief && (
          <button
            className={`btn small icon ${ui.danger ? "danger" : ""}`}
            aria-pressed={ui.danger}
            aria-label="Danger overlay"
            {...tip("Danger overlay", "Marks the spaces cameras and detectives can see right now, so you know where not to end a move.", "D")}
            onClick={() => ui.set({ danger: !ui.danger })}
          >
            <Icon name="eye" size={18} />
          </button>
        )}
        {heatOn && (
          <button
            className={`btn small icon ${ui.heat ? "primary" : ""}`}
            aria-pressed={ui.heat}
            aria-label="Possible thief locations"
            {...tip("Where could they be?", "Shades the spaces the thief could be in, darker where it's more likely, based on everything the team has learned.", "H")}
            onClick={() => ui.set({ heat: !ui.heat })}
          >
            <Icon name="target" size={18} />
          </button>
        )}
        {iAmThief && (
          <button
            className={`btn small icon ${ui.padOpen ? "primary" : ""}`}
            aria-pressed={ui.padOpen}
            aria-label="Plotting pad"
            {...tip("Plotting pad", "Your secret map: your trail, the paintings, camera status and your snips. Nobody else sees it.", "P")}
            onClick={() => ui.set({ padOpen: !ui.padOpen })}
          >
            <Icon name="pad" size={18} />
          </button>
        )}
        <button
          className={`btn small icon ${ui.logOpen ? "primary" : ""}`}
          aria-pressed={ui.logOpen}
          aria-label="Case notes"
          {...tip("Case notes", "A running log of everything that's happened this round.", "L")}
          onClick={() => ui.set({ logOpen: !ui.logOpen })}
        >
          <Icon name="layers" size={18} />
        </button>
        <VolumeControl />
        <button className="btn small icon" aria-label="Menu" {...tip("Menu", "Pause menu: settings, how to play, leave the room. The game keeps going for everyone else.", "Esc")} onClick={() => ui.set({ paused: true })}>
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
    <span className={`chip clock ${low ? "alarm pulse" : "dim"}`} {...tip(clock.deadline === null ? "Timer paused" : "Time left", "The host's turn timer. When it runs out, a bot finishes the turn for you.", undefined, "bottom")}>
      <Icon name="timer" size={14} /> {clock.deadline === null ? "paused" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}
    </span>
  );
}
