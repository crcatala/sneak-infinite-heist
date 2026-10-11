// Connects to a room and shows the screen for its current phase.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Player } from "../../shared/roomTypes";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { loadIdentity, loadName, saveName } from "../identity";
import { connect, disconnect } from "../net";
import { goneIds, presenceChanges, watcherChanges } from "../presence";
import { navigate } from "../router";
import { setMusic, sfx } from "../sfx";
import { useStore } from "../store";
import { Lobby } from "./Lobby";

const Game = lazy(() => import("./Game").then((m) => ({ default: m.Game })));

/** How long someone can be gone before it's announced (a page reload shouldn't make a fuss). */
const PRESENCE_GRACE_MS = 4000;

/** Toasts when another player drops out, and when someone who was announced gone comes back. */
function usePresenceToasts() {
  const players = useStore((s) => s.view?.players);
  const spectators = useStore((s) => s.view?.spectators);
  const me = useStore((s) => s.view?.you);
  const toast = useStore((s) => s.toast);
  const prev = useRef<Player[] | null>(null);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const announced = useRef(new Set<string>());

  useEffect(() => {
    if (!players || !me) return;
    const everyone = [...players, ...(spectators ?? [])];
    // Someone removed or replaced while their drop was still pending is gone for good: say nothing.
    for (const id of goneIds([...pending.current.keys(), ...announced.current], everyone)) {
      clearTimeout(pending.current.get(id));
      pending.current.delete(id);
      announced.current.delete(id);
    }
    if (prev.current) {
      const { left, back } = presenceChanges(prev.current, everyone, me);
      for (const p of left) {
        clearTimeout(pending.current.get(p.id));
        pending.current.set(
          p.id,
          setTimeout(() => {
            pending.current.delete(p.id);
            announced.current.add(p.id);
            toast(`${p.name} disconnected`, "bad", "📡");
            sfx.playerLeft();
          }, PRESENCE_GRACE_MS),
        );
      }
      for (const p of back) {
        const timer = pending.current.get(p.id);
        if (timer) {
          clearTimeout(timer);
          pending.current.delete(p.id);
        } else if (announced.current.delete(p.id)) {
          toast(`${p.name} is back`, "good", "👋");
          sfx.playerBack();
        }
      }
    }
    prev.current = everyone;
  }, [players, spectators, me, toast]);

  // The watcher is announced to everyone, the thief included, so nobody is watched in secret.
  const prevWatchers = useRef<Player[] | null>(null);
  useEffect(() => {
    if (!spectators || !me) return;
    if (prevWatchers.current) {
      const { arrived, gone } = watcherChanges(prevWatchers.current, spectators, me);
      for (const p of arrived) {
        toast(`${p.name} is watching`, "info", "👀");
        sfx.playerBack();
      }
      // Someone who took a seat in the lobby hasn't stopped playing.
      for (const p of gone) if (!players?.some((x) => x.id === p.id)) toast(`${p.name} stopped watching`, "info", "👀");
    }
    prevWatchers.current = spectators;
  }, [spectators, players, me, toast]);

  useEffect(() => {
    const timers = pending.current;
    return () => timers.forEach(clearTimeout);
  }, []);
}

export function RoomScreen({ code }: { code: string }) {
  const [named, setNamed] = useState(() => !!loadName() || !!loadIdentity(code));
  // A spectator link (?watch=1), or "Watch instead" on the name prompt.
  const [watch, setWatch] = useState(() => new URLSearchParams(location.search).get("watch") === "1");
  const status = useStore((s) => s.status);
  const fatal = useStore((s) => s.fatal);
  const hasView = useStore((s) => !!s.view);
  const claimSeats = useStore((s) => s.claimSeats);
  usePresenceToasts();

  useEffect(() => {
    if (!named) return;
    connect(code, undefined, watch);
    return () => disconnect();
  }, [code, named, watch]);

  if (!named) {
    return (
      <NamePrompt
        code={code}
        watch={watch}
        onDone={(asWatcher) => {
          setWatch(asWatcher);
          setNamed(true);
        }}
      />
    );
  }
  if (status === "claim") return <SeatPicker code={code} seats={claimSeats} />;
  if (status === "failed") {
    return (
      <Notice title={`Can't sneak into ${code}`}>
        <p className="muted">{fatal}</p>
        <button className="btn primary" autoFocus onClick={() => navigate("/")}>
          Back to the title
        </button>
      </Notice>
    );
  }
  if (!hasView) {
    return (
      <Notice title={`Room ${code}`}>
        <div className="spinner" style={{ margin: "0 auto" }} />
        <p className="muted">Picking the lock…</p>
      </Notice>
    );
  }
  return (
    <>
      <PhaseScreen />
      {status !== "open" && <div className="reconnect-banner">Connection lost: reconnecting…</div>}
    </>
  );
}

/** The screen for the room's current phase. Shared by online rooms and solo mode. */
export function PhaseScreen() {
  const phase = useStore((s) => s.view?.phase);
  useEffect(() => {
    if (phase === "lobby") setMusic("lobby");
  }, [phase]);
  if (phase === "lobby") return <Lobby />;
  return (
    <Suspense
      fallback={
        <Notice title="Setting the stage…">
          <div className="spinner" style={{ margin: "0 auto" }} />
        </Notice>
      }
    >
      <Game />
    </Suspense>
  );
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="screen notice-screen">
      <div className="center-stage">
        <div className="panel glass notice">
          <div className="notice-logo">
            <Logo compact />
          </div>
          <h2 className="panel-title">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Rejoining a started game without this browser's seat secret: pick which player you are. */
function SeatPicker({ code, seats }: { code: string; seats: { id: string; name: string }[] }) {
  return (
    <Notice title={`Rejoin ${code}`}>
      <p className="muted">{seats.length ? "This heist has already started. If you were playing on another device or browser, pick your seat to continue, or just watch." : "This heist has already started. You can watch it unfold."}</p>
      <div className="row wrap" style={{ justifyContent: "center" }}>
        {seats.map((s, i) => (
          <button key={s.id} className="btn primary" autoFocus={i === 0} onClick={() => connect(code, s.id)}>
            I'm {s.name}
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => connect(code, undefined, true)}>
        <Icon name="eye" size={18} /> Just watch
      </button>
      <button className="btn ghost small" onClick={() => navigate("/")}>
        Back to the title
      </button>
    </Notice>
  );
}

function NamePrompt({ code, watch, onDone }: { code: string; watch: boolean; onDone: (watch: boolean) => void }) {
  const [name, setName] = useState("");
  const submit = (asWatcher: boolean) => {
    if (!name.trim()) return;
    saveName(name.trim());
    onDone(asWatcher);
  };
  return (
    <Notice title={watch ? `Watch room ${code}` : `You're invited to room ${code}`}>
      <p className="dialogue-line" style={{ fontSize: "1.5rem" }}>
        What should the museum call you?
      </p>
      <input className="input big-input" autoFocus maxLength={24} value={name} placeholder="e.g. Moonbeam" aria-label="Your name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit(watch)} />
      {watch ? (
        <button className="btn primary big" onClick={() => submit(true)} disabled={!name.trim()}>
          <Icon name="eye" /> Start watching
        </button>
      ) : (
        <>
          <button className="btn primary big" onClick={() => submit(false)} disabled={!name.trim()}>
            Sneak in <Icon name="play" />
          </button>
          <button className="btn ghost small" onClick={() => submit(true)} disabled={!name.trim()}>
            <Icon name="eye" size={16} /> Watch instead
          </button>
        </>
      )}
    </Notice>
  );
}
