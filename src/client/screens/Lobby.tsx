// The lobby, laid out like a console character-select: the crew along the top, a cover-flow
// carousel of detectives in the middle, and thief choice plus the ready button along the bottom.
// The host's house rules live in a sheet behind one button, so nothing here scrolls. Same screen
// for online rooms and solo mode. First-time players get two hand-drawn arrows: one at the
// Choose button, one at the ready button (see lobbyFlow.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { CLASSIC_BOARD } from "../../shared/board/classic";
import { remixBoard } from "../../shared/board/remix";
import { CHARACTERS, character, THIEF, type DetectiveColour } from "../../shared/characters";
import { DAWN_OPTIONS } from "../../shared/game/config";
import { MAX_SEATS } from "../../shared/room";
import type { Player, RoomSettings } from "../../shared/roomTypes";
import { ALL_ART, characterArt, type ArtId } from "../art";
import { copyText } from "../clipboard";
import { BoardPreview } from "../components/BoardPreview";
import { HandNote } from "../components/HandNote";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { VolumeControl } from "../components/VolumeControl";
import { withAlias } from "../identity";
import { cycle, flowPose, hintStep, ringOffset } from "../lobbyFlow";
import { useLobbyHints } from "../lobbyHints";
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
  const soloThief = solo && view.hostThief === view.you;

  const [sheet, setSheet] = useState(false);
  const [browse, setBrowse] = useState<DetectiveColour>(me?.character ?? CHARACTERS[0].id);
  const hints = useLobbyHints();
  const step = hintStep(hints, { seated: !watching, ready: !!me?.ready, busy: sheet, canPick: !soloThief });

  // Decode the art up front so cycling the carousel never pops in half-loaded.
  useEffect(() => {
    for (const id of ALL_ART) new Image().src = characterArt(id);
  }, []);

  const leave = () => {
    sfx.menuBack();
    navigate("/");
  };
  const toggleReady = () => {
    if (watching) return;
    const next = !me.ready;
    send({ t: "setReady", ready: next });
    sfx.menuSelect();
    if (next) hints.markReadied();
  };
  const move = (dir: 1 | -1) => {
    const i = CHARACTERS.findIndex((c) => c.id === browse);
    setBrowse(CHARACTERS[cycle(i, dir, CHARACTERS.length)].id);
    sfx.menuMove();
  };
  const choose = (id: DetectiveColour) => {
    if (watching) return;
    if (me.character !== id) send({ t: "setCharacter", character: id });
    sfx.menuSelect();
    hints.markPicked();
  };

  // Keyboard and gamepad (the gamepad layer turns the D-pad, A and X into these keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
      if (e.key === "Escape") {
        if (sheet) setSheet(false);
        else leave();
        return;
      }
      if (sheet) return;
      const idle = el === document.body;
      if (e.key === "r" || e.key === "R" || (e.key === " " && idle)) {
        e.preventDefault();
        toggleReady();
      } else if (!soloThief && e.key === "ArrowLeft") move(-1);
      else if (!soloThief && e.key === "ArrowRight") move(1);
      else if (!soloThief && e.key === "Enter" && idle && !watching && !takenBy(view.players, browse, view.you)) choose(browse);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status = view.startBlocker
    ? view.startBlocker
    : waitingOn.length === 0
      ? "Everyone's ready: the heist begins!"
      : waitingOn.length === 1 && waitingOn[0].id === view.you
        ? "Waiting on you: ready up when you're set."
        : `Waiting for ${waitingOn.map((p) => p.name).join(", ")} to ready up.`;

  return (
    <div className="screen lobby-screen">
      <div className="lobby-body">
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

        <main className="lb-main">
          <div className="lb-crewbar">
            <Crew isHost={isHost} solo={solo} />
            <RulesButton settings={s} onOpen={() => setSheet(true)} />
          </div>

          {soloThief ? <ThiefHero count={view.players.length} paintings={s.rules.minPaintingsToEscape} /> : <DetectiveStage browse={browse} setBrowse={setBrowse} move={move} choose={choose} step={step} solo={solo} />}
        </main>

        <footer className="lobby-ready">
          {solo ? <span className="lb-solo-note">{soloThief ? "Slip past the bot detectives." : "Track down the bot thief."}</span> : <ThiefControls isHost={isHost} />}
          <p className={`lobby-status ${view.startBlocker ? "warn" : ""}`}>{status}</p>
          <span className="lb-anchor">
            <button className={`btn big ${me?.ready ? "mint" : "primary"}`} disabled={watching || (!!view.startBlocker && !me?.ready)} onClick={toggleReady}>
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
            {step === "ready" && <HandNote placement="above" text={solo ? "Ready? Start the heist!" : "Don't forget to ready up!"} />}
          </span>
        </footer>

        {sheet && <RulesSheet isHost={isHost} onClose={() => setSheet(false)} />}
      </div>
    </div>
  );
}

const takenBy = (players: Player[], id: DetectiveColour, me: string | null) => players.find((p) => p.character === id && p.id !== me);

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

/** A round portrait cropped from the full-body art (or an initial / bot icon when nobody has picked yet). */
function Avatar({ player, thief }: { player: Player; thief: boolean }) {
  const art: ArtId | null = thief ? "thief" : player.character;
  const c = player.character ? character(player.character) : null;
  return (
    <span className={`lb-avatar${art ? "" : " plain"}${thief ? " thief" : ""}`} style={{ ["--c" as string]: thief ? THIEF.hex : (c?.hex ?? "#4a4390") }}>
      {art ? <img src={characterArt(art)} alt="" draggable={false} /> : player.isBot ? <Icon name="bot" /> : player.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The crew along the top: who has a seat, who is ready, who is the thief. */
function Crew({ isHost, solo }: { isHost: boolean; solo: boolean }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const me = view.players.find((p) => p.id === view.you);
  const hostPicks = view.settings.thiefSelection === "host";
  const open = MAX_SEATS - view.players.length;
  return (
    <section className="lb-crew" aria-label="The crew">
      <ul className="lb-seats">
        {view.players.map((p) => {
          const isMe = p.id === view.you;
          const thief = hostPicks && view.hostThief === p.id;
          const picker = hostPicks && isHost;
          const c = p.character ? character(p.character) : null;
          const body = (
            <>
              <span className="lb-avatar-wrap">
                <Avatar player={p} thief={thief} />
                {(p.ready || p.isBot) && !solo && (
                  <span className="lb-ready-dot" aria-label="Ready">
                    <Icon name="check" size={12} />
                  </span>
                )}
                {view.settings.thiefSelection === "volunteer" && p.volunteer && (
                  <span className="lb-volunteer" title="Wants to be the thief">
                    <Icon name="hand" size={12} />
                  </span>
                )}
              </span>
              <b>
                {p.name}
                {p.isHost && <Icon name="crown" size={13} className="crown" title="Host" />}
              </b>
              <small>{thief ? "The thief" : !p.connected && !p.isBot ? "away" : `${p.isBot ? "bot · " : ""}${c ? c.short : "no pick yet"}`}</small>
            </>
          );
          return (
            <li key={p.id} className={`lb-who${isMe ? " me" : ""}${p.connected ? "" : " offline"}${thief ? " thief" : ""}`}>
              {picker ? (
                <button className="lb-who-btn" aria-pressed={thief} title={`Make ${p.name} the thief`} onClick={() => send({ t: "setThief", playerId: p.id })}>
                  {body}
                </button>
              ) : (
                <div className="lb-who-btn">{body}</div>
              )}
              {isHost && !isMe && !solo && (
                <button className="lb-kick" aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`} onClick={() => send({ t: "kick", playerId: p.id })}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </li>
          );
        })}
        {!solo &&
          Array.from({ length: open }, (_, i) => (
            <li key={`open${i}`} className="lb-who open">
              {isHost && i === 0 ? (
                <button className="lb-who-btn" onClick={() => send({ t: "addBot" })} title="Fill the seat with a bot">
                  <span className="lb-avatar plain add">
                    <Icon name="bot" />
                  </span>
                  <b>Add bot</b>
                  <small>open seat</small>
                </button>
              ) : (
                <div className="lb-who-btn">
                  <span className="lb-avatar plain empty">
                    <Icon name="plus" />
                  </span>
                  <b>Open seat</b>
                  <small>&nbsp;</small>
                </div>
              )}
            </li>
          ))}
      </ul>
      {view.spectators.length > 0 && (
        <div className="lb-watchers">
          <span className="label">Watching</span>
          {view.spectators.map((w) => (
            <span key={w.id} className="chip dim">
              <Icon name="eye" size={12} /> {w.name}
              {w.id === view.you && " (you)"}
            </span>
          ))}
          {!me && view.spectators.some((w) => w.id === view.you) && view.players.length < MAX_SEATS && (
            <button className="btn small primary" onClick={() => send({ t: "sit" })}>
              Take a seat
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function RulesButton({ settings, onOpen }: { settings: RoomSettings; onOpen: () => void }) {
  const r = settings.rules;
  const layout = settings.layout ?? { kind: "classic" };
  const summary = [layout.kind === "remix" ? `Remix ${layout.seed.toString(36).toUpperCase()}` : "Classic museum", `${r.minPaintingsToEscape} painting${r.minPaintingsToEscape === 1 ? "" : "s"}`, settings.turnTimerSec ? `${settings.turnTimerSec}s timer` : "no timer", `${settings.botSkill} bots`];
  return (
    <button className="lb-rules-btn" onClick={onOpen} aria-haspopup="dialog">
      <span className="lb-gear">
        <Icon name="gear" size={20} />
      </span>
      <span>
        <b>House rules</b>
        <small>{summary.join(" · ")}</small>
      </span>
    </button>
  );
}

/** The cover-flow: the focused detective large in the middle, neighbours receding on both sides. */
function DetectiveStage({ browse, setBrowse, move, choose, step, solo }: { browse: DetectiveColour; setBrowse: (id: DetectiveColour) => void; move: (d: 1 | -1) => void; choose: (id: DetectiveColour) => void; step: "pick" | "ready" | null; solo: boolean }) {
  const view = useStore((s) => s.view)!;
  const me = view.players.find((p) => p.id === view.you);
  const focus = CHARACTERS.findIndex((c) => c.id === browse);
  const c = CHARACTERS[focus];
  const owner = takenBy(view.players, browse, view.you);
  const mine = me?.character === browse;
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const soloLine = solo ? "Track down a bot thief. Land on the thief to make the arrest." : null;

  return (
    <>
      <div
        className="lb-carousel"
        style={{ ["--c" as string]: c.hex }}
        onPointerDown={(e) => (drag.current = { x: e.clientX, moved: false })}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && Math.abs(e.clientX - d.x) > 40) {
            d.moved = true;
            move(e.clientX < d.x ? 1 : -1);
          }
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="lb-stagelight" />
        <button className={`lb-arrow l${step === "pick" ? " nudge" : ""}`} onClick={() => move(-1)} aria-label="Previous detective">
          <Icon name="back" size={22} />
        </button>
        <button className={`lb-arrow r${step === "pick" ? " nudge" : ""}`} onClick={() => move(1)} aria-label="Next detective">
          <Icon name="back" size={22} className="flip" />
        </button>
        {CHARACTERS.map((x, i) => {
          const d = ringOffset(i, focus, CHARACTERS.length);
          const o = takenBy(view.players, x.id, view.you);
          const pose = flowPose(d);
          return (
            <button
              key={x.id}
              className={`lb-cf${d === 0 ? " sel" : ""}${Math.abs(d) > 2 ? " far" : ""}${o ? " taken" : ""}`}
              style={{ ["--d" as string]: d, ["--c" as string]: x.hex, ["--s" as string]: pose.scale, ["--o" as string]: pose.opacity, ["--br" as string]: pose.brightness, zIndex: pose.z }}
              onClick={() => {
                if (!drag.current?.moved && d !== 0) {
                  setBrowse(x.id);
                  sfx.menuMove();
                }
              }}
              tabIndex={d === 0 ? 0 : -1}
              aria-label={`${x.name}${o ? `, taken by ${o.name}` : me?.character === x.id ? ", your detective" : ""}`}
              aria-current={d === 0}
            >
              <img src={characterArt(x.id)} alt="" draggable={false} />
              {o && d !== 0 && <span className="lb-owner">{o.name}'s</span>}
            </button>
          );
        })}
      </div>

      <div className="lb-info" style={{ ["--c" as string]: c.hex }}>
        <div className="lb-name" key={c.id}>
          <h2>{c.name}</h2>
          <p>{c.blurb}</p>
          {soloLine && <p className="lb-mission">{soloLine}</p>}
        </div>
        <span className="lb-anchor">
          {!me ? (
            <button className="btn big" disabled>
              <Icon name="eye" /> Watching
            </button>
          ) : mine ? (
            <button className="btn big mint" onClick={() => choose(c.id)}>
              <Icon name="check" /> Your detective
            </button>
          ) : owner ? (
            <button className="btn big" disabled>
              Taken by {owner.name}
            </button>
          ) : (
            <button className="btn big primary" onClick={() => choose(c.id)}>
              Choose {c.short}
            </button>
          )}
          {step === "pick" && <HandNote placement="right" text="Cycle left and right, then choose your detective!" />}
        </span>
      </div>
    </>
  );
}
/** Solo thieves have no detective to pick: the Magpie takes the stage instead. */
function ThiefHero({ count, paintings }: { count: number; paintings: number }) {
  return (
    <>
      <div className="lb-carousel thief-hero" style={{ ["--c" as string]: "#8a8aa0" }}>
        <div className="lb-stagelight" />
        <div className="lb-cf sel">
          <img src={characterArt("thief")} alt="The Magpie" draggable={false} />
        </div>
      </div>
      <div className="lb-info alone" style={{ ["--c" as string]: "#8a8aa0" }}>
        <div className="lb-name">
          <h2>You're the thief</h2>
          <p>
            Slip past {count - 1} bot detective{count === 2 ? "s (two pawns)" : "s"}, grab at least {paintings} painting{paintings === 1 ? "" : "s"} and find an unlocked exit.
          </p>
        </div>
      </div>
    </>
  );
}

/** Who's the thief? Random / volunteers / host picks, with whatever extra control each needs. */
function ThiefControls({ isHost }: { isHost: boolean }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const me = view.players.find((p) => p.id === view.you);
  const sel = view.settings.thiefSelection;
  const caption =
    (sel === "random" ? "Picked at random when everyone is ready (bots included)." : sel === "volunteer" ? "Picked from the volunteers (at random if there are several)." : isHost ? "Tap a player in the crew to make them the thief." : "The host picks the thief.") + (view.settings.mode === "match" ? " In a full match every human takes a turn." : "");
  return (
    <div className="lb-thief">
      <div className="lb-thief-row">
        <span className="lb-lab">Thief</span>
        <div className="seg" role="group" aria-label="Thief selection">
          {(["random", "volunteer", "host"] as const).map((v) => (
            <button key={v} aria-pressed={sel === v} disabled={!isHost} onClick={() => send({ t: "settings", patch: { thiefSelection: v } })}>
              {v === "random" ? "Random" : v === "volunteer" ? "Volunteers" : "Host picks"}
            </button>
          ))}
        </div>
        {sel === "volunteer" && me && (
          <button className={`btn small ${me.volunteer ? "primary" : ""}`} onClick={() => send({ t: "volunteer", on: !me.volunteer })}>
            <Icon name="hand" size={16} /> {me.volunteer ? "You volunteered!" : "I want to be the thief"}
          </button>
        )}
      </div>
      <small className="lb-thief-note">{caption}</small>
    </div>
  );
}

/** The house rules, in a sheet over the lobby. Read-only for everyone but the host. */
function RulesSheet({ isHost, onClose }: { isHost: boolean; onClose: () => void }) {
  const view = useStore((s) => s.view)!;
  const send = useStore((s) => s.send);
  const s = view.settings;
  const r = s.rules;
  const set = (patch: Parameters<typeof send>[0] & { t: "settings" }) => send(patch);
  const sheet = useRef<HTMLDivElement>(null);

  // Focus moves into the sheet, stays inside it, and goes back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="lb-sheet-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-sheet panel" role="dialog" aria-modal="true" aria-labelledby="rules-title" ref={sheet}>
        <div className="lb-sheet-head">
          <h2 id="rules-title">House rules</h2>
          <span className={`muted small${isHost ? "" : " lock"}`}>{isHost ? "You're the host: tweak away." : "Only the host can change these."}</span>
          <button className="btn small primary" onClick={onClose} data-autofocus>
            <Icon name="check" size={16} /> Done
          </button>
        </div>
        <div className="lb-sheet-cols">
          <div className="lb-col">
            <h3>Museum</h3>
            <LayoutRule isHost={isHost} />
          </div>
          <div className="lb-col">
            <h3>Heist</h3>
            <Rule name="Game length" help="One round, or a full match where every player is the thief once and the biggest haul wins.">
              <Seg isHost={isHost} value={s.mode} options={[["single", "Single round"], ["match", "Full match"]]} onPick={(mode) => set({ t: "settings", patch: { mode } })} />
            </Rule>
            <Rule name="Paintings to escape" help="How many paintings the thief must hold before trying a lock." inline>
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
              <Seg isHost={isHost} value={r.lockPlacement} options={[["random", "Shuffled"], ["detectives", "Detectives place"]]} onPick={(lockPlacement) => set({ t: "settings", patch: { rules: { lockPlacement } } })} />
            </Rule>
            <Rule name="Museum opens at dawn" help="The detectives win if the thief is still inside after this many thief turns.">
              <Seg isHost={isHost} value={r.dawnAfterThiefTurns} options={DAWN_OPTIONS.map((n) => [n, n === 0 ? "Off" : `${n} turns`] as [number, string])} onPick={(dawnAfterThiefTurns) => set({ t: "settings", patch: { rules: { dawnAfterThiefTurns: dawnAfterThiefTurns as 0 } } })} />
            </Rule>
          </div>
          <div className="lb-col">
            <h3>Detectives &amp; table</h3>
            <Rule name="Stay put on a 1" help="Designers disagreed! When on, a detective who rolls a 1 may stay where they are.">
              <Seg isHost={isHost} value={r.detectiveMayStay} options={[[false, "Must move"], [true, "May stay"]]} onPick={(detectiveMayStay) => set({ t: "settings", patch: { rules: { detectiveMayStay } } })} />
            </Rule>
            <Rule name="Detective aids" help="Team suspect marks (right-click / long-press a space), or marks plus an automatic 'where could the thief be?' overlay.">
              <Seg isHost={isHost} value={r.assist} options={[["off", "Off"], ["marks", "Marks"], ["overlay", "Marks + overlay"]]} onPick={(assist) => set({ t: "settings", patch: { rules: { assist } } })} />
            </Rule>
            <Rule name="Turn timer" help="When time runs out, a bot finishes the turn. The clock pauses if that player drops out.">
              <Seg isHost={isHost} value={s.turnTimerSec} options={[[0, "Off"], [60, "60s"], [90, "90s"], [120, "120s"]]} onPick={(turnTimerSec) => set({ t: "settings", patch: { turnTimerSec: turnTimerSec as 0 } })} />
            </Rule>
            <Rule name="Bot skill" help="Rookie bots fumble about a third of their decisions. Pro bots deduce everything the rules allow.">
              <Seg isHost={isHost} value={s.botSkill} options={[["rookie", "Rookie"], ["pro", "Pro"]]} onPick={(botSkill) => set({ t: "settings", patch: { botSkill } })} />
            </Rule>
          </div>
        </div>
        <p className="faint small dice-note">
          <Icon name="dice" size={14} /> Action die: 4 Eye · 1 Scan · 1 Motion. Movement die: 1–6.
        </p>
      </div>
    </div>
  );
}

function Seg<T extends string | number | boolean>({ isHost, value, options, onPick }: { isHost: boolean; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={value === v} disabled={!isHost} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Rule({ name, help, inline, children }: { name: string; help: string; inline?: boolean; children: React.ReactNode }) {
  return (
    <div className={`lb-rule${inline ? " inline" : ""}`}>
      <div className="lb-rule-head">
        <b>{name}</b>
        {inline && children}
      </div>
      {!inline && children}
      <span className="faint small">{help}</span>
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
    <div className="layout-rule">
      <BoardPreview board={board} />
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
      <span className="faint small">The classic museum, or a seeded remix: moved windows and doorways, shuffled galleries, mirrored wings. Share the seed to replay a layout.</span>
    </div>
  );
}
