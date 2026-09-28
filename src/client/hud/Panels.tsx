// Smaller HUD pieces: the motion-detector prompt (thief), cinematic banners, the event log, emotes.

import { useEffect, useMemo, useRef, useState } from "react";
import { COLOUR_LABEL, colourOf, getBoard } from "../../shared/board/model";
import { MOTION_RESPONSE_MS } from "../../shared/game/config";
import type { GameView } from "../../shared/game/views";
import { EMOTES, type RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { activePawn, pawnName } from "../game/derive";
import { buildLog, skipFx, useFx } from "../game/present";
import { useGameUi } from "../game/uiStore";
import { drawPatternCss } from "./patterns";
import { sfx } from "../sfx";
import { serverNow, useStore } from "../store";

export function MotionPrompt({ view, game }: { view: RoomView; game: GameView }) {
  const send = useStore((s) => s.send);
  const [, tick] = useState(0);
  const t = game.turn;
  const open = view.role === "thief" && t.kind === "detective" && t.awaitingThief;
  useEffect(() => {
    if (!open) return;
    sfx.alarm();
    const id = setInterval(() => tick((n) => n + 1), 250);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A" || e.key === "Enter") send({ t: "game", action: { a: "motionResponse", snip: false } });
      if ((e.key === "s" || e.key === "S") && game.thief.snipsLeft > 0) send({ t: "game", action: { a: "motionResponse", snip: true } });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, send, game.thief.snipsLeft]);
  if (!open || game.thief.cell === null) return null;
  const board = getBoard(game.board);
  const colour = colourOf(board, game.thief.cell);
  const pawn = activePawn(game)!;
  const deadline = view.clock?.kind === "motion" ? view.clock.deadline : null;
  const left = deadline ? Math.max(0, deadline - serverNow()) : MOTION_RESPONSE_MS;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-labelledby="motion-title">
      <div className="modal panel motion-modal">
        <div className="motion-timer" style={{ ["--p" as string]: `${(left / MOTION_RESPONSE_MS) * 100}%` }} />
        <p className="label">Motion detectors</p>
        <h2 id="motion-title">
          Detective {pawnName(game, pawn.id)} triggered the motion detectors.
        </h2>
        <p className="motion-colour">
          You're on <span className={`colour-word floor-${colour}`} style={drawPatternCss(colour)}>{COLOUR_LABEL[colour].toUpperCase()}</span>
        </p>
        <div className="row">
          <button className="btn big" autoFocus onClick={() => send({ t: "game", action: { a: "motionResponse", snip: false } })}>
            Answer <span className="kbd">A</span>
          </button>
          <button className="btn big danger" disabled={game.thief.snipsLeft <= 0} onClick={() => send({ t: "game", action: { a: "motionResponse", snip: true } })}>
            <Icon name="scissors" /> Snip ({game.thief.snipsLeft} left) <span className="kbd">S</span>
          </button>
        </div>
        <p className="faint small">
          Snipping is public and you only have two for the whole round. {Math.ceil(left / 1000)}s left, then it answers for you.
        </p>
      </div>
    </div>
  );
}

export function BannerLayer() {
  const banner = useFx((s) => s.banner);
  if (!banner) return null;
  return (
    <div className={`cine-banner tone-${banner.tone}`} key={banner.id} onClick={skipFx} role="status">
      <div className="cine-text">{banner.text}</div>
      {banner.sub && <div className="cine-sub">{banner.sub}</div>}
      <div className="cine-skip faint small">click or Space to skip</div>
    </div>
  );
}

export function LogPanel({ view, game }: { view: RoomView; game: GameView }) {
  const open = useGameUi((s) => s.logOpen);
  const set = useGameUi((s) => s.set);
  const lines = useMemo(() => buildLog({ view, game }), [view, game]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, open]);
  if (!open) return null;
  return (
    <aside className="log-panel panel glass" aria-label="Game log">
      <div className="row">
        <b>Case notes</b>
        {game.phase === "roundOver" && <span className="chip gold">Full log revealed</span>}
        <span className="spacer" />
        <button className="btn small icon ghost" aria-label="Close log" onClick={() => set({ logOpen: false })}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="log-lines scroll" aria-live="polite">
        {lines.map((l, i) => (
          <div key={l.seq} className={`log-line tone-${l.tone}${l.secret ? " secret" : ""}`}>
            {(i === 0 || lines[i - 1].turn !== l.turn) && l.turn > 0 && <div className="log-turn">Thief turn {l.turn}</div>}
            <span className="log-icon">{l.secret ? "🔒" : l.icon}</span>
            <span>{l.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
    </aside>
  );
}

export function EmoteBar({ view }: { view: RoomView }) {
  const send = useStore((s) => s.send);
  const emotes = useStore((s) => s.emotes);
  const [open, setOpen] = useState(false);
  const solo = useStore((s) => s.mode === "solo");
  if (solo) return null;
  return (
    <>
      <div className="emote-float" aria-live="polite">
        {emotes.map((e) => (
          <div key={e.id} className="emote-bubble">
            <span>{e.emote}</span>
            <small>{view.players.find((p) => p.id === e.by)?.name}</small>
          </div>
        ))}
      </div>
      <div className="emote-bar">
        {open &&
          EMOTES.map((em) => (
            <button
              key={em}
              className="emote-btn"
              onClick={() => {
                send({ t: "emote", emote: em });
                sfx.emote();
                setOpen(false);
              }}
            >
              {em}
            </button>
          ))}
        <button className="btn small icon" aria-label="Emotes" title="Emotes" onClick={() => setOpen((v) => !v)}>
          😀
        </button>
      </div>
    </>
  );
}
