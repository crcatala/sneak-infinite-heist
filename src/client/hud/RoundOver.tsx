// Round end: the result, stats, a replay of the thief's secret path with a timeline scrubber (on the
// pad map and the 3D board), then "Next round" or the match standings. Plus the pause menu.

import { useEffect, useMemo, useState } from "react";
import { ARTWORKS, character } from "../../shared/characters";
import { getBoard } from "../../shared/board/model";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { tip } from "../components/Tip";
import { MenuList, type MenuItem } from "../components/Menu";
import { SettingsPanel } from "../components/SettingsPanel";
import { pawnHex, pawnName, playerName, slotLabel } from "../game/derive";
import { buildReplay, movesUpTo, positionsAt } from "../game/replay";
import { useGameUi } from "../game/uiStore";
import { navigate } from "../router";
import { useStore } from "../store";
import { PadMap, type PadDetectives } from "./ThiefPad";

export function RoundOver({ view, game }: { view: RoomView; game: GameView }) {
  const send = useStore((s) => s.send);
  const me = view.players.find((p) => p.id === view.you);
  const result = game.result!;
  const board = getBoard(game.board);
  const trail = game.thief.trail ?? [];
  const [turn, setTurn] = useState(trail.length);
  const [playing, setPlaying] = useState(false);
  const showDetectives = useGameUi((s) => s.replayDetectives);
  const rounds = useMemo(() => buildReplay({ view, game }), [view, game]);
  const thiefWon = result.winner === "thief";
  const iWasThief = view.role === "thief";
  const iWon = iWasThief === thiefWon;
  const match = view.match;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTurn((t) => (t >= trail.length ? (setPlaying(false), t) : t + 1)), 700);
    return () => clearInterval(id);
  }, [playing, trail.length]);

  useEffect(() => {
    useGameUi.getState().set({ replayTurn: turn });
  }, [turn]);

  const headline = result.reason === "escaped" ? "The thief escaped!" : result.reason === "captured" ? "The thief was nabbed!" : "Dawn: the museum opens!";
  const step = trail[turn - 1];
  const detectives = useMemo<PadDetectives | undefined>(() => {
    if (!showDetectives) return undefined;
    return {
      moves: movesUpTo(rounds, turn).map(({ move, latest }) => ({ pawn: move.pawn, from: move.from, path: move.path, hex: pawnHex(game, move.pawn), latest })),
      pawns: Object.entries(positionsAt(rounds, turn)).map(([pawn, cell]) => ({
        pawn,
        cell,
        hex: pawnHex(game, pawn),
        initial: character(game.detectives.find((d) => d.id === pawn)!.character).short[0],
      })),
    };
  }, [showDetectives, rounds, turn, game]);
  // What the detective did in reply to this thief turn (the rolls are noise next to their results).
  const replies = showDetectives ? (rounds[turn]?.lines.filter((l) => l.kind !== "roll") ?? []) : [];
  const moreRounds = !!match && match.mode === "match" && !match.done;

  const replayNotes = trail.length > 0 && (
    <div className="replay-notes">
      <label className="replay-toggle small">
        <button
          className="switch"
          role="switch"
          aria-checked={showDetectives}
          aria-label="Show the detectives' moves"
          onClick={() => useGameUi.getState().set({ replayDetectives: !showDetectives })}
        />
        Show the detectives' moves
      </label>
      <p className="small muted replay-caption">
        {step
          ? `${step.entry ? `Entered by ${slotLabel(board, step.entry)}, ` : ""}moved ${step.path.length}${step.stole !== undefined ? `, stole "${ARTWORKS[step.stole].title}"` : ""}${step.disabledCamera ? `, disabled camera ${step.disabledCamera}` : ""}${step.cutPower ? ", cut the power" : ""}${step.triedLock ? `, tried lock ${step.triedLock.slot.toUpperCase()} (${step.triedLock.face})` : ""}${step.public ? " (in plain sight)" : ""}.`
          : "Scrub through the thief's secret path."}
      </p>
      {showDetectives && (
        <ul className="replay-replies small" aria-label="What the detectives did next">
          {replies.length === 0 ? (
            <li className="muted">{turn === 0 ? "The detectives are at their posts." : "The detectives did nothing of note."}</li>
          ) : (
            replies.map((l) => (
              <li key={l.seq} data-tone={l.tone}>
                <i className="replay-dot" style={{ background: l.hex ?? "var(--moon-200)" }} />
                {l.text}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );

  return (
    <div className="round-over">
      <div className={`round-card panel glass ${iWon ? "won" : "lost"}`}>
        <header className="round-head">
          <p className="label">{match?.mode === "match" ? `Round ${match.round + 1} of ${match.total}` : "Round over"}</p>
          <h1 className="round-headline">{headline}</h1>
          <p className="round-sub">
            {iWon ? "You win!" : "Better luck next time."} {playerName(view, game.thief.controller)} was the thief
            {result.reason === "escaped" ? ` and got out through the ${slotLabel(board, result.slot!)} with ${result.paintings} painting${result.paintings === 1 ? "" : "s"}.` : result.reason === "captured" ? `; ${pawnName(game, result.by!)} made the arrest.` : "."}
          </p>
        </header>

        <div className="round-stats">
          <Stat label="Thief turns" value={game.thief.turns} hint="How many moves the thief made." />
          <Stat label="Paintings" value={result.paintings} hint="Paintings the thief had stolen when the round ended." />
          <Stat label="Times spotted" value={game.thief.sightings} hint="How often a detective's eyes or a camera caught the thief." />
          <Stat label="Snips used" value={2 - game.thief.snipsLeft} hint="Motion-detector wires the thief snipped (of 2)." />
          <Stat label="Came in via" value={game.thief.entry ? game.thief.entry.toUpperCase() : "—"} hint="The window or door the thief sneaked in through." />
        </div>

        <div className={`round-body${trail.length > 0 ? " has-replay" : ""}`}>
          {trail.length > 0 && (
            <div className="replay">
              <div className="replay-map paper">
                <PadMap game={game} upTo={turn} detectives={detectives} />
              </div>
              <div className="replay-controls">
                <button className="btn small icon" aria-label={playing ? "Pause replay" : "Play replay"} {...tip(playing ? "Pause" : "Play the replay", "Steps through the thief's turns, one every moment.")} onClick={() => {
                  if (!playing && turn >= trail.length) setTurn(0);
                  setPlaying((p) => !p);
                }}>
                  <Icon name={playing ? "x" : "play"} size={16} />
                </button>
                <input type="range" min={0} max={trail.length} value={turn} onChange={(e) => (setPlaying(false), setTurn(Number(e.target.value)))} aria-label="Replay turn" style={{ ["--pct" as string]: `${(turn / trail.length) * 100}%` }} />
                <span className="small muted">{turn === 0 ? "Before entry" : `Turn ${turn}`}</span>
              </div>
            </div>
          )}

          <div className="round-side">
            {replayNotes}
            {match && match.mode === "match" && (
              <div className="standings">
                <div className="label">{match.done ? "Final standings" : "Standings"}</div>
                <ol>
                  {match.standings.map((s, i) => (
                    <li key={s.playerId} className={i === 0 && match.done ? "winner" : ""}>
                      <b>{playerName(view, s.playerId)}</b>
                      <span className="spacer" />
                      <span className="chip gold">{s.score} pts</span>
                    </li>
                  ))}
                </ol>
                {!match.done && <p className="faint small">Next thief: {playerName(view, match.thieves[match.round + 1])}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="action-row">
          <button className="btn ghost" onClick={() => navigate("/")}>
            <Icon name="exit" size={18} /> Leave
          </button>
          <span className="spacer" />
          {me?.isHost ? (
            <>
              <button className="btn" onClick={() => send({ t: "backToLobby" })}>
                Back to lobby
              </button>
              <button className="btn primary" autoFocus onClick={() => send({ t: "nextRound" })}>
                {moreRounds ? "Next round" : "Play again"} <Icon name="play" size={16} />
              </button>
            </>
          ) : (
            <span className="muted">Waiting for the host to continue…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="stat" tabIndex={0} {...tip(label, hint, undefined, "top")}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function PauseMenu({ view }: { view: RoomView }) {
  const paused = useGameUi((s) => s.paused);
  const set = useGameUi((s) => s.set);
  const send = useStore((s) => s.send);
  const [page, setPage] = useState<"main" | "settings">("main");
  const me = view.players.find((p) => p.id === view.you);
  if (!paused) return null;
  const away = view.players.filter((p) => !p.isBot && !p.connected && p.id !== view.you);
  const close = () => {
    set({ paused: false });
    setPage("main");
  };
  const items: MenuItem[] = [
    { id: "resume", label: "Resume", icon: "play", onSelect: close },
    { id: "settings", label: "Settings", icon: "gear", onSelect: () => setPage("settings") },
    { id: "how", label: "How to play", icon: "question", onSelect: () => window.open("/how-to-play", "_blank") },
    ...(me?.isHost
      ? away.map((p) => ({
          id: `bot-${p.id}`,
          label: p.botTakeover ? `Give ${p.name}'s seat back` : `Let a bot play for ${p.name}`,
          icon: "bot",
          hint: "they're away",
          onSelect: () => send({ t: "botTakeover", playerId: p.id, on: !p.botTakeover }),
        }))
      : []),
    { id: "leave", label: "Leave room", icon: "exit", onSelect: () => navigate("/") },
  ];
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal panel pause-menu" role="dialog" aria-label="Paused">
        {page === "main" ? (
          <>
            <h2>Paused</h2>
            <p className="muted small">The game keeps going for everyone else.</p>
            <MenuList items={items} onBack={close} />
          </>
        ) : (
          <>
            <div className="row">
              <button className="btn small icon ghost" aria-label="Back" onClick={() => setPage("main")}>
                <Icon name="back" />
              </button>
              <h2>Settings</h2>
            </div>
            <SettingsPanel onBack={() => setPage("main")} />
          </>
        )}
      </div>
    </div>
  );
}
