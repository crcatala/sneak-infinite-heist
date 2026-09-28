// The static diorama: marbled floors (merged per colour), chunky low walls (one merged mesh),
// windows and doors, lock plinths, and the cobblestone plaza with its props. Everything static is
// merged so the whole building costs a handful of draw calls.

import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { colourOf, xyOf, type Board, type Cell, type FloorColour } from "../../shared/board/model";
import { cellXZ, FLOOR_Y, gridXZ, WALL_H, WALL_T } from "./layout";
import { cobbleTexture, glowTexture, marbleTexture } from "./textures";

const WALL_COLOUR = "#8c8a99";
const CAP_COLOUR = "#b4b2c2";
const PLINTH_COLOUR = "#a3a1b3";

/** Sets UVs from world x/z so textures flow continuously across merged tiles. */
function worldUV(geo: THREE.BufferGeometry, scale: number) {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * scale;
    uv[i * 2 + 1] = pos.getZ(i) * scale;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function Floors({ board, patterns }: { board: Board; patterns: boolean }) {
  const groups = useMemo(() => {
    const byColour = new Map<FloorColour, THREE.BufferGeometry[]>();
    for (const c of board.walkable) {
      const [x, z] = cellXZ(board, c);
      const colour = colourOf(board, c);
      const list = byColour.get(colour) ?? [];
      list.push(box(0.97, 0.12, 0.97, x, FLOOR_Y - 0.06, z));
      byColour.set(colour, list);
    }
    return [...byColour].map(([colour, geos]) => ({ colour, geo: worldUV(mergeGeometries(geos)!, 0.25) }));
  }, [board]);

  return (
    <group>
      {groups.map(({ colour, geo }) => (
        <mesh key={colour} geometry={geo} receiveShadow>
          <meshStandardMaterial map={marbleTexture(colour, patterns)} roughness={colour === "grey" ? 0.85 : 0.45} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

interface WallBits {
  walls: THREE.BufferGeometry;
  caps: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  mats: THREE.BufferGeometry;
}

/** Builds wall segments for every walled edge of a walkable cell. */
function buildWalls(board: Board): WallBits {
  const walls: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const mats: THREE.BufferGeometry[] = [];
  const posts = new Set<string>();
  const dirs: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < board.width && y < board.height && board.region[y * board.width + x] !== null;

  for (const c of board.walkable) {
    const [x, y] = xyOf(board, c);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const n: Cell = ny * board.width + nx;
      const nWalk = walkable(nx, ny);
      // Interior edges: handle once, and only when walled.
      if (nWalk && (n < c || board.neighbours[c].includes(n))) continue;
      const [ex, ez] = gridXZ(board, x + dx / 2, y + dy / 2);
      const horizontal = dy !== 0; // the wall runs along x
      const ry = horizontal ? 0 : Math.PI / 2;
      const slot = board.slotByInside.get(c);
      const entry = slot && slot.cell === n;
      if (entry && slot.kind === "window") {
        walls.push(box(1, 0.18, WALL_T, ex, 0.09, ez, ry));
        glass.push(box(0.8, WALL_H - 0.2, WALL_T * 0.35, ex, 0.18 + (WALL_H - 0.2) / 2, ez, ry));
        caps.push(box(1.02, 0.06, WALL_T + 0.04, ex, WALL_H - 0.02, ez, ry));
        caps.push(box(1.02, 0.05, WALL_T + 0.06, ex, 0.2, ez, ry));
      } else if (entry) {
        // Door: an open frame and a dark doormat outside.
        caps.push(box(1.04, 0.08, WALL_T + 0.04, ex, WALL_H + 0.02, ez, ry));
        const [sx, sz] = gridXZ(board, x + dx * 0.72, y + dy * 0.72);
        mats.push(box(0.7, 0.02, 0.45, sx, 0.04, sz, ry));
      } else {
        walls.push(box(1 + WALL_T, WALL_H, WALL_T, ex, WALL_H / 2, ez, ry));
        caps.push(box(1 + WALL_T + 0.02, 0.06, WALL_T + 0.05, ex, WALL_H + 0.01, ez, ry));
      }
      // Corner posts at both ends of the edge.
      for (const s of [-0.5, 0.5]) {
        const px = horizontal ? x + s : x + dx / 2;
        const py = horizontal ? y + dy / 2 : y + s;
        posts.add(`${px},${py}`);
      }
    }
  }
  for (const key of posts) {
    const [px, py] = key.split(",").map(Number);
    const [wx, wz] = gridXZ(board, px, py);
    caps.push(box(WALL_T + 0.08, WALL_H + 0.1, WALL_T + 0.08, wx, (WALL_H + 0.1) / 2, wz));
  }
  return {
    walls: mergeGeometries(walls)!,
    caps: mergeGeometries(caps)!,
    glass: mergeGeometries(glass)!,
    mats: mergeGeometries(mats)!,
  };
}

export function Walls({ board, height = 1 }: { board: Board; height?: number }) {
  const bits = useMemo(() => buildWalls(board), [board]);
  return (
    <group scale={[1, height, 1]}>
      <mesh geometry={bits.walls} castShadow receiveShadow>
        <meshStandardMaterial color={WALL_COLOUR} roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={bits.caps} castShadow>
        <meshStandardMaterial color={CAP_COLOUR} roughness={0.8} flatShading />
      </mesh>
      <mesh geometry={bits.glass}>
        <meshStandardMaterial color="#7fb6ff" emissive="#3a66c8" emissiveIntensity={0.6} transparent opacity={0.55} roughness={0.1} />
      </mesh>
      <mesh geometry={bits.mats}>
        <meshStandardMaterial color="#2a2438" roughness={1} />
      </mesh>
    </group>
  );
}

/** Square plinths on every lock slot (the padlocks sit on these). */
export function Plinths({ board }: { board: Board }) {
  const geo = useMemo(() => {
    const parts = board.slots.map((s) => {
      const [x, z] = cellXZ(board, s.cell);
      return box(0.62, 0.3, 0.62, x, 0.15, z);
    });
    return mergeGeometries(parts)!;
  }, [board]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={PLINTH_COLOUR} roughness={0.85} flatShading />
    </mesh>
  );
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** The cobblestone plinth the museum stands on, plus benches, fountain, ornament, lamps and stairs. */
export function Plaza({ board, lampsOn = true }: { board: Board; lampsOn?: boolean }) {
  const { base, top } = useMemo(() => {
    const w = board.width + 1.6;
    const h = board.height + 2.2;
    const baseGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, 1.2), { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 6 });
    baseGeo.rotateX(-Math.PI / 2);
    baseGeo.translate(0, -0.52, 0.35);
    const topGeo = new THREE.ShapeGeometry(roundedRect(w - 0.1, h - 0.1, 1.15), 6);
    topGeo.rotateX(-Math.PI / 2);
    topGeo.translate(0, 0.005, 0.35);
    worldUV(topGeo, 0.22);
    return { base: baseGeo, top: topGeo };
  }, [board]);

  const at = (x: number, y: number): [number, number, number] => {
    const [wx, wz] = gridXZ(board, x, y);
    return [wx, 0, wz];
  };
  const lamps: [number, number][] = [
    [-0.4, -0.6],
    [13.4, -0.6],
    [-0.4, 11.6],
    [13.4, 11.6],
    [5, 12.5],
    [8, 12.5],
  ];

  return (
    <group>
      <mesh geometry={base} receiveShadow>
        <meshStandardMaterial color="#3b3858" roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={top} receiveShadow>
        <meshStandardMaterial map={cobbleTexture()} roughness={0.95} />
      </mesh>
      {/* Front stairs */}
      <group position={at(6.5, 11.5)}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.1 - i * 0.04, 0.18 + i * 0.26]} castShadow receiveShadow>
            <boxGeometry args={[2.6 + i * 0.3, 0.2 - i * 0.05, 0.3]} />
            <meshStandardMaterial color={i % 2 ? "#9d9bad" : "#b0aec0"} roughness={0.85} flatShading />
          </mesh>
        ))}
      </group>
      <Bench position={at(1.6, 1.1)} />
      <Bench position={at(11.6, 11.2)} />
      <Fountain position={at(12.3, 0.8)} />
      <Ornament position={at(0.9, 11.2)} />
      {lamps.map(([x, y], i) => (
        <LampPost key={i} position={at(x, y)} on={lampsOn} />
      ))}
    </group>
  );
}

function Bench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[1.4, 0.1, 0.42]} />
        <meshStandardMaterial color="#9a98aa" flatShading />
      </mesh>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.1, 0]} castShadow>
          <boxGeometry args={[0.16, 0.2, 0.38]} />
          <meshStandardMaterial color="#7d7b8e" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.42, -0.18]} castShadow>
        <boxGeometry args={[1.4, 0.32, 0.08]} />
        <meshStandardMaterial color="#9a98aa" flatShading />
      </mesh>
    </group>
  );
}

function Fountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.92, 0.24, 14]} />
        <meshStandardMaterial color="#9d9bad" flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.1, 14]} />
        <meshStandardMaterial color="#4fb3e8" emissive="#1f6fa8" emissiveIntensity={0.5} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.4, 8]} />
        <meshStandardMaterial color="#b0aec0" flatShading />
      </mesh>
    </group>
  );
}

function Ornament({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <cylinderGeometry args={[0.72, 0.78, 0.16, 12]} />
        <meshStandardMaterial color="#8d8b9d" flatShading />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 12]} />
        <meshStandardMaterial color="#4c9a5a" roughness={0.9} flatShading />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.32, 0.26, Math.sin((i * Math.PI) / 2) * 0.32]} castShadow>
          <icosahedronGeometry args={[0.14, 0]} />
          <meshStandardMaterial color="#6fc27a" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function LampPost({ position, on }: { position: [number, number, number]; on: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.07, 1.2, 6]} />
        <meshStandardMaterial color="#2a2840" flatShading />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <icosahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color="#ffe0a0" emissive="#ffc14d" emissiveIntensity={on ? 2.2 : 0.1} flatShading />
      </mesh>
      {on && (
        <sprite position={[0, 1.25, 0]} scale={[1.1, 1.1, 1]}>
          <spriteMaterial map={glowTexture()} color="#ffc14d" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )}
      {on && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 2.4]} />
          <meshBasicMaterial map={glowTexture()} color="#ffb84d" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}
