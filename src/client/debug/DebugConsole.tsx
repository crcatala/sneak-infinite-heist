// Collapsible playtest console (toggle with the backtick key): setup skips, forced rolls, power,
// round end, slow motion, seat links and the raw view. Peeking at hidden information is only offered
// where the server allows it (solo mode and local dev builds).

import { useState } from "react";
import type { ClientMessage } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { useStore } from "../store";

type DebugMsg = Extract<ClientMessage, { t: "debug" }>;

export function DebugConsole() {
  const debug = useStore((s) => s.debug);
  const setDebug = useStore((s) => s.setDebug);
  const view = useStore((s) => s.view);
  const status = useStore((s) => s.status);
  const mode = useStore((s) => s.mode);
  const send = useStore((s) => s.send);
  const [showState, setShowState] = useState(false);
  const [move, setMove] = useState(6);

  if (!debug.open) {
    return (
      <button className="debug-tab" onClick={() => setDebug({ open: true })} title="Debug console (`)" aria-label="Open debug console">
        <Icon name="gear" size={16} />
      </button>
    );
  }

  const cmd = (m: Omit<DebugMsg, "t">) => send({ t: "debug", ...m } as DebugMsg);
  const me = view?.players.find((p) => p.id === view.you);
  const game = view?.game;
  const inSetup = !!game && game.phase.startsWith("setup");
  const seatLinks = view && mode === "online" ? [2, 3, 4].map((n) => ({ n, href: `${location.origin}/r/${view.code}?as=${n}` })) : [];

  return (
    <div className="debug-console panel glass" role="dialog" aria-label="Debug console">
      <div className="row">
        <b>Debug console</b>
        <span className="faint small">` to toggle</span>
        <span className="spacer" />
        <button className="btn small icon ghost" aria-label="Close debug console" onClick={() => setDebug({ open: false })}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {view ? (
        <>
          <section>
            <div className="label">Room</div>
            <div className="debug-kv">
              <span>code</span>
              <b>{view.code}</b>
              <span>phase</span>
              <b>
                {view.phase}
                {game ? ` · ${game.phase}` : ""}
              </b>
              <span>you</span>
              <b>
                {me?.name} ({view.you}){me?.isHost ? " · host" : ""} · {view.role ?? "lobby"}
              </b>
              <span>waiting on</span>
              <b>{view.waitingOn.map((id) => view.players.find((p) => p.id === id)?.name ?? id).join(", ") || "—"}</b>
            </div>
          </section>

          <section>
            <div className="label">Jump ahead</div>
            <div className="debug-buttons">
              {view.phase === "lobby" && (
                <button className="btn small primary" onClick={() => cmd({ cmd: "startNow" })}>
                  Start now
                </button>
              )}
              {inSetup && (
                <>
                  <button className="btn small" onClick={() => cmd({ cmd: "autoSetup" })}>
                    Auto-setup this phase
                  </button>
                  <button className="btn small primary" onClick={() => cmd({ cmd: "skipToPlay" })}>
                    Skip to play
                  </button>
                </>
              )}
              {game?.phase === "play" && (
                <>
                  <button className="btn small" onClick={() => cmd({ cmd: "givePaintings", n: 3 })}>
                    Give thief 3 paintings
                  </button>
                  <button className="btn small" onClick={() => cmd({ cmd: "cutPower" })}>
                    Cut power
                  </button>
                  <button className="btn small" onClick={() => cmd({ cmd: "restorePower" })}>
                    Restore power
                  </button>
                  <button className="btn small danger" onClick={() => cmd({ cmd: "endRound", winner: "detectives" })}>
                    End round (detectives)
                  </button>
                  <button className="btn small danger" onClick={() => cmd({ cmd: "endRound", winner: "thief" })}>
                    End round (thief)
                  </button>
                </>
              )}
            </div>
            {game?.phase === "play" && (
              <div className="row wrap">
                <span className="small">Next roll:</span>
                <select className="input" style={{ width: 70, minHeight: 34 }} value={move} onChange={(e) => setMove(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                {(["eye", "scan", "motion"] as const).map((a) => (
                  <button key={a} className="btn small" onClick={() => cmd({ cmd: "forceRoll", move, action: a })}>
                    {a}
                  </button>
                ))}
              </div>
            )}
          </section>

          {view.cheats && game && (
            <section>
              <div className="label">Peek (solo / dev only)</div>
              <div className="debug-buttons">
                {(["thief", "detectives", "omniscient"] as const).map((as) => (
                  <button key={as} className={`btn small ${view.viewAs === as ? "primary" : ""}`} onClick={() => cmd({ cmd: "viewAs", as: view.viewAs === as ? null : as })}>
                    View as {as}
                  </button>
                ))}
              </div>
            </section>
          )}

          {seatLinks.length > 0 && (
            <section>
              <div className="label">Play as another seat (new tab)</div>
              <div className="debug-buttons">
                {seatLinks.map((l) => (
                  <a key={l.n} className="btn small" href={l.href} target="_blank" rel="noreferrer">
                    Seat {l.n}
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <p className="muted">Not in a room. Start a solo game or join one to use room tools.</p>
      )}

      <section>
        <div className="label">Animation</div>
        <label className="row small">
          <input type="checkbox" checked={debug.slowMotion} onChange={(e) => setDebug({ slowMotion: e.target.checked })} />
          Slow-motion animations (6×)
        </label>
      </section>

      <section>
        <div className="label">Network</div>
        <div className="debug-kv">
          <span>mode</span>
          <b>{mode === "solo" ? "solo (in-browser engine)" : "online"}</b>
          <span>status</span>
          <b>{status}</b>
          <span>msgs in / out</span>
          <b>
            {debug.msgIn} / {debug.msgOut}
          </b>
          <span>received</span>
          <b>{(debug.bytesIn / 1024).toFixed(0)} KB</b>
        </div>
      </section>

      <section>
        <button className="btn small ghost" onClick={() => setShowState((v) => !v)}>
          {showState ? "▾" : "▸"} State JSON (your view)
        </button>
        {showState && <pre className="debug-state scroll">{JSON.stringify(view, null, 1)?.slice(0, 80_000)}</pre>}
      </section>
    </div>
  );
}
