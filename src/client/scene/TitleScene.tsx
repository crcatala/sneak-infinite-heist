// The live title scene: the museum at night, built from the game's own pieces. A slow cinematic
// camera drift, sweeping searchlights, a guard's flashlight, camera beams, glinting paintings, and
// the thief slipping between shadows. Each menu page reframes the camera.

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CLASSIC_BOARD } from "../../shared/board/classic";
import { cellOf, getBoard, type Cell } from "../../shared/board/model";
import { shortestPath } from "../../shared/board/paths";
import { usePrefs, useReducedMotion } from "../prefs";
import { cellPos, FLOOR_Y } from "./layout";
import { Floors, Plaza, Plinths, Walls } from "./Museum";
import { CameraPiece, Padlock, PaintingPiece, Pawn, ThiefPawn } from "./pieces";
import { NightLights, SceneCanvas } from "./SceneCanvas";
import { beamTexture, glowTexture } from "./textures";

export type TitleFrame = "title" | "menu" | "online" | "solo" | "settings" | "credits" | "name";

const board = getBoard(CLASSIC_BOARD);
const C = (x: number, y: number) => cellOf(board, x, y);

const PAINTINGS: [number, number, number][] = [
  [0, 6, 1], [1, 2, 3], [2, 12, 4], [3, 2, 7], [4, 11, 9], [5, 6, 6], [6, 7, 5], [7, 4, 11], [8, 9, 1],
];
const CAMERAS: [number, number, number][] = [[1, 4, 3], [2, 9, 9], [3, 11, 6]];

/** Camera position/target per menu page. */
const FRAMES: Record<TitleFrame, { pos: [number, number, number]; look: [number, number, number]; drift: number }> = {
  title: { pos: [3, 9.5, 15], look: [0, 0, 0.5], drift: 1 },
  menu: { pos: [-7.5, 8, 11], look: [1.8, 0, 0], drift: 0.6 },
  online: { pos: [5, 4.6, 10.5], look: [0.5, 0.4, 4], drift: 0.4 },
  solo: { pos: [-4.5, 5, -1.5], look: [-0.5, 0, -4], drift: 0.35 },
  settings: { pos: [0.1, 18, 3], look: [0, 0, 0], drift: 0.2 },
  credits: { pos: [9.5, 3.4, 9.5], look: [0, 0.8, 0], drift: 0.5 },
  name: { pos: [2, 6, 12], look: [0, 0, 3], drift: 0.4 },
};

function Rig({ frame }: { frame: TitleFrame }) {
  const { camera } = useThree();
  const reduced = useReducedMotion();
  const look = useRef(new THREE.Vector3(...FRAMES.title.look));
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const f = FRAMES[frame];
    const drift = reduced ? 0 : f.drift;
    const a = t.current * 0.07;
    const want = new THREE.Vector3(f.pos[0] + Math.sin(a) * 2.2 * drift, f.pos[1] + Math.sin(a * 1.7) * 0.4 * drift, f.pos[2] + Math.cos(a) * 1.2 * drift);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.6);
    camera.position.lerp(want, k);
    look.current.lerp(new THREE.Vector3(...f.look), k);
    camera.lookAt(look.current);
  });
  return null;
}

/** A pawn that walks a loop of cells, hopping from cell to cell. */
function Patrol({ route, speed, children, pause = 0 }: { route: Cell[]; speed: number; children: React.ReactNode; pause?: number }) {
  const ref = useRef<THREE.Group>(null);
  const path = useMemo(() => {
    const cells: Cell[] = [];
    for (let i = 0; i < route.length; i++) cells.push(route[i], ...shortestPath(board, route[i], route[(i + 1) % route.length]).slice(0, -1));
    return cells.map((c) => cellPos(board, c));
  }, [route]);
  const t = useRef(Math.random() * path.length);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    t.current = (t.current + dt * speed) % (path.length + pause);
    const i = Math.min(Math.floor(t.current), path.length - 1);
    const f = Math.min(1, t.current - i);
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    g.position.lerpVectors(a, b, t.current > path.length ? 0 : e);
    g.position.y = FLOOR_Y + (t.current > path.length ? 0 : Math.sin(f * Math.PI) * 0.18);
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.lengthSq() > 0.01) g.rotation.y += (Math.atan2(dir.x, dir.z) - g.rotation.y) * 0.15;
  });
  return <group ref={ref}>{children}</group>;
}

/** The night guard's flashlight: a sweeping spot + a visible cone. */
function Flashlight() {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) group.current.rotation.y = Math.sin(t * 0.6) * 1.1 + Math.PI;
    if (light.current) light.current.target = target;
  });
  const start = cellPos(board, C(6, 6));
  return (
    <group position={[start.x + 0.5, 0.5, start.z + 0.5]}>
      <group ref={group}>
        <primitive object={target} position={[0, -0.5, 4]} />
        <spotLight ref={light} intensity={18} distance={9} angle={0.33} penumbra={0.6} color="#fff0c0" />
        <mesh position={[0, -0.18, 2]} rotation={[Math.PI / 2 - 0.08, 0, 0]}>
          <coneGeometry args={[0.95, 4, 18, 1, true]} />
          <meshBasicMaterial color="#fff2b0" transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

/** Tall searchlight beams sweeping the sky behind the museum. */
function Searchlights() {
  const beams = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    beams.current?.children.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.25 + i * 2.1) * 0.5;
      b.rotation.x = -0.25 + Math.cos(t * 0.2 + i) * 0.12;
    });
  });
  return (
    <group ref={beams} position={[0, -0.5, -10]}>
      {[-8, 8].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* Apex at the lamp on the ground, widening and fading into the sky. */}
          <mesh position={[0, 9, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[2.6, 18, 20, 1, true]} />
            <meshBasicMaterial color="#9fb8ff" alphaMap={beamTexture()} transparent opacity={0.11} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Camera sightlines pulsing along the four directions. */
function CameraBeams({ cell }: { cell: Cell }) {
  const ref = useRef<THREE.Group>(null);
  const beams = useMemo(() => {
    const out: { pos: THREE.Vector3; len: number; rot: number }[] = [];
    const origin = cellPos(board, cell);
    const seen = board.sight[cell].map((c) => cellPos(board, c));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const along = seen.filter((p) => Math.sign(p.x - origin.x) === dx && Math.sign(p.z - origin.z) === dz && (dx === 0 ? p.x === origin.x : p.z === origin.z));
      const len = along.length;
      if (!len) continue;
      out.push({ pos: new THREE.Vector3(origin.x + (dx * (len + 0.5)) / 2, 0.3, origin.z + (dz * (len + 0.5)) / 2), len: len + 0.5, rot: dx !== 0 ? Math.PI / 2 : 0 });
    }
    return out;
  }, [cell]);
  useFrame(({ clock }) => {
    const o = 0.08 + 0.06 * Math.sin(clock.elapsedTime * 2 + cell);
    ref.current?.children.forEach((m) => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o));
  });
  return (
    <group ref={ref}>
      {beams.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={[0, b.rot, 0]}>
          <boxGeometry args={[0.16, 0.05, b.len]} />
          <meshBasicMaterial color="#6fe8ff" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

function Glints() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current?.children.forEach((s, i) => {
      const phase = (t * 0.5 + i * 0.37) % 3;
      s.scale.setScalar(phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) * 0.5 : 0.001);
    });
  });
  return (
    <group ref={ref}>
      {PAINTINGS.map(([id, x, y]) => {
        const p = cellPos(board, C(x, y));
        return (
          <sprite key={id} position={[p.x + 0.18, 0.7, p.z + 0.05]} scale={0.001}>
            <spriteMaterial map={glowTexture()} color="#fff6d0" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        );
      })}
    </group>
  );
}

function Diorama() {
  const quality = usePrefs((s) => s.quality);
  const lite = quality === "low";
  const cobaltRoute = useMemo(() => [C(4, 3), C(9, 3), C(9, 9), C(4, 9)], []);
  const thiefRoute = useMemo(() => [C(1, 4), C(3, 3), C(3, 5), C(4, 6), C(2, 6), C(2, 8)], []);
  const vetRoute = useMemo(() => [C(10, 6), C(12, 6), C(12, 9), C(10, 9)], []);
  return (
    <group>
      <Floors board={board} patterns={false} />
      <Walls board={board} />
      <Plinths board={board} />
      <Plaza board={board} />
      {board.slots.map((s) => {
        const p = cellPos(board, s.cell, 0.3);
        return (
          <group key={s.id} position={p} rotation={[0, Math.PI, 0]}>
            <Padlock face={null} />
          </group>
        );
      })}
      {PAINTINGS.map(([id, x, y]) => (
        <group key={id} position={cellPos(board, C(x, y))}>
          <PaintingPiece id={id} />
        </group>
      ))}
      {CAMERAS.map(([n, x, y]) => (
        <group key={n}>
          <group position={cellPos(board, C(x, y))}>
            <CameraPiece n={n} state="on" />
          </group>
          {!lite && <CameraBeams cell={C(x, y)} />}
        </group>
      ))}
      <Patrol route={cobaltRoute} speed={1.4}>
        <Pawn colour="blue" />
      </Patrol>
      <Patrol route={vetRoute} speed={0.9} pause={2}>
        <Pawn colour="green" />
      </Patrol>
      <group position={cellPos(board, C(6, 6))}>
        <group position={[0.5, 0, 0.5]}>
          <Pawn colour="purple" />
        </group>
      </group>
      <Flashlight />
      <Patrol route={thiefRoute} speed={2.2} pause={3}>
        <ThiefPawn haul={3} />
      </Patrol>
      {!lite && <Searchlights />}
      {!lite && <Glints />}
    </group>
  );
}

export function TitleScene({ frame }: { frame: TitleFrame }) {
  return (
    <SceneCanvas camera={{ position: [3, 9.5, 15], fov: 40 }}>
      <NightLights mood="night" />
      <Rig frame={frame} />
      <Diorama />
    </SceneCanvas>
  );
}
