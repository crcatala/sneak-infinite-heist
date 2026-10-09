// Pointer pins: a glossy teardrop that drops onto the board where a detective pointed, bobs and
// sways with a halo ring and a ripple on the floor, wears the sender's colour and name, and fades
// out after a few seconds. Placement is free (not snapped to a cell).

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { character } from "../../shared/characters";
import type { Board } from "../../shared/board/model";
import type { GameView } from "../../shared/game/views";
import { pinOpacity, type Pin } from "../game/pins";
import { reducedMotion } from "../prefs";
import { useStore } from "../store";
import { FLOOR_Y, gridXZ } from "./layout";
import { glowTexture, tagTexture } from "./textures";

/** Seconds for the drop-and-settle at the start. */
const DROP_S = 0.55;
const BODY_Y = 0.1;
/** Overall size: big enough to read from the default camera without hiding the tile under it. */
const SCALE = 1.35;

/** A teardrop silhouette (tip at the origin, widest near the top) turned into a smooth solid. */
const dropGeometry = (() => {
  const pts: THREE.Vector2[] = [];
  const R = 0.2;
  const cy = 0.56;
  pts.push(new THREE.Vector2(0, 0));
  // Tapered neck up to the head's equator, then the round cap.
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(R * Math.pow(t, 1.8) * 0.9, cy * t - 0.04 * Math.sin(t * Math.PI)));
  }
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, R * Math.cos(a)), cy + R * Math.sin(a)));
  }
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, 24);
})();

const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const easeOutBounce = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** Every live pin on the board. Draws nothing (and costs nothing) while there are none. */
export function Pins({ board, game }: { board: Board; game: GameView }) {
  const pins = useStore((s) => s.pins);
  return (
    <>
      {pins.map((p) => {
        const pawn = game.detectives.find((d) => d.controller === p.by);
        const ch = pawn ? character(pawn.character) : null;
        return <PinMesh key={p.id} board={board} pin={p} colour={ch?.hex ?? "#8fb0ff"} name={ch?.short ?? "Detective"} />;
      })}
    </>
  );
}

function PinMesh({ board, pin, colour, name }: { board: Board; pin: Pin; colour: string; name: string }) {
  const { invalidate } = useThree();
  const [wx, wz] = gridXZ(board, pin.x, pin.y);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const spark = useRef<THREE.Mesh>(null);
  const ripples = useRef<(THREE.Mesh | null)[]>([]);
  const reduced = useMemo(() => reducedMotion(), []);

  const mats = useMemo(() => {
    const base = new THREE.Color(colour);
    const mk = <T extends THREE.Material>(m: T) => {
      m.transparent = true;
      return m;
    };
    return {
      body: mk(new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.4, roughness: 0.28, metalness: 0.1 })),
      halo: mk(new THREE.MeshBasicMaterial({ color: "#ffffff" })),
      ripples: [0, 1].map(() => mk(new THREE.MeshBasicMaterial({ color: base, side: THREE.DoubleSide, depthWrite: false }))),
      glow: mk(new THREE.MeshBasicMaterial({ map: glowTexture(), color: base, depthWrite: false, blending: THREE.AdditiveBlending })),
      tag: mk(new THREE.SpriteMaterial({ map: tagTexture(name, colour), depthTest: false })),
    };
  }, [colour, name]);

  useFrame(() => {
    const now = performance.now();
    const op = pinOpacity(pin, now);
    const age = (now - pin.born) / 1000;
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;

    // Spawn: drop with a little bounce while popping up to size.
    const t = Math.min(1, age / DROP_S);
    const drop = reduced ? 0 : (1 - easeOutBounce(t)) * 0.9;
    const pop = reduced ? 1 : Math.max(0.001, easeOutBack(Math.min(1, age / 0.38)));
    // Idle: bob and sway; fade: shrink a touch and rise.
    const bob = reduced ? 0 : Math.sin(age * 3.4) * 0.05 + 0.05;
    const sway = reduced ? 0 : Math.sin(age * 2.1) * 0.1;
    const leaving = 1 - op;
    b.position.y = BODY_Y + (bob + drop + leaving * 0.25) * SCALE;
    b.rotation.set(sway * 0.6, age * 0.9, sway);
    b.scale.setScalar(SCALE * pop * (0.85 + 0.15 * op));

    if (halo.current) halo.current.rotation.set(Math.PI / 2 + Math.sin(age * 1.7) * 0.25, 0, age * 2.4);
    if (spark.current) spark.current.position.set(Math.cos(age * 4) * 0.27, 0, Math.sin(age * 4) * 0.27);

    // Floor ripples: one burst on landing, then a slow repeat so a pin is easy to spot at a glance.
    mats.ripples.forEach((m, i) => {
      const r = ripples.current[i];
      if (!r) return;
      const phase = reduced ? 0.5 : (age * 0.7 - i * 0.45 + 1) % 1;
      const grow = age < 0.25 && !reduced ? 0 : phase;
      r.scale.setScalar(0.4 + grow * 1.7);
      m.opacity = (age < 0.25 ? 0 : (1 - grow) * 0.7) * op;
    });

    mats.body.opacity = op;
    mats.halo.opacity = op * 0.9;
    mats.glow.opacity = op * 0.75 * (0.8 + 0.2 * Math.sin(age * 3.4));
    mats.tag.opacity = op;
    invalidate();
  });

  return (
    <group ref={root} position={[wx, FLOOR_Y, wz]}>
      {/* soft pool of light under the pin */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glow} renderOrder={4}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => void (ripples.current[i] = m)} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.ripples[i]} renderOrder={4}>
          <ringGeometry args={[0.28, 0.32, 40]} />
        </mesh>
      ))}
      <group ref={body}>
        <mesh geometry={dropGeometry} material={mats.body} castShadow />
        <group ref={halo} position={[0, 0.56, 0]}>
          <mesh material={mats.halo}>
            <torusGeometry args={[0.27, 0.014, 8, 40]} />
          </mesh>
          <mesh ref={spark} material={mats.halo}>
            <sphereGeometry args={[0.04, 8, 8]} />
          </mesh>
        </group>
      </group>
      <sprite position={[0, 1.38, 0]} scale={[0.82, 0.256, 1]} material={mats.tag} renderOrder={7} />
    </group>
  );
}
