// The bottom panel: one prompt line and the primary action(s) for whatever the game needs from you
// right now. Setup tools, the thief's confirm card, the detective's roll / move / action cards.

import { getBoard, regionName } from "../../shared/board/model";
import { ARTWORKS, character } from "../../shared/characters";
import { lockSplit, setupProblem } from "../../shared/game/setup";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { Icon } from "../components/Icon";
import { tip } from "../components/Tip";
import { activePawn, cellLabel, detectiveEnds, playerName, slotLabel } from "../game/derive";
import type { BoardInteraction } from "../game/interact";
import { EMPTY_PLAN, useGameUi } from "../game/uiStore";
import { sfx } from "../sfx";
import { useStore } from "../store";
import { useRolling } from "./DiceTray";

type Send = ReturnType<typeof useStore.getState>["send"];

export function ActionPanel({ view, game, ix }: { view: RoomView; game: GameView; ix: BoardInteraction }) {
  const send = useStore((s) => s.send);
  const rolling = useRolling();
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
          <p className="prompt">
            Roll both dice: the <b>black</b> one is how far you walk, the <b>white</b> one is your action (Eye, Scan or Motion).
          </p>
          <button
            className="btn primary big"
            autoFocus
            {...tip("Roll the dice", "The black die is how far you can walk. The white die is your action: Eye, Scan or Motion.", "Space", "top")}
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
    <section className={`action-panel panel glass${m.kind === "detAct" || m.kind === "detRoll" ? " det" : ""}`} data-hud="band" aria-label="Your actions">
      {body}
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
                <span key={r} className={`room-chip floor-${board.colours[r]}${n ? " ok" : ""}`} {...tip(regionName(board, r), n ? `${n} painting${n === 1 ? "" : "s"} hung here.` : "Needs at least one painting.", undefined, "top")}>
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
      <button className="btn small" {...tip("Auto-place", "Fill in this step with a sensible random layout. You can still move things afterwards.", undefined, "top")} onClick={() => send({ t: "game", action: { a: "autoPlace" } })}>
        <Icon name="sparkle" size={16} /> Auto-place
      </button>
      <button className="btn small" {...tip("Clear", "Take everything off the board for this step and start again.", undefined, "top")} onClick={() => send({ t: "game", action: { a: "clear" } })}>
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

const ACTION_INFO = {
  eye: { name: "Eye", icon: "eye", blurb: "Look for the thief." },
  scan: { name: "Scan", icon: "scan", blurb: "Ask every working camera at once. Dead (sabotaged) ones are found and removed." },
  motion: { name: "Motion", icon: "motion", blurb: "The thief must say which floor colour they're on, or snip the wires (they only get two snips all round)." },
} as const;

/**
 * Both rolled dice as one slim row: Move on the left, the action on the right. Each side is a line of
 * controls plus a single caption that explains whatever you're hovering, so the rules are on hand
 * without a paragraph per button.
 */
function DetectiveCards({ game, send, canMove, canAct }: { game: GameView; send: Send; canMove: boolean; canAct: boolean }) {
  const pawn = activePawn(game)!;
  const turn = game.turn as Extract<GameView["turn"], { kind: "detective" }>;
  const roll = turn.roll!;
  const moveDest = useGameUi((s) => s.moveDest);
  const eyePreview = useGameUi((s) => s.eyePreview);
  const eyeTarget = useGameUi((s) => s.eyeTarget);
  const set = useGameUi((s) => s.set);
  const board = getBoard(game.board);
  const ends = canMove ? detectiveEnds(game, pawn, roll.move) : new Map();
  const knownOut = game.power.cut;
  const info = ACTION_INFO[roll.action];
  const act = (action: Parameters<Send>[0] & { t: "game" }) => {
    send(action);
    set({ eyePreview: null, eyeTarget: null });
  };
  const pickEye = (target: "self" | number) => set({ eyeTarget: target, eyePreview: target });
  const cancelEye = () => set({ eyeTarget: null, eyePreview: null });
  const roomOf = (n: number) => {
    const cam = game.cameras.find((c) => c.n === n);
    return cam ? cellLabel(board, cam.cell) : "museum";
  };
  const eyeCaption =
    eyePreview === "self"
      ? "Your own eyes: straight lines from where you stand. A yes reveals the thief to everyone."
      : typeof eyePreview === "number"
        ? `Security camera ${eyePreview} (in the ${roomOf(eyePreview)}): answers yes or no from its own spot, without revealing the thief.`
        : "Look for the thief with your own eyes or a numbered security camera. You'll confirm before it counts.";
  const eyeHover = (v: "self" | number) => ({
    onMouseEnter: () => set({ eyePreview: v }),
    onFocus: () => set({ eyePreview: v }),
    onMouseLeave: () => set({ eyePreview: null }),
    onBlur: () => set({ eyePreview: null }),
  });
  return (
    <div className="det-row">
      <div className={`det-seg${canMove ? "" : " done"}`}>
        <div className="seg-line">
          <span className="die-badge num" {...tip("Movement die", `You can walk up to ${roll.move} space${roll.move === 1 ? "" : "s"} this turn. You can move before or after your action.`, undefined, "top")}>
            {roll.move}
          </span>
          <b>Move up to {roll.move}</b>
          {!canMove && (
            <>
              <Icon name="check" size={16} />
              <span className="faint small">Moved</span>
            </>
          )}
          {canMove && moveDest !== null && (
            <>
              <span className="spacer" />
              <button className="btn small ghost" {...tip("Undo", "Forget the chosen space and pick another.", "Esc", "top")} onClick={() => set({ moveDest: null })}>
                Undo <span className="kbd">Esc</span>
              </button>
              <button
                className="btn small primary"
                {...tip("Move here", "Walk your pawn to the chosen space.", "Enter", "top")}
                onClick={() => {
                  send({ t: "game", action: { a: "move", dest: moveDest } });
                  set({ moveDest: null });
                }}
              >
                Move here <span className="kbd">Enter</span>
              </button>
            </>
          )}
        </div>
        {canMove && (
          <p className="seg-cap">
            {moveDest === null ? (
              <>
                <b>Click a glowing space</b> ({ends.size} option{ends.size === 1 ? "" : "s"}). You can't stop on a painting or another detective.
              </>
            ) : (
              <>
                To the <b>{cellLabel(board, moveDest)}</b>. Move here, or click another glowing space.
              </>
            )}
          </p>
        )}
      </div>

      <div className={`det-seg${canAct ? "" : " done"}`}>
        {!canAct && (
          <div className="seg-line">
            <span className="die-badge act" {...tip(`${info.name} die`, info.blurb, undefined, "top")}>
              <Icon name={info.icon} size={18} />
            </span>
            <b>{info.name}</b>
            <Icon name="check" size={16} />
            <span className="faint small">Used</span>
          </div>
        )}
        {canAct && roll.action === "eye" && eyeTarget === null && (
          <>
            <div className="seg-line">
              <span className="die-badge act" {...tip(`${info.name} die`, info.blurb, undefined, "top")}>
                <Icon name="eye" size={18} />
              </span>
              <b>Eye</b>
              <span className="grp">
                <span className="grp-label">Your own eyes</span>
                <button className="btn small primary" {...eyeHover("self")} {...tip("My eyes", "Look for the thief in straight lines from where you stand. A yes reveals them to everyone.", "E", "top")} onClick={() => pickEye("self")}>
                  <Icon name="eye" size={16} /> My eyes
                </button>
              </span>
              <span className="grp">
                <span className="grp-label">Security cameras</span>
                <span className="cam-row">
                  {game.cameras.map((c) => (
                    <button
                      key={c.n}
                      className={`cam-btn${eyePreview === c.n ? " active" : ""}`}
                      disabled={knownOut}
                      aria-label={`Security camera ${c.n}`}
                      {...tip(`Camera ${c.n}`, knownOut ? "The power is out, so cameras can't answer." : `In the ${roomOf(c.n)}. Asks it whether it can see the thief, without revealing them.`, `Shift+${c.n}`, "top")}
                      {...eyeHover(c.n)}
                      onClick={() => pickEye(c.n)}
                    >
                      <i>{c.n}</i>
                    </button>
                  ))}
                </span>
              </span>
              <span className="spacer" />
              <SkipButton act={act} />
            </div>
            <p className="seg-cap">{knownOut && typeof eyePreview !== "number" ? "The power is out, so cameras can't answer. Step on the power switch to bring them back." : eyeCaption}</p>
          </>
        )}
        {canAct && roll.action === "eye" && eyeTarget !== null && (
          <>
            <div className="seg-line">
              <span className="die-badge act" {...tip(`${info.name} die`, info.blurb, undefined, "top")}>
                <Icon name="eye" size={18} />
              </span>
              <b>{eyeTarget === "self" ? "Use my eyes?" : `Ask camera ${eyeTarget}?`}</b>
              <span className="spacer" />
              <button className="btn small ghost" {...tip("Cancel", "Pick a different way to look.", "Esc", "top")} onClick={cancelEye}>
                Cancel <span className="kbd">Esc</span>
              </button>
              <button className="btn small primary" autoFocus {...tip(eyeTarget === "self" ? "Look" : `Check camera ${eyeTarget}`, "Spend your action on this.", "Enter", "top")} onClick={() => act({ t: "game", action: { a: "eye", target: eyeTarget } })}>
                <Icon name="check" size={16} /> {eyeTarget === "self" ? "Look" : `Check camera ${eyeTarget}`} <span className="kbd">Enter</span>
              </button>
            </div>
            <p className="seg-cap">
              {eyeTarget === "self" ? (
                <>
                  Look from where you stand. If you spot the thief, <b className="alarm-text">they're revealed</b> to everyone.
                </>
              ) : (
                <>
                  Security camera {eyeTarget} (in the {roomOf(eyeTarget)}) answers yes or no to everyone, without revealing the thief.
                </>
              )}
            </p>
          </>
        )}
        {canAct && roll.action !== "eye" && (
          <>
            <div className="seg-line">
              <span className="die-badge act" {...tip(`${info.name} die`, info.blurb, undefined, "top")}>
                <Icon name={info.icon} size={18} />
              </span>
              <b>{info.name}</b>
              <button className="btn small primary" disabled={knownOut} onClick={() => act({ t: "game", action: roll.action === "scan" ? { a: "scan" } : { a: "motion" } })} {...tip(roll.action === "scan" ? "Scan all cameras" : "Motion detectors", info.blurb, roll.action === "scan" ? "S" : "M", "top")}>
                <Icon name={info.icon} size={16} /> {roll.action === "scan" ? "Scan cameras" : "Motion detectors"} <span className="kbd">{roll.action === "scan" ? "S" : "M"}</span>
              </button>
              <span className="spacer" />
              <SkipButton act={act} />
            </div>
            <p className="seg-cap">{knownOut ? "The power is out: step on the switch to restore it." : info.blurb}</p>
          </>
        )}
      </div>
    </div>
  );
}

function SkipButton({ act }: { act: (a: Parameters<Send>[0] & { t: "game" }) => void }) {
  return (
    <button className="btn small ghost" onClick={() => act({ t: "game", action: { a: "skipAction" } })} {...tip("Skip the action", "Give up this action without using it.", "X", "top")}>
      Skip <span className="kbd">X</span>
    </button>
  );
}
