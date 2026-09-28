// Board camera: orbit with a clamped polar angle, zoom and pan clamped to the board, and three presets
// with smooth transitions: Overview (1), Top-down tactical (2/T, a narrow-FOV near-orthographic view)
// and Focus on my pawn (F). Touch: one finger rotates, pinch zooms, two fingers pan.
// Walls shrink as the camera drops toward the table, so the interior never hides behind them.

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CameraPreset } from "../game/uiStore";
import { useReducedMotion } from "../prefs";

interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export function CameraRig({ preset, nonce, focus, onWallScale, portrait }: { preset: CameraPreset; nonce: number; focus: THREE.Vector3 | null; onWallScale: (s: number) => void; portrait: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  const reduced = useReducedMotion();
  const anim = useRef<{ from: Shot; to: Shot; t: number } | null>(null);
  const lastScale = useRef(1);

  const shotFor = (p: CameraPreset): Shot => {
    // Portrait screens turn the view 90° (west at the top, north on the right) so the board's long
    // side runs up the screen; the plaza's compass marker keeps the orientation clear.
    const aspect = size.width / Math.max(1, size.height);
    const turn = portrait;
    const back = turn ? Math.min(3, Math.max(1, 0.9 / aspect)) : Math.min(3, Math.max(1, 1.35 / aspect));
    // Offset from the target, expressed "from the front", then rotated for portrait.
    const place = (target: THREE.Vector3, back3: THREE.Vector3) => (turn ? new THREE.Vector3(target.x + back3.z, target.y + back3.y, target.z - back3.x) : target.clone().add(back3));
    if (p === "top") {
      const target = turn ? new THREE.Vector3(1.2, 0, 0.6) : new THREE.Vector3(0, 0, 1.8);
      return { pos: place(target, new THREE.Vector3(0, 74 * back, 0.6)), target, fov: 13 };
    }
    if (p === "focus" && focus) return { pos: place(focus, new THREE.Vector3(0, 7 * back, 6.5 * back)), target: focus.clone(), fov: 40 };
    // Aim a little south of centre (or east, turned) so the board sits above the bottom panel.
    const target = turn ? new THREE.Vector3(2.2, 0, 0.6) : new THREE.Vector3(0, 0, 2.4);
    return { pos: place(target, new THREE.Vector3(0, 15.5 * back, 12.5 * back)), target, fov: 40 };
  };

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const to = shotFor(preset);
    const from: Shot = { pos: cam.position.clone(), target: controls.current?.target.clone() ?? new THREE.Vector3(), fov: cam.fov };
    anim.current = { from, to, t: reduced ? 1 : 0 };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, portrait, size.width, size.height]);

  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const c = controls.current;
    const a = anim.current;
    if (a && c) {
      a.t = Math.min(1, a.t + dt / 0.6);
      const e = 1 - (1 - a.t) ** 3;
      cam.position.lerpVectors(a.from.pos, a.to.pos, e);
      c.target.lerpVectors(a.from.target, a.to.target, e);
      cam.fov = a.from.fov + (a.to.fov - a.from.fov) * e;
      cam.updateProjectionMatrix();
      c.update();
      invalidate();
      if (a.t >= 1) anim.current = null;
    }
    if (c) {
      // Keep the target over the board.
      c.target.x = THREE.MathUtils.clamp(c.target.x, -7, 8);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -6, 7);
      c.target.y = 0;
      // Lower camera → lower walls (1 at top-down, 0.35 when skimming the table).
      const polar = c.getPolarAngle();
      const s = THREE.MathUtils.clamp(1 - (polar - 0.55) / 0.75, 0.35, 1);
      if (Math.abs(s - lastScale.current) > 0.02) {
        lastScale.current = s;
        onWallScale(s);
      }
    }
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minPolarAngle={0.05}
      maxPolarAngle={1.2}
      minDistance={5}
      maxDistance={40}
      screenSpacePanning={false}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      onStart={() => (anim.current = null)}
    />
  );
}
