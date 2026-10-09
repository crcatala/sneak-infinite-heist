// Two 3D dice (black numbers, white Eye/S/M) tumbling in the middle of the board and landing on the
// result the server already decided. No physics: a spin that eases into the target orientation.
// They then glide into the dock beside the turn bar and stay there, visible to every player, until
// the detective's turn is over.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFx } from "../game/present";
import { reducedMotion } from "../prefs";
import { actionDieFace, numberDieFace } from "../scene/textures";
import { useStore } from "../store";

// BoxGeometry material order: +x, -x, +y, -y, +z, -z.
const NUMBER_SLOTS = [3, 4, 1, 6, 2, 5]; // opposite faces sum to 7
const ACTION_SLOTS: ("eye" | "scan" | "motion")[] = ["eye", "eye", "scan", "motion", "eye", "eye"];

/** Rotation bringing material slot `i` to face +y (up), with a little turn toward the camera. */
function upFor(slot: number): THREE.Quaternion {
  const e = [
    new THREE.Euler(0, 0, Math.PI / 2),
    new THREE.Euler(0, 0, -Math.PI / 2),
    new THREE.Euler(0, 0, 0),
    new THREE.Euler(Math.PI, 0, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0),
    new THREE.Euler(Math.PI / 2, 0, 0),
  ][slot];
  // Tilt toward the viewer so the top face reads.
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.35, 0)).multiply(new THREE.Quaternion().setFromEuler(e));
}

function Die({ kind, value, x, startedAt, duration }: { kind: "number" | "action"; value: number | string; x: number; startedAt: number; duration: number }) {
  const ref = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const materials = useMemo(
    () =>
      (kind === "number" ? NUMBER_SLOTS.map((n) => numberDieFace(n)) : ACTION_SLOTS.map((f) => actionDieFace(f))).map(
        (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.4 }),
      ),
    [kind],
  );
  const target = useMemo(() => {
    const slots = kind === "number" ? NUMBER_SLOTS : ACTION_SLOTS;
    const options = slots.map((v, i) => (v === value ? i : -1)).filter((i) => i >= 0);
    return upFor(options[Math.floor(Math.random() * options.length)] ?? 2);
  }, [kind, value]);
  const spin = useMemo(() => new THREE.Vector3(Math.random() * 8 + 6, Math.random() * 8 + 6, Math.random() * 6 + 4), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min(1, (performance.now() - startedAt) / duration);
    const tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler(spin.x * (1 - t) ** 2, spin.y * (1 - t) ** 2, spin.z * (1 - t) ** 2));
    g.quaternion.copy(tumble.multiply(target));
    const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 0.9;
    g.position.set(x - (1 - t) * 1.4, bounce, 0);
    // The canvas renders on demand: keep asking for frames only while the dice are still moving.
    if (t < 1) invalidate();
  });
  return (
    <group ref={ref}>
      <mesh material={materials}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </group>
  );
}

/** True while the dice are still tumbling (the action panel waits for them before showing choices). */
export function useRolling(): boolean {
  const dice = useFx((s) => s.dice);
  const [, again] = useState(0);
  useEffect(() => {
    if (!dice) return;
    const ms = dice.until - performance.now();
    if (ms <= 0) return;
    const t = setTimeout(() => again((n) => n + 1), ms + 30);
    return () => clearTimeout(t);
  }, [dice]);
  return !!dice && dice.until > performance.now();
}

export function DiceTray() {
  const dice = useFx((s) => s.dice);
  const docked = useFx((s) => s.diceDocked);
  const slow = useStore((s) => s.debug.slowMotion);
  // Keep the last roll around while it fades out at the end of the turn.
  const [shown, setShown] = useState<typeof dice>(dice);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (dice) {
      setShown(dice);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => setShown(null), 400);
    return () => clearTimeout(t);
  }, [dice]);

  if (!shown) return null;
  const duration = 1100 * (slow ? 6 : 1) * (reducedMotion() ? 0.5 : 1);
  // A roll restored after a reload (`until` 0) is already at rest.
  const startedAt = shown.until === 0 ? 0 : shown.until - duration;
  return (
    <div
      className={`dice-tray${docked ? " docked" : ""}${leaving ? " leaving" : ""}`}
      role="img"
      aria-label={`Rolled ${shown.move} and ${shown.action === "eye" ? "an Eye" : shown.action === "scan" ? "Scan" : "Motion"}`}
    >
      <Canvas frameloop="demand" camera={{ position: [0, 2.6, 4.2], fov: 35 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.2, 0)}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 5, 3]} intensity={1.6} />
        <Die kind="number" value={shown.move} x={-0.75} startedAt={startedAt} duration={duration} key={`n${shown.id}`} />
        <Die kind="action" value={shown.action} x={0.75} startedAt={startedAt} duration={duration} key={`a${shown.id}`} />
      </Canvas>
    </div>
  );
}
