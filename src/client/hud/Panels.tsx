// Smaller HUD pieces: the motion-detector prompt (thief), cinematic banners, the event log, emotes.

import { useEffect, useMemo, useRef, useState } from "react";
import { COLOUR_LABEL, colourOf, getBoard } from "../../shared/board/model";
import { MOTION_RESPONSE_MS } from "../../shared/game/config";
import type { GameView } from "../../shared/game/views";
import { EMOTES, type RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { activePawn, pawnHex, pawnName } from "../game/derive";
import { buildLog, relativeTime, type LogLine, type Part } from "../game/narrate";
import { skipFx, useFx } from "../game/present";
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

/** Re-renders every `ms` so relative times keep ticking. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** One styled noun in a log sentence (see `Part` in present.ts). */
function PartView({ part }: { part: Part }) {
  if (typeof part === "string") return <>{part}</>;
  switch (part.k) {
    case "det":
      return (
        <b className="p-det" style={{ ["--c" as string]: part.hex }}>
          <i className="p-dot" />
          {part.t}
        </b>
      );
    case "thief":
      return (
        <b className="p-thief">
          <Icon name="mask" size={13} />
          {part.t}
        </b>
      );
    case "place":
      return (
        <b className="p-place" data-floor={part.colour ?? "grey"}>
          {part.t}
        </b>
      );
    case "num":
      return <b className="p-num">{part.t}</b>;
    case "art":
      return <em className="p-art">{part.t}</em>;
    case "act":
      return <b className="p-act">{part.t}</b>;
    case "res":
      return <b className={`p-res tone-${part.tone ?? "info"}`}>{part.t}</b>;
  }
}

interface LogGroup {
  key: string;
  turn: number;
  /** "thief", a detective pawn id, or "setup". */
  actor: string;
  /** First group of its turn: draws the turn heading. */
  heading: boolean;
  lines: LogLine[];
}

/** Turn headings, then one rail per actor (the thief, or a detective) holding their lines in order. */
function groupLog(lines: LogLine[]): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const l of lines) {
    const actor = l.turn === 0 ? "setup" : (l.pawn ?? "thief");
    const last = groups[groups.length - 1];
    if (last && last.turn === l.turn && last.actor === actor) {
      last.lines.push(l);
      continue;
    }
    groups.push({ key: `${l.turn}:${actor}:${l.seq}`, turn: l.turn, actor, heading: !last || last.turn !== l.turn, lines: [l] });
  }
  return groups;
}

export function LogPanel({ view, game }: { view: RoomView; game: GameView }) {
  const open = useGameUi((s) => s.logOpen);
  const set = useGameUi((s) => s.set);
  const lines = useMemo(() => buildLog({ view, game }), [view, game]);
  const groups = useMemo(() => groupLog(lines), [lines]);
  const now = useNow(5000);
  const end = useRef<HTMLDivElement>(null);
  const iAmThief = view.role === "thief";
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, open]);
  if (!open) return null;
  const lastSeq = lines.length ? lines[lines.length - 1].seq : -1;
  return (
    <aside className="log-panel panel glass" data-hud="side" aria-label="Case notes">
      <div className="log-head">
        <Icon name="pad" size={20} className="log-head-icon" />
        <b>Case notes</b>
        {game.phase === "roundOver" && <span className="chip gold">Full log revealed</span>}
        <span className="spacer" />
        <button className="btn small icon ghost" aria-label="Close log" onClick={() => set({ logOpen: false })}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="log-lines scroll" aria-live="polite">
        {lines.length === 0 && <p className="log-empty">Nothing to report yet.</p>}
        {groups.map((g) => (
          <div key={g.key} className="log-section">
            {g.heading && g.turn > 0 && (
              <div className="log-turn">
                <span>Turn</span>
                <b>{g.turn}</b>
              </div>
            )}
            {g.actor !== "setup" && (
              <div className={`log-actor ${g.actor === "thief" ? "is-thief" : "is-det"}`} style={g.actor === "thief" ? undefined : { ["--c" as string]: pawnHex(game, g.actor) }}>
                {g.actor === "thief" ? <Icon name="mask" size={14} /> : <i className="p-dot" />}
                {g.actor === "thief" ? (iAmThief ? "You" : "The thief") : `${pawnName(game, g.actor)}'s turn`}
              </div>
            )}
            <div className={`log-group${g.actor === "thief" ? " is-thief" : g.actor === "setup" ? " is-setup" : " is-det"}`} style={g.actor === "thief" || g.actor === "setup" ? undefined : { ["--c" as string]: pawnHex(game, g.actor) }}>
              {g.lines.map((l) => (
                <div key={l.seq} className={`log-line tone-${l.tone}${l.secret ? " secret" : ""}${l.seq === lastSeq ? " latest" : ""}${l.at && now - l.at < 4000 ? " fresh" : ""}`} data-kind={l.kind}>
                  <span className="log-ico" title={l.secret ? "Only you know this" : undefined}>
                    <Icon name={l.icon} size={16} />
                    {l.secret && <Icon name="lock" size={10} className="log-lock" />}
                  </span>
                  <span className="log-text">
                    {l.parts.map((p, i) => (
                      <PartView key={i} part={p} />
                    ))}
                  </span>
                  {l.at ? (
                    <time className="log-time" dateTime={new Date(l.at).toISOString()} title={new Date(l.at).toLocaleTimeString()}>
                      {relativeTime(l.at, now)}
                    </time>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </aside>
  );
}

/** Whether the device is driven by touch (no Shift key for the mark gesture). */
export const touchFirst = () => typeof matchMedia === "function" && matchMedia("(any-pointer: coarse)").matches;

/** Whether detectives get the Pin / Mark switch: only where suspect marks are on and there's no Shift key. */
export function showsPointerToggle(view: RoomView, game: GameView) {
  return view.role === "detective" && game.phase !== "roundOver" && game.rules.assist !== "off" && touchFirst();
}

/** Touch detectives: picks what a long-press drops (a team pin, or the persistent suspect mark). */
export function PointerToggle() {
  const mode = useGameUi((s) => s.pointerMode);
  const set = useGameUi((s) => s.set);
  const mark = mode === "mark";
  return (
    <button
      className={`btn small pointer-toggle${mark ? " on" : ""}`}
      aria-pressed={mark}
      title="What a long-press drops on the board"
      onClick={() => {
        set({ pointerMode: mark ? "pin" : "mark" });
        sfx.menuMove();
      }}
    >
      {mark ? "❓ Mark" : "📍 Pin"}
    </button>
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
