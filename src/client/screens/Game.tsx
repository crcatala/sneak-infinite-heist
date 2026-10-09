// The game screen: the 3D board plus the HUD. Feeds new events to the presentation player and
// handles keyboard shortcuts (see the How to Play page for the full list).

import { useEffect, useRef } from "react";
import { cellOf, getBoard, xyOf } from "../../shared/board/model";
import { ActionPanel } from "../hud/ActionPanel";
import { Announcer } from "../hud/Announcer";
import { DiceTray } from "../hud/DiceTray";
import { BannerLayer, EmoteBar, LogPanel, MotionPrompt } from "../hud/Panels";
import { PauseMenu, RoundOver } from "../hud/RoundOver";
import { ThiefPad } from "../hud/ThiefPad";
import { TurnBar } from "../hud/TurnBar";
import { activePawn } from "../game/derive";
import { useBoardInteraction } from "../game/interact";
import { ingest, resetPlayer, setFastForward, skipFx, useFx } from "../game/present";
import { useGameUi } from "../game/uiStore";
import { GameScene } from "../scene/GameScene";
import { setMusic } from "../sfx";
import { useStore } from "../store";

export function Game() {
  const view = useStore((s) => s.view)!;
  const game = view.game!;
  const ix = useBoardInteraction(view, game);
  const showResult = useFx((s) => s.showResult && !s.playing && !s.banner);
  const lastMax = useRef(-1);

  // Feed events to the player; a new round (sequence numbers restart) resets it.
  useEffect(() => {
    const max = game.events.length ? game.events[game.events.length - 1].seq : 0;
    if (max < lastMax.current) {
      resetPlayer();
      useGameUi.getState().resetTurn();
      useGameUi.getState().set({ replayTurn: null });
    }
    lastMax.current = max;
    ingest({ view, game });
  }, [view, game]);

  useEffect(() => () => resetPlayer(), []);

  useEffect(() => {
    if (game.phase === "play") setMusic(game.thief.revealed ? "chase" : "calm");
  }, [game.phase, game.thief.revealed]);

  // A new turn clears stale selections.
  const turnKey = `${game.phase}:${game.thief.turns}:${game.turn.kind}:${game.turn.kind === "detective" ? game.turn.pawn : ""}`;
  useEffect(() => {
    useGameUi.getState().resetTurn();
  }, [turnKey]);

  // Keyboard "click" on the board cursor uses the current interaction.
  useEffect(() => {
    (window as unknown as { __boardClick?: (c: number) => void }).__boardClick = ix.click;
  }, [ix]);

  useKeys();
  useHudWatch();

  return (
    <div className={`screen game-screen role-${view.role ?? "spectator"}${game.power.cut ? " dark" : ""}`}>
      <GameScene view={view} game={game} ix={ix} />
      <TurnBar view={view} game={game} />
      {view.role === "thief" && game.phase !== "roundOver" && <ThiefPad game={game} />}
      <LogPanel view={view} game={game} />
      {!showResult && <ActionPanel view={view} game={game} ix={ix} />}
      <DiceTray />
      <Announcer active={game.phase === "play" || game.phase === "roundOver"} />
      <BannerLayer />
      <MotionPrompt view={view} game={game} />
      {game.phase === "roundOver" && showResult && <RoundOver view={view} game={game} />}
      <EmoteBar view={view} />
      <PauseMenu view={view} />
      {view.role === "spectator" && <div className="peek-badge watching-badge">👀 Watching: public information only</div>}
      {view.viewAs && <div className="peek-badge">Peeking as {view.viewAs} (debug)</div>}
    </div>
  );
}

/**
 * Tells the camera when the HUD has moved. It polls the tagged panels' positions and only reports a
 * layout that has held still for two ticks, so panels mid-glide don't make the board chase them.
 */
function useHudWatch() {
  useEffect(() => {
    let previous = "";
    let applied = "";
    const id = setInterval(() => {
      const sig =
        [...document.querySelectorAll<HTMLElement>("[data-hud]")]
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${el.dataset.hud}:${[r.left, r.top, r.right, r.bottom].map((n) => Math.round(n / 8)).join(",")}`;
          })
          .join("|") + `|${innerWidth}x${innerHeight}`;
      if (sig === previous && sig !== applied) {
        applied = sig;
        useGameUi.setState((s) => ({ hudNonce: s.hudNonce + 1 }));
      }
      previous = sig;
    }, 200);
    return () => clearInterval(id);
  }, []);
}

function useKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const store = useStore.getState();
      const view = store.view;
      const game = view?.game;
      const ui = useGameUi.getState();
      if (!view || !game) return;
      if (ui.paused) return;
      const send = store.send;
      const k = e.key;
      const fx = useFx.getState();

      // Skip / fast-forward cinematics.
      if (k === " " && (fx.playing || fx.banner)) {
        e.preventDefault();
        if (!e.repeat) skipFx();
        setFastForward(true);
        return;
      }
      if (k === "Escape") {
        e.preventDefault();
        if (fx.banner) return skipFx();
        if (ui.eyeTarget !== null) return ui.set({ eyeTarget: null, eyePreview: null });
        if (ui.held) return ui.set({ held: null });
        if (ui.moveDest !== null) return ui.set({ moveDest: null });
        if (ui.plan.dest !== null) return ui.set({ plan: { ...ui.plan, dest: null, path: null } });
        if (ui.plan.entry && game.thief.cell === null) return ui.set({ plan: { ...ui.plan, entry: null } });
        return ui.set({ paused: true });
      }
      if (k === "1") return ui.set({ camera: "overview", cameraNonce: ui.cameraNonce + 1 });
      if (k === "2" || k === "t" || k === "T") return ui.set({ camera: "top", cameraNonce: ui.cameraNonce + 1 });
      if (k === "f" || k === "F") return ui.set({ camera: "focus", cameraNonce: ui.cameraNonce + 1 });
      if (k === "l" || k === "L") return ui.set({ logOpen: !ui.logOpen });
      if ((k === "p" || k === "P") && view.role === "thief") return ui.set({ padOpen: !ui.padOpen });
      if ((k === "d" || k === "D") && view.role === "thief") return ui.set({ danger: !ui.danger });
      if ((k === "h" || k === "H") && view.role === "detective") return ui.set({ heat: !ui.heat });

      // Board cursor with the arrow keys; Enter "clicks" it.
      const board = getBoard(game.board);
      if (k.startsWith("Arrow")) {
        e.preventDefault();
        const start = ui.cursor ?? ui.hover ?? activePawn(game)?.cell ?? game.thief.cell ?? cellOf(board, 6, 6);
        const [x, y] = xyOf(board, start);
        const nx = Math.max(0, Math.min(board.width - 1, x + (k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0)));
        const ny = Math.max(0, Math.min(board.height - 1, y + (k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0)));
        const cell = cellOf(board, nx, ny);
        ui.set({ cursor: cell, hover: cell, hoverSlot: board.slots.find((s) => s.cell === cell)?.id ?? null });
        return;
      }

      const t = game.turn;
      const myDet = t.kind === "detective" && activePawn(game)?.controller === view.you && !t.awaitingThief;
      if (k === "Enter" && myDet && t.roll?.action === "eye" && !t.acted && ui.eyeTarget !== null) {
        e.preventDefault();
        send({ t: "game", action: { a: "eye", target: ui.eyeTarget } });
        return ui.set({ eyeTarget: null, eyePreview: null });
      }
      if (k === "Enter" || k === " ") {
        // Primary action for the moment.
        if (k === "Enter" && ui.cursor !== null && !(view.role === "thief" && ui.plan.dest === ui.cursor) && ui.moveDest !== ui.cursor) {
          e.preventDefault();
          (window as unknown as { __boardClick?: (c: number) => void }).__boardClick?.(ui.cursor);
          return;
        }
        if (myDet && !t.roll) {
          e.preventDefault();
          return send({ t: "game", action: { a: "roll" } });
        }
        if (myDet && ui.moveDest !== null) {
          e.preventDefault();
          send({ t: "game", action: { a: "move", dest: ui.moveDest } });
          return ui.set({ moveDest: null });
        }
        if (game.phase.startsWith("setup") && view.role === "detective" && k === "Enter") {
          e.preventDefault();
          return send({ t: "game", action: { a: "setupReady", ready: !game.ready[view.you] } });
        }
        return;
      }
      if (myDet && t.roll && !t.acted) {
        // Eye is a two-step: these pick the target, and Enter (or the Confirm button) asks it.
        if ((k === "e" || k === "E") && t.roll.action === "eye") return ui.set({ eyeTarget: "self", eyePreview: "self" });
        if (e.shiftKey && /^Digit[1-6]$/.test(e.code) && t.roll.action === "eye") {
          const n = Number(e.code.slice(5));
          if (game.power.cut || !game.cameras.some((c) => c.n === n)) return;
          return ui.set({ eyeTarget: n, eyePreview: n });
        }
        if ((k === "s" || k === "S") && t.roll.action === "scan") return send({ t: "game", action: { a: "scan" } });
        if ((k === "m" || k === "M") && t.roll.action === "motion") return send({ t: "game", action: { a: "motion" } });
        if (k === "x" || k === "X") return send({ t: "game", action: { a: "skipAction" } });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setFastForward(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}
