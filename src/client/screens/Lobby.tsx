// The lobby: share link, crew seats (humans + bots), detective picks, thief selection, host house
// rules with explanations, and a big ready button. Same screen for online rooms and solo mode.

import { useEffect, useMemo, useState } from "react";
import { CLASSIC_BOARD } from "../../shared/board/classic";
import { remixBoard } from "../../shared/board/remix";
import { BoardPreview } from "../components/BoardPreview";
import { CHARACTERS, character, THIEF } from "../../shared/characters";
import { DAWN_OPTIONS } from "../../shared/game/config";
import type { Player, RoomSettings } from "../../shared/roomTypes";
import { MAX_SEATS } from "../../shared/room";
import { copyText } from "../clipboard";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { VolumeControl } from "../components/VolumeControl";
import { withAlias } from "../identity";
import { navigate } from "../router";
import { sfx } from "../sfx";
import { useStore } from "../store";

export function Lobby() {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const solo = useStore((s) => s.mode === "solo");
  const me = view.players.find((p) => p.id === view.you);
  const watching = !me;
  const isHost = !!me?.isHost;
  const humans = view.players.filter((p) => !p.isBot);
  const waitingOn = humans.filter((p) => !p.ready);
  const s = view.settings;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
      if (e.key === "r" || e.key === "R") {
        send({ t: "setReady", ready: !me?.ready });
        sfx.menuSelect();
      }
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const leave = () => {
    sfx.menuBack();
    navigate("/");
  };

  const status = view.startBlocker
    ? view.startBlocker
    : waitingOn.length === 0
      ? "Everyone's ready: the heist begins!"
      : waitingOn.length === 1 && waitingOn[0].id === view.you
        ? "Waiting on you: ready up when you're set."
        : `Waiting for ${waitingOn.map((p) => p.name).join(", ")} to ready up.`;

  const soloRole = solo ? (view.hostThief === view.you ? "thief" : "detectives") : null;

  return (
    <div className="screen lobby-screen">
      <header className="lobby-top">
        <button className="lobby-logo" onClick={leave} aria-label="Back to the title">
          <Logo compact />
        </button>
        <div className="lobby-room">
          {solo ? (
            <span className="chip gold">
              <Icon name="bot" size={14} /> Solo heist · runs in your browser
            </span>
          ) : (
            <ShareCode code={view.code} />
          )}
        </div>
        <VolumeControl />
        <button className="btn small" onClick={leave}>
          <Icon name="exit" size={18} /> Leave
        </button>
      </header>

      <main className="lobby-grid scroll">
        {solo && (
          <section className="panel glass solo-banner">
            <div className="solo-banner-art" aria-hidden>
              {soloRole === "thief" ? "🦹" : "🕵️"}
            </div>
            <div>
              <h2>{soloRole === "thief" ? "You're the thief" : "You're on the case"}</h2>
              <p className="muted">
                {soloRole === "thief"
                  ? `Slip past ${view.players.length - 1} bot detective${view.players.length === 2 ? "s (two pawns)" : "s"}, grab at least ${s.rules.minPaintingsToEscape} paintings and find an unlocked exit.`
                  : `Track down a bot thief with ${view.players.length === 2 ? "two detective pawns" : `${view.players.length - 2} bot partner${view.players.length === 3 ? "" : "s"}`}. Land on the thief to make the arrest.`}
              </p>
            </div>
          </section>
        )}

        <section className="panel glass crew">
          <div className="section-head">
            <h2>The crew</h2>
            <span className="muted small">
              {view.players.length}/{MAX_SEATS} seats
            </span>
          </div>
          <ul className="seat-list">
            {view.players.map((p) => (
              <SeatCard key={p.id} player={p} isMe={p.id === view.you} canKick={isHost && p.id !== view.you && !solo} settings={s} hostThief={view.hostThief} />
            ))}
            {!solo &&
              Array.from({ length: MAX_SEATS - view.players.length }, (_, i) => (
                <li key={`open${i}`} className="seat open">
                  <span className="seat-avatar empty">
                    <Icon name="plus" />
                  </span>
                  <span className="seat-name faint">Open seat</span>
                  {isHost && i === 0 && (
                    <button className="btn small" onClick={() => send({ t: "addBot" })}>
                      <Icon name="bot" size={16} /> Add bot
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {view.spectators.length > 0 && (
            <div className="watchers">
              <span className="label">Watching</span>
              {view.spectators.map((w) => (
                <span key={w.id} className="chip dim">
                  <Icon name="eye" size={12} /> {w.name}
                  {w.id === view.you && " (you)"}
                </span>
              ))}
              {view.spectators.some((w) => w.id === view.you) && view.players.length < MAX_SEATS && (
                <button className="btn small primary" onClick={() => send({ t: "sit" })}>
                  Take a seat
                </button>
              )}
            </div>
          )}
          <ThiefPicker isHost={isHost} solo={solo} />
        </section>

        {(soloRole !== "thief" || !solo) && <CharacterPicker />}
        <RulesPanel isHost={isHost} />
      </main>

      <footer className="lobby-ready">
        <p className={`lobby-status ${view.startBlocker ? "warn" : ""}`}>{status}</p>
        <button
          className={`btn big ${me?.ready ? "mint" : "primary"}`}
          disabled={watching || (!!view.startBlocker && !me?.ready)}
          onClick={() => {
            send({ t: "setReady", ready: !me?.ready });
            sfx.menuSelect();
          }}
        >
          {solo ? (
            <>
              <Icon name="play" /> Start the heist
            </>
          ) : me?.ready ? (
            <>
              <Icon name="check" /> Ready!
            </>
          ) : (
            <>
              I'm ready <span className="kbd">R</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

function ShareCode({ code }: { code: string }) {
  const toast = useStore((s) => s.toast);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const url = `${location.origin}/r/${code}`;
  const copy = async (what: "code" | "link") => {
    if (await copyText(what === "code" ? code : url)) {
      setCopied(what);
      sfx.menuSelect();
      setTimeout(() => setCopied(null), 1500);
    } else toast("Couldn't copy: select it by hand.", "error");
  };
  return (
    <div className="share">
      <span className="label">Room</span>
      <button className="share-code" onClick={() => void copy("code")} title="Copy the room code">
        {code}
        <Icon name={copied === "code" ? "check" : "copy"} size={16} />
      </button>
      <button className="btn small" onClick={() => void copy("link")}>
        <Icon name={copied === "link" ? "check" : "link"} size={16} /> {copied === "link" ? "Copied!" : "Copy invite link"}
      </button>
    </div>
  );
}

function SeatCard({ player, isMe, canKick, settings, hostThief }: { player: Player; isMe: boolean; canKick: boolean; settings: RoomSettings; hostThief: string | null }) {
  const send = useStore((s) => s.send);
  const ch = player.character ? character(player.character) : null;
  const isThiefPick = settings.thiefSelection === "host" && hostThief === player.id;
  return (
    <li className={`seat${isMe ? " me" : ""}${player.connected ? "" : " offline"}`}>
      <span className="seat-avatar" style={{ ["--c" as string]: isThiefPick ? THIEF.hex : (ch?.hex ?? "#4a4390") }}>
        {isThiefPick ? <Icon name="mask" /> : player.isBot ? <Icon name="bot" /> : player.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="seat-name">
        <span className="seat-line">
          <b>{player.name}</b>
          {isMe && <span className="faint"> (you)</span>}
          {player.isHost && <Icon name="crown" size={16} className="crown" title="Host" />}
        </span>
        <span className="seat-sub faint small">{isThiefPick ? "The thief" : ch ? ch.name : "No detective picked"}</span>
      </span>
      <span className="seat-tags">
        {settings.thiefSelection === "volunteer" && player.volunteer && (
          <span className="chip gold">
            <Icon name="hand" size={12} /> Thief?
          </span>
        )}
        {!player.isBot && !player.connected && (
          <span className="chip alarm">
            <Icon name="offline" size={12} /> away
          </span>
        )}
        {player.isBot ? <span className="chip dim">bot</span> : player.ready ? <span className="chip mint">ready</span> : <span className="chip dim">not ready</span>}
      </span>
      {canKick && (
        <button className="btn small icon ghost" aria-label={`Remove ${player.name}`} onClick={() => send({ t: "kick", playerId: player.id })}>
          <Icon name="x" size={18} />
        </button>
      )}
    </li>
  );
}

function ThiefPicker({ isHost, solo }: { isHost: boolean; solo: boolean }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const me = view.players.find((p) => p.id === view.you)!;
  const sel = view.settings.thiefSelection;
  if (solo) return null;
  return (
    <div className="thief-picker">
      <div className="label">Who's the thief?</div>
      <div className="seg" role="group" aria-label="Thief selection">
        {(["random", "volunteer", "host"] as const).map((v) => (
          <button key={v} aria-pressed={sel === v} disabled={!isHost} onClick={() => send({ t: "settings", patch: { thiefSelection: v } })}>
            {v === "random" ? "Random" : v === "volunteer" ? "Volunteers" : "Host picks"}
          </button>
        ))}
      </div>
      {sel === "volunteer" && (
        <button className={`btn small ${me.volunteer ? "primary" : ""}`} onClick={() => send({ t: "volunteer", on: !me.volunteer })}>
          <Icon name="hand" size={16} /> {me.volunteer ? "You volunteered!" : "I want to be the thief"}
        </button>
      )}
      {sel === "host" && isHost && (
        <div className="row wrap">
          {view.players.map((p) => (
            <button key={p.id} className={`btn small ${view.hostThief === p.id ? "primary" : ""}`} onClick={() => send({ t: "setThief", playerId: p.id })}>
              <Icon name="mask" size={16} /> {p.name}
            </button>
          ))}
        </div>
      )}
      <p className="faint small">
        {sel === "random" && "Picked at random when everyone is ready (bots included)."}
        {sel === "volunteer" && "Picked from the volunteers (at random if there are several)."}
        {sel === "host" && (isHost ? "Tap a player to make them the thief." : "The host picks the thief.")}
        {view.settings.mode === "match" && " In a full match every human takes a turn as the thief."}
      </p>
    </div>
  );
}

function CharacterPicker() {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const me = view.players.find((p) => p.id === view.you)!;
  return (
    <section className="panel glass characters">
      <div className="section-head">
        <h2>Pick your detective</h2>
        <span className="muted small">If you end up the thief, you'll wear the mask.</span>
      </div>
      <div className="char-grid">
        {CHARACTERS.map((c) => {
          const owner = view.players.find((p) => p.character === c.id);
          const mine = owner?.id === me.id;
          return (
            <button
              key={c.id}
              className={`char-card${mine ? " picked" : ""}${owner && !mine ? " taken" : ""}`}
              style={{ ["--c" as string]: c.hex }}
              disabled={!!owner && !mine}
              aria-pressed={mine}
              onClick={() => {
                send({ t: "setCharacter", character: mine ? null : c.id });
                sfx.menuMove();
              }}
            >
              <span className="char-swatch" aria-hidden>
                <span className="char-pawn" />
              </span>
              <span className="char-name">{c.name}</span>
              <span className="char-blurb">{c.blurb}</span>
              {owner && <span className="char-owner">{mine ? "You" : owner.name}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RulesPanel({ isHost }: { isHost: boolean }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const s = view.settings;
  const r = s.rules;
  const set = (patch: Parameters<typeof send>[0] & { t: "settings" }) => send(patch);

  const Seg = <T extends string | number | boolean>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) => (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={value === v} disabled={!isHost} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel glass rules">
      <div className="section-head">
        <h2>House rules</h2>
        <span className="muted small">{isHost ? "You're the host: tweak away." : "Only the host can change these."}</span>
      </div>
      <dl className="rule-list">
        <LayoutRule isHost={isHost} />
        <Rule name="Game length" help="One round, or a full match where every player is the thief once and the biggest haul wins.">
          <Seg value={s.mode} options={[["single", "Single round"], ["match", "Full match"]]} onPick={(mode) => set({ t: "settings", patch: { mode } })} />
        </Rule>
        <Rule name="Paintings to escape" help="How many paintings the thief must hold before trying a lock.">
          <div className="stepper">
            <button className="btn small icon" disabled={!isHost || r.minPaintingsToEscape <= 1} onClick={() => set({ t: "settings", patch: { rules: { minPaintingsToEscape: r.minPaintingsToEscape - 1 } } })} aria-label="Fewer">
              −
            </button>
            <b>{r.minPaintingsToEscape}</b>
            <button className="btn small icon" disabled={!isHost || r.minPaintingsToEscape >= 9} onClick={() => set({ t: "settings", patch: { rules: { minPaintingsToEscape: r.minPaintingsToEscape + 1 } } })} aria-label="More">
              +
            </button>
          </div>
        </Rule>
        <Rule name="Locks" help="6 open and 5 locked. Shuffled face down, or placed by the detectives, who then know which exits are open.">
          <Seg value={r.lockPlacement} options={[["random", "Shuffled"], ["detectives", "Detectives place"]]} onPick={(lockPlacement) => set({ t: "settings", patch: { rules: { lockPlacement } } })} />
        </Rule>
        <Rule name="Stay put on a 1" help="Designers disagreed! When on, a detective who rolls a 1 may stay where they are.">
          <Seg value={r.detectiveMayStay} options={[[false, "Must move"], [true, "May stay"]]} onPick={(detectiveMayStay) => set({ t: "settings", patch: { rules: { detectiveMayStay } } })} />
        </Rule>
        <Rule name="Turn timer" help="When time runs out, a bot finishes the turn. The clock pauses if that player drops out.">
          <Seg value={s.turnTimerSec} options={[[0, "Off"], [60, "60s"], [90, "90s"], [120, "120s"]]} onPick={(turnTimerSec) => set({ t: "settings", patch: { turnTimerSec: turnTimerSec as 0 } })} />
        </Rule>
        <Rule name="Bot skill" help="Rookie bots fumble about a third of their decisions. Pro bots deduce everything the rules allow.">
          <Seg value={s.botSkill} options={[["rookie", "Rookie"], ["pro", "Pro"]]} onPick={(botSkill) => set({ t: "settings", patch: { botSkill } })} />
        </Rule>
        <Rule name="Detective aids" help="Team suspect marks (right-click / long-press a space), or marks plus an automatic 'where could the thief be?' overlay.">
          <Seg value={r.assist} options={[["off", "Off"], ["marks", "Marks"], ["overlay", "Marks + overlay"]]} onPick={(assist) => set({ t: "settings", patch: { rules: { assist } } })} />
        </Rule>
        <Rule name="Museum opens at dawn" help="The detectives win if the thief is still inside after this many thief turns.">
          <Seg value={r.dawnAfterThiefTurns} options={DAWN_OPTIONS.map((n) => [n, n === 0 ? "Off" : `${n} turns`] as [number, string])} onPick={(dawnAfterThiefTurns) => set({ t: "settings", patch: { rules: { dawnAfterThiefTurns: dawnAfterThiefTurns as 0 } } })} />
        </Rule>
      </dl>
      <p className="faint small dice-note">
        <Icon name="dice" size={14} /> Action die: 4 Eye · 1 Scan · 1 Motion. Movement die: 1–6.
      </p>
    </section>
  );
}

function Rule({ name, help, children }: { name: string; help: string; children: React.ReactNode }) {
  return (
    <div className="rule">
      <dt>
        <b>{name}</b>
        <span className="faint small">{help}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function linkFor(code: string) {
  return `${location.origin}${withAlias(`/r/${code}`)}`;
}

function LayoutRule({ isHost }: { isHost: boolean }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const layout = view.settings.layout ?? { kind: "classic" };
  const [draft, setDraft] = useState("");
  const board = useMemo(() => (layout.kind === "remix" ? remixBoard(layout.seed) : CLASSIC_BOARD), [layout]);
  const setLayout = (l: typeof layout) => send({ t: "settings", patch: { layout: l } });
  const shuffle = () => setLayout({ kind: "remix", seed: Math.floor(Math.random() * 2 ** 32) });
  return (
    <div className="rule layout-rule">
      <dt>
        <b>Museum layout</b>
        <span className="faint small">The classic museum, or a seeded remix: moved windows and doorways, shuffled galleries, mirrored wings. Share the seed to replay a layout.</span>
        <div className="seg">
          <button aria-pressed={layout.kind === "classic"} disabled={!isHost} onClick={() => setLayout({ kind: "classic" })}>
            Classic
          </button>
          <button aria-pressed={layout.kind === "remix"} disabled={!isHost} onClick={shuffle}>
            Remix
          </button>
        </div>
        {layout.kind === "remix" && (
          <div className="row wrap">
            <span className="chip gold">Seed {layout.seed.toString(36).toUpperCase()}</span>
            {isHost && (
              <>
                <button className="btn small" onClick={shuffle}>
                  🎲 Shuffle
                </button>
                <input
                  className="input small-input"
                  placeholder="seed"
                  value={draft}
                  maxLength={7}
                  aria-label="Remix seed"
                  onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
                  onKeyDown={(e) => {
                    const n = parseInt(draft, 36);
                    if (e.key === "Enter" && Number.isFinite(n) && n <= 4294967295) {
                      setLayout({ kind: "remix", seed: n });
                      setDraft("");
                    }
                  }}
                />
              </>
            )}
          </div>
        )}
      </dt>
      <dd>
        <BoardPreview board={board} />
      </dd>
    </div>
  );
}
