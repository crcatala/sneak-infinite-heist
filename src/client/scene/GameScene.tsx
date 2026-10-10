// The in-game 3D board: museum, pieces from the viewer's GameView, overlays, picking and camera.
// Renders on demand: moving pieces, pulsing overlays and camera moves request frames; idle, it's still.

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getBoard, type Cell } from "../../shared/board/model";
import type { GameView } from "../../shared/game/views";
import type { RoomView } from "../../shared/protocol";
import { activePawn, pawnHex } from "../game/derive";
import type { BoardInteraction, PressAt } from "../game/interact";
import { useFx } from "../game/present";
import { buildReplay } from "../game/replay";
import { useGameUi } from "../game/uiStore";
import { usePrefs } from "../prefs";
import { Mover, PopIn } from "./Actors";
import { CameraRig } from "./CameraRig";
import { cellAtWorld, cellPos, FLOOR_Y, worldToGrid } from "./layout";
import { Floors, Plaza, Plinths, Walls } from "./Museum";
import { Marker, NumberBadge, PathDots, SpotColumn, TileLayer } from "./Overlays";
import { CameraPiece, Padlock, PaintingPiece, Pawn, PowerSwitch, ThiefPawn } from "./pieces";
import { Pins } from "./Pins";
import { NightLights, SceneCanvas, type LightMood } from "./SceneCanvas";
import { discTexture, glowTexture } from "./textures";

export function GameScene({ view, game, ix }: { view: RoomView; game: GameView; ix: BoardInteraction }) {
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth);
  useEffect(() => {
    const onResize = () => setPortrait(innerHeight > innerWidth);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  return (
    <SceneCanvas frameloop="demand" camera={{ position: [0, 15.5, 14.9], fov: 40 }} fog={[40, 90]}>
      <Contents view={view} game={game} ix={ix} portrait={portrait} />
    </SceneCanvas>
  );
}

function Contents({ view, game, ix, portrait }: { view: RoomView; game: GameView; ix: BoardInteraction; portrait: boolean }) {
  const board = getBoard(game.board);
  const colourBlind = usePrefs((s) => s.colourBlind);
  const ui = useGameUi();
  const fx = useFx();
  const [wallScale, setWallScale] = useState(1);
  const { invalidate } = useThree();

  useEffect(() => invalidate(), [game, ix, fx, invalidate]);

  const mood: LightMood = game.power.cut ? "emergency" : game.thief.revealed && game.phase === "play" ? "chase" : "night";
  const iAmThief = view.role === "thief";

  // Last path per detective pawn, for walking animations.
  const paths = useMemo(() => {
    const out: Record<string, Cell[]> = {};
    for (const e of game.events) if (e.type === "detectiveMoved") out[e.pawn] = e.path;
    return out;
  }, [game.events]);
  const thiefPath = useMemo(() => {
    for (let i = game.events.length - 1; i >= 0; i--) {
      const e = game.events[i];
      if (e.type === "thiefMoved" && e.path) return e.path;
    }
    return null;
  }, [game.events]);

  const focus = useMemo(() => {
    const mine = game.detectives.find((d) => d.controller === view.you && d.cell !== null);
    const active = activePawn(game);
    const cell = iAmThief ? game.thief.cell : ((active?.controller === view.you ? active.cell : null) ?? mine?.cell ?? null);
    return cell !== null ? cellPos(board, cell, 0) : null;
  }, [game, view.you, iAmThief, board]);

  // Round-end replay: the thief stands where they were after the chosen turn.
  const replay = game.phase === "roundOver" && ui.replayTurn !== null && game.thief.trail ? game.thief.trail : null;
  const replayStep = replay && ui.replayTurn! > 0 ? replay[ui.replayTurn! - 1] : null;
  // Escaped: the thief dashes out onto the exit's plinth.
  const escapedTo = game.result?.reason === "escaped" && game.result.slot && ui.replayTurn === null ? board.slotById[game.result.slot].cell : null;
  // ...and, if wanted, so are the detectives: where each stood after that turn and how they got there.
  const rounds = useMemo(() => (replay ? buildReplay({ view, game }) : null), [replay, view, game]);
  // Walk a replay step only when the scrubber moved one turn forward (play, or a nudge): after a jump or
  // a step back the pieces just stand where they were, instead of gliding along a route they didn't take.
  const prevReplayTurn = useRef(ui.replayTurn);
  useEffect(() => {
    prevReplayTurn.current = ui.replayTurn;
  }, [ui.replayTurn]);
  const stepped = ui.replayTurn !== null && prevReplayTurn.current !== null && ui.replayTurn === prevReplayTurn.current + 1;
  const detReplay = rounds && ui.replayDetectives ? rounds[Math.min(ui.replayTurn!, rounds.length - 1)] : null;
  const thiefShown = replay ? (replayStep ? replayStep.path[replayStep.path.length - 1] : null) : (escapedTo ?? game.thief.cell);

  const lifting = fx.lifting && fx.lifting.until > performance.now() ? fx.lifting : null;
  const flipping = fx.flipping && fx.flipping.until > performance.now() ? fx.flipping : null;
  const spots = fx.flashes.filter((f) => f.kind === "spot");
  const sparks = fx.flashes.filter((f) => f.kind === "spark");

  return (
    <>
      <NightLights mood={mood} />
      <CameraRig board={board} preset={ui.camera} nonce={ui.cameraNonce} focus={focus} onWallScale={setWallScale} portrait={portrait} />
      <Floors board={board} patterns={colourBlind} />
      <Walls board={board} height={wallScale} />
      <Plinths board={board} />
      <Plaza board={board} lampsOn={!game.power.cut} />
      <Compass board={board} />

      {/* padlocks */}
      {game.locks.map((l) => {
        const s = board.slotById[l.slot];
        const p = cellPos(board, s.cell, 0.3);
        const known = l.face !== undefined;
        const flip = flipping?.slot === l.slot;
        return (
          <group key={l.slot} position={p} rotation={[0, Math.PI, 0]}>
            <LockFlip revealed={l.revealed} flipping={flip}>
              <Padlock face={l.revealed || known ? (l.face ?? null) : null} />
            </LockFlip>
            {l.revealed && l.face === "locked" && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.36, 0.44, 20]} />
                <meshBasicMaterial color="#ff4d6d" />
              </mesh>
            )}
            {!l.revealed && known && game.phase.startsWith("setup") === false && view.role === "detective" && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.36, 0.42, 20]} />
                <meshBasicMaterial color={l.face === "open" ? "#4fe0b0" : "#ff4d6d"} transparent opacity={0.6} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* paintings */}
      {game.paintings.map((p) => {
        const gone = p.status === "stolen";
        const lift = lifting?.painting === p.id;
        if (gone && !lift) return null;
        return (
          <group key={p.id} position={cellPos(board, p.cell)}>
            <PopIn>
              <LiftAway active={lift}>
                <FaceCamera>
                  <PaintingPiece id={p.id} lit={!game.power.cut} />
                </FaceCamera>
              </LiftAway>
            </PopIn>
            {p.status === "pending" && iAmThief && <Marker board={board} cell={p.cell} label="X" colour="#ffc14d" height={0.95} size={0.3} />}
            {ui.held?.kind === "piece" && ui.held.from === p.cell && <HeldGlow />}
          </group>
        );
      })}

      {/* the power switch */}
      <group position={cellPos(board, board.power)}>
        <PopIn>
          <PowerSwitch on={!game.power.cut} />
        </PopIn>
      </group>

      {/* cameras */}
      {game.cameras.map((c) => (
        <group key={c.n} position={cellPos(board, c.cell)}>
          <PopIn>
            <CameraPiece n={c.n} led={game.power.cut ? "off" : c.disabled ? "dead" : "on"} />
          </PopIn>
          {ui.held?.kind === "piece" && ui.held.from === c.cell && <HeldGlow />}
        </group>
      ))}
      {sparks.map((s) => (
        <Sparks key={s.id} position={cellPos(board, s.cells[0], 0.3)} />
      ))}

      {/* detectives */}
      {game.detectives.map((d) => {
        const cell = detReplay ? (detReplay.positions[d.id] ?? null) : d.cell;
        if (cell === null) return null;
        const move = detReplay?.moves.filter((m) => m.pawn === d.id).pop();
        return (
          <Mover key={d.id} board={board} cell={cell} path={detReplay ? move?.path : paths[d.id]} walk={detReplay ? (stepped && move ? move : null) : undefined} stepKey={ui.replayTurn ?? undefined}>
            <Pawn colour={d.character} />
            {activePawn(game)?.id === d.id && game.phase === "play" && <ActiveRing />}
          </Mover>
        );
      })}
      {detReplay?.moves.map((m, i) => (
        <PathDots key={`dm${i}`} board={board} from={m.from} path={m.path} colour={pawnHex(game, m.pawn)} />
      ))}
      {ix.pawnGhost && (() => {
        const d = game.detectives.find((x) => x.id === ix.pawnGhost!.pawn);
        return d ? (
          <group position={cellPos(board, ix.pawnGhost.cell)}>
            <GhostPawn colour={d.character} />
          </group>
        ) : null;
      })()}

      {/* the thief */}
      {replayStep && <PathDots board={board} from={replayStep.from} path={replayStep.path} colour="#ff6b81" />}
      {thiefShown !== null && (game.thief.revealed || iAmThief || game.phase === "roundOver") && (
        <Mover board={board} cell={thiefShown} walk={replay ? (stepped && replayStep ? replayStep : null) : undefined} stepKey={ui.replayTurn ?? undefined} path={replay ? replayStep?.path : escapedTo !== null ? [escapedTo] : thiefPath} stepMs={escapedTo !== null ? 380 : 150} hop={escapedTo !== null ? 0.6 : 0.22}>
          {game.thief.revealed || game.phase === "roundOver" ? (
            <PopIn>
              <ThiefPawn haul={game.thief.haul} />
            </PopIn>
          ) : (
            <ThiefPawn haul={game.thief.haul} ghost />
          )}
        </Mover>
      )}
      {iAmThief &&
        ix.ghosts
          .filter((c) => c !== game.thief.cell)
          .map((c) => (
            <group key={`g${c}`} position={cellPos(board, c)}>
              <ThiefPawn haul={game.thief.haul} ghost />
            </group>
          ))}

      {/* overlays */}
      <TileLayer board={board} tiles={ix.tiles} />
      {ix.badges.map((b) => (
        <NumberBadge key={`b${b.cell}`} board={board} cell={b.cell} n={b.n} colour={b.colour} />
      ))}
      {ix.markers.map((m, i) => (
        <Marker key={`m${m.cell}${i}`} board={board} cell={m.cell} label={m.label} colour={m.colour} />
      ))}
      {ix.path && <PathDots board={board} from={ix.path.from} path={ix.path.path} />}
      {spots.map((s) => (
        <SpotColumn key={s.id} board={board} cell={s.cells[0]} />
      ))}
      {ui.cursor !== null && <CursorRing position={cellPos(board, ui.cursor)} />}
      {game.result?.reason === "captured" && game.result.cell !== undefined && ui.replayTurn === null && <Handcuffs position={cellPos(board, game.result.cell)} />}

      <Pins board={board} game={game} />

      <Picker board={board} ix={ix} />
    </>
  );
}

/** The invisible plane that turns pointer events into board cells. */
function Picker({ board, ix }: { board: ReturnType<typeof getBoard>; ix: BoardInteraction }) {
  const set = useGameUi((s) => s.set);
  const down = useRef<{ x: number; y: number; t: number; button: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cellOfEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => cellAtWorld(board, e.point.x, e.point.z);
  /** The exact spot under the pointer, in board-grid units (pins aren't snapped to cell centres). */
  const gridOfEvent = (e: ThreeEvent<PointerEvent | MouseEvent>, mark = false): PressAt => {
    const [x, y] = worldToGrid(board, e.point.x, e.point.z);
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, mark };
  };
  const slotOf = (cell: Cell | null) => (cell === null ? null : (board.slots.find((s) => s.cell === cell)?.id ?? null));

  return (
    <mesh
      position={[0, FLOOR_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e) => {
        const cell = cellOfEvent(e);
        const hs = slotOf(cell);
        const s = useGameUi.getState();
        if (s.hover !== cell || s.hoverSlot !== hs) set({ hover: cell, hoverSlot: hs, cursor: null });
        if (down.current && Math.hypot(e.nativeEvent.clientX - down.current.x, e.nativeEvent.clientY - down.current.y) > 8) clearTimeout(press.current);
      }}
      onPointerOut={() => set({ hover: null, hoverSlot: null })}
      onPointerDown={(e) => {
        down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, t: performance.now(), button: e.nativeEvent.button };
        const cell = cellOfEvent(e);
        if (e.nativeEvent.pointerType === "touch" && cell !== null) {
          clearTimeout(press.current);
          const at = gridOfEvent(e);
          press.current = setTimeout(() => {
            down.current = null;
            ix.context(cell, at);
            navigator.vibrate?.(20);
          }, 550);
        }
      }}
      onPointerUp={(e) => {
        clearTimeout(press.current);
        const d = down.current;
        down.current = null;
        if (!d || d.button !== 0) return;
        // A drag rotates the camera; only a tap/click counts.
        if (Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) > 8) return;
        const cell = cellOfEvent(e);
        if (cell !== null) ix.click(cell);
      }}
      onContextMenu={(e) => {
        e.nativeEvent.preventDefault();
        const cell = cellOfEvent(e);
        if (cell !== null) ix.context(cell, gridOfEvent(e, e.nativeEvent.shiftKey));
      }}
    >
      <planeGeometry args={[board.width + 2, board.height + 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Turns its children around the vertical axis to face the camera (paintings stay readable). */
function FaceCamera({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(world);
    const yaw = Math.atan2(camera.position.x - world.x, camera.position.z - world.z);
    // Snap to quarter turns so they read as placed pieces, not floating sprites.
    g.rotation.y = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  });
  return <group ref={ref}>{children}</group>;
}

/** A little "N" arrow on the plaza, north of the building. */
function Compass({ board }: { board: ReturnType<typeof getBoard> }) {
  const p = cellPos(board, 3, 0.02);
  return (
    <group position={[p.x, 0.02, p.z - 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0.3, 0]}>
        <coneGeometry args={[0.28, 0.6, 3]} />
        <meshBasicMaterial color="#ffc14d" />
      </mesh>
      <sprite position={[0, -0.25, 0.3]} scale={[0.5, 0.5, 1]}>
        <spriteMaterial map={discTexture("N", "#07061a", "#ffc14d")} depthWrite={false} />
      </sprite>
    </group>
  );
}

/** A pair of chunky handcuffs spinning over the arrest. */
function Handcuffs({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    t.current += dt;
    g.rotation.y += dt * 1.6;
    g.position.y = 1.35 + Math.sin(t.current * 2) * 0.08;
    const s = Math.min(1, t.current / 0.35);
    g.scale.setScalar(s < 1 ? 0.2 + 0.8 * (1 - (1 - s) ** 3) * 1.1 : 1);
    invalidate();
  });
  const metal = <meshStandardMaterial color="#d8dce8" metalness={0.8} roughness={0.25} emissive="#5a6078" emissiveIntensity={0.4} />;
  return (
    <group position={[position.x, 1.35, position.z]}>
      <group ref={ref}>
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.045, 8, 18]} />
            {metal}
          </mesh>
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.025, 0.025, 0.12, 6]} />
          {metal}
        </mesh>
      </group>
    </group>
  );
}

function ActiveRing() {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.34, 0.44, 24]} />
      <meshBasicMaterial color="#ffc14d" transparent opacity={0.9} />
    </mesh>
  );
}

function HeldGlow() {
  return (
    <sprite position={[0, 0.4, 0]} scale={[1.4, 1.4, 1]}>
      <spriteMaterial map={glowTexture()} color="#ffc14d" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

function CursorRing({ position }: { position: THREE.Vector3 }) {
  return (
    <mesh position={[position.x, FLOOR_Y + 0.03, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.48, 4, 1, Math.PI / 4]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

function GhostPawn({ colour }: { colour: Parameters<typeof Pawn>[0]["colour"] }) {
  return (
    <group>
      <group scale={[1, 1, 1]}>
        <Pawn colour={colour} dim />
      </group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.42, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/** A painting lifting off its easel and fading away (stolen). */
function LiftAway({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const { invalidate } = useThree();
  useFrameIf(active, (dt) => {
    const g = ref.current;
    if (!g) return;
    t.current = Math.min(1, t.current + dt / 0.9);
    g.position.y = t.current * 1.4;
    g.rotation.y = t.current * 3;
    g.scale.setScalar(1 - t.current * 0.9);
    invalidate();
  });
  return <group ref={ref}>{children}</group>;
}

/** Padlocks turn over when flipped (and stay face up). */
function LockFlip({ revealed, flipping, children }: { revealed: boolean; flipping: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(revealed && !flipping ? 1 : 0);
  const { invalidate } = useThree();
  useFrameIf(revealed, (dt) => {
    const g = ref.current;
    if (!g) return;
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / 0.8);
      invalidate();
    }
    const e = t.current;
    g.position.y = Math.sin(e * Math.PI) * 0.6;
    g.rotation.x = -e * (Math.PI / 2) * 0.85;
  });
  return <group ref={ref}>{children}</group>;
}

function Sparks({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const { invalidate } = useThree();
  const dirs = useMemo(() => Array.from({ length: 10 }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize()), []);
  useFrameIf(true, (dt) => {
    t.current += dt;
    ref.current?.children.forEach((c, i) => {
      c.position.copy(dirs[i]).multiplyScalar(t.current * 1.4);
      c.position.y -= t.current * t.current * 1.5;
      c.scale.setScalar(Math.max(0.001, 1 - t.current));
    });
    invalidate();
  });
  return (
    <group ref={ref} position={position}>
      {dirs.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshBasicMaterial color={i % 2 ? "#ffd36b" : "#ff6b81"} />
        </mesh>
      ))}
    </group>
  );
}

function useFrameIf(on: boolean, cb: (dt: number) => void) {
  useFrame((_, dt) => {
    if (on) cb(dt);
  });
}
