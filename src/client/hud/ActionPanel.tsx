// The bottom panel: one prompt line and the primary action(s) for whatever the game needs from you
// right now. Setup tools, the thief's confirm card, the detective's roll / move / action cards.

import { getBoard, regionName } from "../../shared/board/model";
import { ARTWORKS, character } from "../../shared/characters";
import { lockSplit, setupProblem } from "../../shared/game/setup";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { activePawn, cellLabel, detectiveEnds, playerName, slotLabel } from "../game/derive";
import type { BoardInteraction } from "../game/interact";
import { useFx } from "../game/present";
import { EMPTY_PLAN, useGameUi } from "../game/uiStore";
import { sfx } from "../sfx";
import { useStore } from "../store";

type Send = ReturnType<typeof useStore.getState>["send"];

export function ActionPanel({ view, game, ix }: { view: RoomView; game: GameView; ix: BoardInteraction }) {
  const send = useStore((s) => s.send);
  const dice = useFx((s) => s.dice);
  const rolling = !!dice && dice.until > performance.now();
  const m = ix.mode;

  let body: React.ReactNode = null;
  switch (m.kind) {
    case "setupLocks":
      body = <SetupLocks game={game} send={send} view={view} />;
      break;
    case "setupPieces":
    case "setupPawns":
      body = <SetupPieces game={game} send={send} view={view} ix={ix} />;
      break;
    case "thiefEntry":
      body = <ThiefEntry game={game} />;
      break;
    case "thiefMove":
      body = <ThiefMove game={game} send={send} />;
      break;
    case "detRoll":
      body = (
        <div className="action-row">
          <p className="prompt">Roll the movement and action dice.</p>
          <button
            className="btn primary big"
            autoFocus
            onClick={() => {
              send({ t: "game", action: { a: "roll" } });
            }}
          >
            <Icon name="dice" /> Roll <span className="kbd">Space</span>
          </button>
        </div>
      );
      break;
    case "detAct":
      body = rolling ? <p className="prompt">Rolling…</p> : <DetectiveCards game={game} send={send} canMove={m.canMove} canAct={m.canAct} />;
      break;
    case "watch":
      body = <Watching view={view} game={game} reason={m.reason} />;
      break;
    default:
      body = null;
  }
  if (!body) return null;
  return (
    <section className="action-panel panel glass" aria-label="Your actions">
      {body}
      {ix.hoverReason && <p className="hover-reason">{ix.hoverReason}</p>}
    </section>
  );
}

function Watching({ view, game, reason }: { view: RoomView; game: GameView; reason: string }) {
  const pawn = activePawn(game);
  const t = game.turn;
  let text = reason;
  if (!text) {
    if (t.kind === "thief") text = view.role === "thief" ? "" : "The thief is creeping about… listen closely.";
    else if (t.kind === "detective" && pawn) {
      const who = `${character(pawn.character).short} (${playerName(view, pawn.controller)})`;
      text = t.awaitingThief ? `${who} triggered the motion detectors. Waiting for the thief to answer…` : !t.roll ? `${who} is about to roll.` : `${who} is ${!t.moved ? "moving" : "deciding"}…`;
    }
  }
  if (!text) return null;
  return (
    <div className="action-row watching">
      <span className="dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <p className="prompt">{text}</p>
    </div>
  );
}

function SetupLocks({ game, send, view }: { game: GameView; send: Send; view: RoomView }) {
  const [open, locked] = lockSplit(game.locks.length);
  const nOpen = game.locks.filter((l) => l.face === "open").length;
  const nLocked = game.locks.filter((l) => l.face === "locked").length;
  const problem = setupProblem(game);
  return (
    <div className="setup">
      <p className="prompt">
        Click a plinth to cycle its lock: <b className="mint">open</b> → <b className="alarm-text">locked</b> → empty. Use {open} open and {locked} locked.
      </p>
      <div className="row wrap">
        <span className="chip mint">
          <Icon name="unlock" size={14} /> {nOpen}/{open} open
        </span>
        <span className="chip alarm">
          <Icon name="lock" size={14} /> {nLocked}/{locked} locked
        </span>
      </div>
      <SetupButtons game={game} send={send} view={view} problem={problem} />
    </div>
  );
}

function SetupPieces({ game, send, view, ix }: { game: GameView; send: Send; view: RoomView; ix: BoardInteraction }) {
  const board = getBoard(game.board);
  const problem = setupProblem(game);
  const held = useGameUi((s) => s.held);
  const phase = game.phase;
  return (
    <div className="setup">
      {phase === "setupPaintings" && (
        <>
          <p className="prompt">
            Hang all 9 paintings: at least one in each main gallery. Never in corridors, the Power Room, or in front of a window or doorway. Click a painting to pick it up, right-click / long-press to remove.
          </p>
          <div className="room-counters">
            {board.mainRooms.map((r) => {
              const n = game.paintings.filter((p) => board.region[p.cell] === r).length;
              return (
                <span key={r} className={`room-chip floor-${board.colours[r]}${n ? " ok" : ""}`} title={regionName(board, r)}>
                  <span className="room-swatch" />
                  {regionName(board, r).replace(" Gallery", "").replace(" Atrium", "")} {n ? <Icon name="check" size={14} /> : "0"}
                </span>
              );
            })}
            <span className="chip gold">{game.paintings.length}/9</span>
          </div>
        </>
      )}
      {phase === "setupCameras" && (
        <>
          <p className="prompt">Place 6 cameras (numbered in order). Anywhere without a painting except the power switch. Cameras see in all four directions.</p>
          <div className="row wrap">
            <span className="chip gold">
              <Icon name="camera" size={14} /> {game.cameras.length}/6
            </span>
            {held?.kind === "piece" && <span className="chip">Moving camera {game.cameras.find((c) => c.cell === held.from)?.n}: click where it goes</span>}
          </div>
        </>
      )}
      {phase === "setupDetectives" && (
        <>
          <p className="prompt">Put every detective on a starting space (not on a painting or another detective).</p>
          <div className="row wrap">
            {game.detectives.map((d) => (
              <button key={d.id} className={`btn small ${ix.pawnGhost?.pawn === d.id || (held?.kind === "pawn" && held.pawn === d.id) ? "primary" : ""}`} onClick={() => useGameUi.getState().set({ held: { kind: "pawn", pawn: d.id } })} style={{ ["--fill" as string]: undefined }}>
                <span className="pawn-dot" style={{ background: character(d.character).hex }} /> {character(d.character).short}
                {d.cell === null ? " · place me" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      <SetupButtons game={game} send={send} view={view} problem={problem} />
    </div>
  );
}

function SetupButtons({ game, send, view, problem }: { game: GameView; send: Send; view: RoomView; problem: string | null }) {
  const ready = !!game.ready[view.you];
  const others = view.waitingOn.filter((id) => id !== view.you).map((id) => playerName(view, id));
  return (
    <div className="action-row">
      <button className="btn small" onClick={() => send({ t: "game", action: { a: "autoPlace" } })}>
        <Icon name="sparkle" size={16} /> Auto-place
      </button>
      <button className="btn small" onClick={() => send({ t: "game", action: { a: "clear" } })}>
        <Icon name="trash" size={16} /> Clear
      </button>
      <span className="spacer" />
      <span className="muted small">{problem ?? (ready && others.length ? `Waiting for ${others.join(", ")}` : "Looks good!")}</span>
      <button
        className={`btn ${ready ? "mint" : "primary"}`}
        disabled={!!problem}
        onClick={() => {
          send({ t: "game", action: { a: "setupReady", ready: !ready } });
          sfx.menuSelect();
        }}
      >
        {ready ? (
          <>
            <Icon name="check" /> Ready
          </>
        ) : (
          <>
            Ready <span className="kbd">Enter</span>
          </>
        )}
      </button>
    </div>
  );
}

function ThiefEntry({ game }: { game: GameView }) {
  const board = getBoard(game.board);
  const hoverSlot = useGameUi((s) => s.hoverSlot);
  return (
    <div className="action-row">
      <p className="prompt">
        <b>Pick your way in:</b> click any of the 11 padlock plinths (windows and doors). Entering is free; then you move 1–3 spaces.
        {hoverSlot && <span className="gold"> · {slotLabel(board, hoverSlot)}</span>}
      </p>
    </div>
  );
}

function ThiefMove({ game, send }: { game: GameView; send: Send }) {
  const board = getBoard(game.board);
  const plan = useGameUi((s) => s.plan);
  const set = useGameUi((s) => s.set);
  const dest = plan.dest;
  if (dest === null) {
    return (
      <div className="action-row">
        <p className="prompt">
          {plan.entry ? `Entering through the ${slotLabel(board, plan.entry)}. ` : ""}
          <b>Pick where to end:</b> 1–3 spaces, never back where you started or onto a detective. Hover to see the path.
        </p>
        {plan.entry && game.thief.cell === null && (
          <button className="btn small ghost" onClick={() => set({ plan: EMPTY_PLAN })}>
            Change entry
          </button>
        )}
      </div>
    );
  }
  const painting = game.paintings.find((p) => p.cell === dest && p.status === "hanging");
  const camera = game.cameras.find((c) => c.cell === dest && !c.disabled);
  const slot = board.slotByInside.get(dest);
  const lock = slot && game.locks.find((l) => l.slot === slot.id);
  const haul = game.thief.haul + (painting ? 1 : 0);
  const canTryLock = !!lock && !lock.revealed;
  const enough = haul >= game.rules.minPaintingsToEscape;
  const confirm = () => {
    send({
      t: "game",
      action: {
        a: "thiefTurn",
        dest,
        path: plan.path ?? undefined,
        ...(game.thief.cell === null ? { entry: plan.entry! } : {}),
        ...(plan.disableCamera && camera ? { disableCamera: true } : {}),
        ...(plan.cutPower && dest === board.power && !game.power.cut ? { cutPower: true } : {}),
        ...(plan.tryLock && canTryLock && enough ? { tryLock: true } : {}),
      },
    });
    useGameUi.getState().resetTurn();
  };
  return (
    <div className="confirm-card">
      <div className="confirm-head">
        <Icon name="footprints" />
        <b>
          Move {plan.path?.length ?? "?"} space{plan.path?.length === 1 ? "" : "s"} to the {cellLabel(board, dest)}
        </b>
      </div>
      <div className="confirm-options">
        {painting && (
          <p className="opt fixed">
            <Icon name="frame" size={16} /> You'll steal <b>"{ARTWORKS[painting.id].title}"</b>
            {game.thief.revealed ? " at once." : ". It leaves the wall at the start of your next turn (and protects you until then)."}
          </p>
        )}
        {camera && (
          <label className="opt">
            <input type="checkbox" checked={plan.disableCamera} onChange={(e) => set({ plan: { ...plan, disableCamera: e.target.checked } })} /> Disable camera {camera.n} <span className="faint">(secret until someone checks it)</span>
          </label>
        )}
        {dest === board.power && !game.power.cut && (
          <label className="opt">
            <input type="checkbox" checked={plan.cutPower} onChange={(e) => set({ plan: { ...plan, cutPower: e.target.checked } })} /> Cut the power <span className="faint">(kills cameras and motion detectors, secretly)</span>
          </label>
        )}
        {canTryLock && (
          <label className={`opt${enough ? "" : " disabled"}`}>
            <input type="checkbox" disabled={!enough} checked={plan.tryLock && enough} onChange={(e) => set({ plan: { ...plan, tryLock: e.target.checked } })} /> Try lock {slot!.id.toUpperCase()}{" "}
            <span className="faint">{enough ? `(you have ${haul} painting${haul === 1 ? "" : "s"}; everyone sees the flip and your position)` : `(needs ${game.rules.minPaintingsToEscape} paintings, you have ${haul})`}</span>
          </label>
        )}
        {lock?.revealed && <p className="opt fixed faint">This lock is known to be locked.</p>}
      </div>
      <div className="action-row">
        <button className="btn small ghost" onClick={() => set({ plan: { ...plan, dest: null, path: null } })}>
          Undo <span className="kbd">Esc</span>
        </button>
        <span className="spacer" />
        <button className="btn primary" autoFocus onClick={confirm}>
          <Icon name="check" /> {plan.tryLock && canTryLock && enough ? "Move & try the lock" : "Confirm move"} <span className="kbd">Enter</span>
        </button>
      </div>
    </div>
  );
}

function DetectiveCards({ game, send, canMove, canAct }: { game: GameView; send: Send; canMove: boolean; canAct: boolean }) {
  const pawn = activePawn(game)!;
  const turn = game.turn as Extract<GameView["turn"], { kind: "detective" }>;
  const roll = turn.roll!;
  const moveDest = useGameUi((s) => s.moveDest);
  const eyePreview = useGameUi((s) => s.eyePreview);
  const set = useGameUi((s) => s.set);
  const board = getBoard(game.board);
  const ends = canMove ? detectiveEnds(game, pawn, roll.move) : new Map();
  const knownOut = game.power.cut;
  const act = (action: Parameters<Send>[0] & { t: "game" }) => {
    send(action);
    set({ eyePreview: null });
  };
  return (
    <div className="det-cards">
      <div className={`det-card${canMove ? "" : " done"}`}>
        <div className="det-card-head">
          <span className="die-badge num">{roll.move}</span>
          <b>Move</b>
          {!canMove && <Icon name="check" size={16} />}
        </div>
        {canMove ? (
          moveDest === null ? (
            <p className="small">Click a glowing space (up to {roll.move} step{roll.move === 1 ? "" : "s"}; backtracking allowed). {ends.size} options.</p>
          ) : (
            <div className="row wrap">
              <span className="small">To the {cellLabel(board, moveDest)}</span>
              <button className="btn small ghost" onClick={() => set({ moveDest: null })}>
                Undo
              </button>
              <button className="btn small primary" onClick={() => {
                send({ t: "game", action: { a: "move", dest: moveDest } });
                set({ moveDest: null });
              }}>
                Move here <span className="kbd">Enter</span>
              </button>
            </div>
          )
        ) : (
          <p className="small faint">Moved.</p>
        )}
      </div>

      <div className={`det-card${canAct ? "" : " done"}`}>
        <div className="det-card-head">
          <span className="die-badge act">{roll.action === "eye" ? <Icon name="eye" size={18} /> : roll.action === "scan" ? <Icon name="scan" size={18} /> : <Icon name="motion" size={18} />}</span>
          <b>{roll.action === "eye" ? "Eye" : roll.action === "scan" ? "Scan" : "Motion"}</b>
          {!canAct && <Icon name="check" size={16} />}
        </div>
        {canAct ? (
          <div className="row wrap">
            {roll.action === "eye" && (
              <>
                <button className="btn small primary" onMouseEnter={() => set({ eyePreview: "self" })} onFocus={() => set({ eyePreview: "self" })} onMouseLeave={() => set({ eyePreview: null })} onClick={() => act({ t: "game", action: { a: "eye", target: "self" } })} title="Can I see you? (E)">
                  <Icon name="eye" size={16} /> My eyes
                </button>
                {game.cameras.map((c) => (
                  <button
                    key={c.n}
                    className={`btn small icon cam-btn${eyePreview === c.n ? " primary" : ""}`}
                    disabled={knownOut}
                    title={knownOut ? "The power is out" : `Check camera ${c.n} (Shift+${c.n})`}
                    onMouseEnter={() => set({ eyePreview: c.n })}
                    onFocus={() => set({ eyePreview: c.n })}
                    onMouseLeave={() => set({ eyePreview: null })}
                    onClick={() => act({ t: "game", action: { a: "eye", target: c.n } })}
                  >
                    {c.n}
                  </button>
                ))}
              </>
            )}
            {roll.action === "scan" && (
              <button className="btn small primary" disabled={knownOut} onClick={() => act({ t: "game", action: { a: "scan" } })} title="Scan all cameras (S)">
                <Icon name="scan" size={16} /> Scan cameras
              </button>
            )}
            {roll.action === "motion" && (
              <button className="btn small primary" disabled={knownOut} onClick={() => act({ t: "game", action: { a: "motion" } })} title="Motion detectors (M)">
                <Icon name="motion" size={16} /> Motion detectors
              </button>
            )}
            <button className="btn small ghost" onClick={() => act({ t: "game", action: { a: "skipAction" } })} title="Skip (X)">
              Skip
            </button>
            {knownOut && roll.action !== "eye" && <span className="small faint">The power is out: step on the switch (P) to restore it.</span>}
          </div>
        ) : (
          <p className="small faint">Used.</p>
        )}
      </div>
    </div>
  );
}
