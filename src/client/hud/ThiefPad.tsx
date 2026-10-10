// The thief's plotting pad: a paper minimap in the look of the physical pad. The secret trail with
// the E mark and per-turn dots and lines, X on paintings (circled when stolen), numbered cameras
// (struck through when disabled), the two "M" wire-cutter snips and the power state. Also used for
// the round-end replay (with `upTo`).

import { colourOf, getBoard, xyOf, type Cell } from "../../shared/board/model";
import type { GameView } from "../../shared/game/views";
import { Icon } from "../components/Icon";
import { tip } from "../components/Tip";
import { useGameUi } from "../game/uiStore";
import { FLOOR_HEX } from "../scene/textures";

const S = 20; // px per cell
const PAD = 14;
/** How strongly a room's floor colour washes the paper: enough to tell rooms apart, still reads as a printed pad. */
const ROOM_WASH = 0.2;

/** Detectives drawn on the pad during the round-end replay: their routes and where each one stands. */
export interface PadDetectives {
  moves: { pawn: string; from: Cell; path: Cell[]; hex: string; latest: boolean }[];
  pawns: { pawn: string; cell: Cell; hex: string; initial: string }[];
}

export function PadMap({ game, upTo, showAll = true, highlight, detectives }: { game: GameView; upTo?: number; showAll?: boolean; highlight?: Cell | null; detectives?: PadDetectives }) {
  const board = getBoard(game.board);
  const W = board.width * S + PAD * 2;
  const H = board.height * S + PAD * 2;
  const pt = (c: Cell): [number, number] => {
    const [x, y] = xyOf(board, c);
    return [PAD + x * S + S / 2, PAD + y * S + S / 2];
  };
  const trail = (game.thief.trail ?? []).filter((t) => upTo === undefined || t.turn <= upTo);
  const walls: string[] = [];
  for (const c of board.walkable) {
    const [x, y] = xyOf(board, c);
    const edges: [number, number, number, number, number][] = [
      [0, -1, x, y, 0],
      [1, 0, x + 1, y, 1],
      [0, 1, x, y + 1, 0],
      [-1, 0, x, y, 1],
    ];
    for (const [dx, dy, ex, ey, vertical] of edges) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * board.width + nx;
      const inside = nx >= 0 && ny >= 0 && nx < board.width && ny < board.height && board.region[n];
      if (inside && board.neighbours[c].includes(n)) continue;
      if (inside && n < c) continue;
      const slot = board.slotByInside.get(c);
      if (slot && slot.cell === n) continue;
      const x1 = PAD + ex * S;
      const y1 = PAD + ey * S;
      walls.push(vertical ? `M${x1} ${y1}V${y1 + S}` : `M${x1} ${y1}H${x1 + S}`);
    }
  }
  const stolen = new Set(game.thief.stolen ?? []);
  const disabled = new Set(game.cameras.filter((c) => c.disabled).map((c) => c.n));
  const cameraCells: Record<number, Cell> = {};
  for (const e of game.events) if (e.type === "playStarted") Object.assign(cameraCells, e.cameras);
  for (const c of game.cameras) cameraCells[c.n] = c.cell;
  const removed = new Set(Object.keys(cameraCells).map(Number).filter((n) => !game.cameras.some((c) => c.n === n)));
  const last = trail[trail.length - 1];
  const here = last ? last.path[last.path.length - 1] : null;

  return (
    <svg className="pad-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plotting pad map">
      <rect x={PAD - 6} y={PAD - 6} width={W - PAD * 2 + 12} height={H - PAD * 2 + 12} rx="14" fill="none" stroke="#3a2e2a" strokeWidth="1.2" opacity="0.5" />
      {board.walkable.map((c) => {
        const [x, y] = xyOf(board, c);
        return (
          <g key={c}>
            <rect x={PAD + x * S} y={PAD + y * S} width={S} height={S} fill="#fffaf0" />
            <rect x={PAD + x * S} y={PAD + y * S} width={S} height={S} fill={FLOOR_HEX[colourOf(board, c)][0]} fillOpacity={ROOM_WASH} stroke="#e3d2ae" strokeWidth="1" />
          </g>
        );
      })}
      <path d={walls.join(" ")} stroke="#3a2e2a" strokeWidth="3.2" strokeLinecap="square" />
      {board.slots.map((s) => {
        const [x, y] = pt(s.cell);
        const entry = game.thief.entry === s.id;
        const lock = game.locks.find((l) => l.slot === s.id);
        return (
          <g key={s.id}>
            <rect x={x - 6} y={y - 6} width="12" height="12" fill="none" stroke="#3a2e2a" strokeWidth="1.2" />
            {lock?.revealed && <text x={x} y={y + 4} textAnchor="middle" className="pad-hand" fontSize="11" fill={lock.face === "open" ? "#1f8f6a" : "#b81e3e"}>{lock.face === "open" ? "O" : "L"}</text>}
            {entry && (
              <text x={x} y={y + 5} textAnchor="middle" className="pad-hand" fontSize="16" fill="#b81e3e">
                E
              </text>
            )}
          </g>
        );
      })}
      {(() => {
        const [x, y] = pt(board.power);
        return (
          <text x={x} y={y + 5} textAnchor="middle" className="pad-hand" fontSize="14" fill="#3a2e2a">
            P
          </text>
        );
      })()}
      {game.paintings.map((p) => {
        const [x, y] = pt(p.cell);
        const taken = stolen.has(p.id) || p.status === "stolen";
        return (
          <g key={p.id} className="pad-hand">
            <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}`} stroke="#3a2e2a" strokeWidth="1.8" strokeLinecap="round" />
            {taken && <circle cx={x} cy={y} r="8" fill="none" stroke="#b81e3e" strokeWidth="1.6" />}
          </g>
        );
      })}
      {Object.entries(cameraCells).map(([n, cell]) => {
        const [x, y] = pt(cell);
        const dead = disabled.has(Number(n)) || removed.has(Number(n));
        return (
          <g key={n}>
            <circle cx={x} cy={y} r="7" fill="#fffaf0" stroke="#3a2e2a" strokeWidth="1.3" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fontWeight="800" fill="#3a2e2a">
              {n}
            </text>
            {dead && <path d={`M${x - 8} ${y + 8}L${x + 8} ${y - 8}`} stroke="#b81e3e" strokeWidth="2" />}
          </g>
        );
      })}
      {detectives?.moves.map((m, i) => {
        const d = [m.from, ...m.path].map(pt).map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join(" ");
        return <path key={`dm${i}`} d={d} fill="none" stroke={m.hex} strokeWidth={m.latest ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" opacity={m.latest ? 0.95 : 0.3} className="pad-detective-route" />;
      })}
      {showAll &&
        trail.map((t, i) => {
          const pts = [t.from, ...t.path].map(pt);
          const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join(" ");
          const [ex, ey] = pts[pts.length - 1];
          const latest = i === trail.length - 1;
          return (
            <g key={t.turn}>
              <path d={d} fill="none" stroke={t.public ? "#b81e3e" : "#2a4a9a"} strokeWidth={latest ? 2.4 : 1.6} strokeLinecap="round" strokeLinejoin="round" opacity={latest ? 1 : 0.55} strokeDasharray={t.public ? "4 3" : undefined} />
              <circle cx={ex} cy={ey} r={latest ? 3.6 : 2.6} fill={t.public ? "#b81e3e" : "#2a4a9a"} />
              <text x={ex + 5} y={ey - 4} fontSize="8" className="pad-hand" fill="#2a4a9a">
                {t.turn}
              </text>
            </g>
          );
        })}
      {here !== null && (() => {
        const [x, y] = pt(here);
        return <circle cx={x} cy={y} r="7.5" fill="none" stroke="#ffc14d" strokeWidth="2.4" className="pad-here" />;
      })()}
      {detectives?.pawns.map((p) => {
        const [x, y] = pt(p.cell);
        return (
          <g key={`dp${p.pawn}`} className="pad-detective">
            <circle cx={x} cy={y} r="6.5" fill={p.hex} stroke="#3a2e2a" strokeWidth="1.6" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#1b1730">
              {p.initial}
            </text>
          </g>
        );
      })}
      {highlight !== undefined && highlight !== null && (() => {
        const [x, y] = pt(highlight);
        return <circle cx={x} cy={y} r="9" fill="none" stroke="#b81e3e" strokeWidth="2.4" />;
      })()}
    </svg>
  );
}

export function ThiefPad({ game }: { game: GameView }) {
  const open = useGameUi((s) => s.padOpen);
  const set = useGameUi((s) => s.set);
  if (!open) return null;
  const all = [1, 2, 3, 4, 5, 6];
  const onBoard = new Map(game.cameras.map((c) => [c.n, c]));
  return (
    <aside className="thief-pad" data-hud="side" aria-label="Plotting pad">
      <div className="pad-head">
        <span className="pad-title">Plotting pad</span>
        <span className="pad-secret" {...tip("Private to you", "Your trail is hidden from the detectives. Only you can see this pad.")}>🔒 only you</span>
        <button className="btn small icon ghost pad-close" aria-label="Close pad" {...tip("Close the pad", undefined, "P")} onClick={() => set({ padOpen: false })}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <PadMap game={game} />
      <div className="pad-foot">
        <div className="pad-snips" {...tip("Wire snips", `When motion detectors go off you can snip the wires instead of telling the detectives your floor colour. ${game.thief.snipsLeft} of 2 left.`)}>
          {[0, 1].map((i) => (
            <span key={i} className={`pad-m${i >= game.thief.snipsLeft ? " used" : ""}`}>
              M
            </span>
          ))}
          <Icon name="scissors" size={22} />
        </div>
        <div className="pad-cams">
          {all.map((n) => {
            const cam = onBoard.get(n);
            const setup = game.phase.startsWith("setup");
            const dead = !setup && (!cam || cam.disabled);
            return (
              <span
                key={n}
                className={`pad-cam${dead ? " dead" : ""}`}
                {...tip(
                  !cam ? `Camera ${n}: removed` : cam.disabled ? `Camera ${n}: disabled` : `Camera ${n}: working`,
                  !cam ? "A detective's scan found it dead and took it down." : cam.disabled ? "You disabled it. The detectives won't know until they check it." : "Still watching. End a move on it to secretly disable it.",
                )}
              >
                {n}
              </span>
            );
          })}
        </div>
        <div className={`pad-power${game.power.cut ? " cut" : ""}`} {...tip("Power", game.power.cut ? "Cameras and motion detectors are out until a detective restores the power." : "End a move on the power switch (P) to secretly cut it. That kills cameras and motion detectors.")}>
          <Icon name="bolt" size={16} /> {game.power.cut ? (game.power.discovered ? "Power out (found)" : "Power cut (secret)") : "Power on"}
        </div>
        <div className="pad-haul" {...tip("Paintings", `You need ${game.rules.minPaintingsToEscape} to escape. A painting you step onto leaves the wall at the start of your next turn.`)}>
          <Icon name="frame" size={16} /> {game.thief.haul} stolen{game.thief.pending != null ? " (1 still on the wall)" : ""}
        </div>
      </div>
    </aside>
  );
}
