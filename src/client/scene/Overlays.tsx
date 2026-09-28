// Board overlays: coloured cell tiles (reachable, path, danger, heat, sightlines, flashes) drawn as
// one instanced mesh with per-instance colour + alpha, plus small number badges and markers.

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Board, Cell } from "../../shared/board/model";
import { cellXZ, FLOOR_Y } from "./layout";
import { discTexture, glowTexture } from "./textures";

export interface Tile {
  cell: Cell;
  colour: string;
  alpha: number;
  /** 0 = filled, 1 = hatched (danger), 2 = ring (outline only). */
  style?: 0 | 1 | 2;
  /** Pulses gently. */
  pulse?: boolean;
  lift?: number;
}

const vert = /* glsl */ `
  attribute vec3 tColour;
  attribute vec3 tInfo; // alpha, style, pulse
  varying vec3 vColour;
  varying vec3 vInfo;
  varying vec2 vUv;
  void main() {
    vColour = tColour;
    vInfo = tInfo;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  varying vec3 vColour;
  varying vec3 vInfo;
  varying vec2 vUv;
  void main() {
    vec2 d = abs(vUv - 0.5) * 2.0;
    float edge = max(d.x, d.y);
    float a = vInfo.x;
    if (vInfo.y > 1.5) {
      // ring
      a *= smoothstep(0.72, 0.8, edge) * (1.0 - smoothstep(0.94, 1.0, edge));
    } else if (vInfo.y > 0.5) {
      // hatch
      float stripe = step(0.5, fract((vUv.x + vUv.y) * 5.0));
      a *= 0.35 + 0.65 * stripe;
      a *= 1.0 - smoothstep(0.92, 1.0, edge);
    } else {
      // soft filled tile with a brighter rim
      a *= mix(0.75, 1.0, smoothstep(0.6, 0.95, edge)) * (1.0 - smoothstep(0.93, 1.0, edge));
    }
    if (vInfo.z > 0.5) a *= 0.7 + 0.3 * sin(uTime * 4.0);
    gl_FragColor = vec4(vColour, a);
  }
`;

const MAX_TILES = 400;

export function TileLayer({ board, tiles, y = FLOOR_Y + 0.012 }: { board: Board; tiles: Tile[]; y?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.94, 0.94);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("tColour", new THREE.InstancedBufferAttribute(new Float32Array(MAX_TILES * 3), 3));
    g.setAttribute("tInfo", new THREE.InstancedBufferAttribute(new Float32Array(MAX_TILES * 3), 3));
    return g;
  }, []);
  const pulsing = tiles.some((t) => t.pulse);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const colours = geo.getAttribute("tColour") as THREE.InstancedBufferAttribute;
    const info = geo.getAttribute("tInfo") as THREE.InstancedBufferAttribute;
    const obj = new THREE.Object3D();
    const col = new THREE.Color();
    const n = Math.min(tiles.length, MAX_TILES);
    for (let i = 0; i < n; i++) {
      const t = tiles[i];
      const [x, z] = cellXZ(board, t.cell);
      obj.position.set(x, y + (t.lift ?? 0) + i * 0.00005, z);
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
      col.set(t.colour);
      colours.setXYZ(i, col.r, col.g, col.b);
      info.setXYZ(i, t.alpha, t.style ?? 0, t.pulse ? 1 : 0);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    colours.needsUpdate = true;
    info.needsUpdate = true;
    invalidate();
  }, [tiles, board, geo, y, invalidate]);

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    if (pulsing) invalidate();
  });

  return <instancedMesh ref={mesh} args={[geo, mat, MAX_TILES]} frustumCulled={false} renderOrder={2} />;
}

/** A floating number badge over a cell (detective step counts). */
export function NumberBadge({ board, cell, n, colour = "#ffc14d" }: { board: Board; cell: Cell; n: number | string; colour?: string }) {
  const [x, z] = cellXZ(board, cell);
  return (
    <sprite position={[x, FLOOR_Y + 0.28, z]} scale={[0.34, 0.34, 1]} renderOrder={5}>
      <spriteMaterial map={discTexture(String(n), "#07061a", colour)} depthTest={false} transparent />
    </sprite>
  );
}

/** A little floating marker: suspect marks ("?"), last-seen footprints, pings. */
export function Marker({ board, cell, label, colour, size = 0.42, height = 0.55 }: { board: Board; cell: Cell; label: string; colour: string; size?: number; height?: number }) {
  const [x, z] = cellXZ(board, cell);
  return (
    <group position={[x, FLOOR_Y, z]}>
      <sprite position={[0, height, 0]} scale={[size, size, 1]} renderOrder={6}>
        <spriteMaterial map={discTexture(label, "#07061a", colour)} depthTest={false} transparent />
      </sprite>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, height, 4]} />
        <meshBasicMaterial color={colour} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** A spotlight column (reveal / capture moments). */
export function SpotColumn({ board, cell, colour = "#fff2b0" }: { board: Board; cell: Cell; colour?: string }) {
  const [x, z] = cellXZ(board, cell);
  const ref = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.8;
    invalidate();
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.35, 0.65, 6, 16, 1, true]} />
        <meshBasicMaterial color={colour} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, FLOOR_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial map={glowTexture()} color={colour} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/** Dots along a path of cells. */
export function PathDots({ board, from, path, colour = "#ffd36b" }: { board: Board; from: Cell; path: Cell[]; colour?: string }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const cells = [from, ...path];
    for (let i = 0; i < cells.length - 1; i++) {
      const [ax, az] = cellXZ(board, cells[i]);
      const [bx, bz] = cellXZ(board, cells[i + 1]);
      for (let k = 1; k <= 3; k++) pts.push(new THREE.Vector3(ax + ((bx - ax) * k) / 4, FLOOR_Y + 0.05, az + ((bz - az) * k) / 4));
    }
    return pts;
  }, [board, from, path]);
  return (
    <group>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.055, 6, 6]} />
          <meshBasicMaterial color={colour} />
        </mesh>
      ))}
    </group>
  );
}
