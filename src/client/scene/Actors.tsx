// Moving pieces. A Mover walks its children to a new cell along the given path, hopping once per
// step, then rests. It only requests frames while it's moving (the canvas renders on demand).

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Board, Cell } from "../../shared/board/model";
import { useStore } from "../store";
import { reducedMotion } from "../prefs";
import { cellPos, FLOOR_Y } from "./layout";
import { planWalk, type Walk } from "./walk";

/** `walk` and `stepKey` are for the round-end replay (see walk.ts); the live game leaves them out. */
export function Mover({ board, cell, path, walk, stepKey, children, stepMs = 170, hop = 0.22, visible = true }: { board: Board; cell: Cell; path?: Cell[] | null; walk?: Walk; stepKey?: number; children: ReactNode; stepMs?: number; hop?: number; visible?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const route = useRef<THREE.Vector3[]>([]);
  const t = useRef(0);
  const at = useRef<Cell | null>(null);
  const lastStep = useRef(stepKey);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const again = lastStep.current !== stepKey;
    lastStep.current = stepKey;
    const plan = reducedMotion() ? ({ kind: "snap" } as const) : planWalk(at.current, cell, path, walk, again);
    if (plan.kind === "stay") return;
    if (plan.kind === "snap") {
      route.current = [];
      g.position.copy(cellPos(board, cell));
      at.current = cell;
      invalidate();
      return;
    }
    route.current = [g.position.clone(), ...plan.cells.map((c) => cellPos(board, c))];
    t.current = 0;
    at.current = cell;
    invalidate();
  }, [board, cell, path, walk, stepKey, invalidate]);

  useFrame((_, dt) => {
    const g = ref.current;
    const r = route.current;
    if (!g || r.length < 2) return;
    const slow = useStore.getState().debug.slowMotion ? 6 : 1;
    t.current += (dt * 1000) / (stepMs * slow);
    const i = Math.floor(t.current);
    if (i >= r.length - 1) {
      g.position.copy(r[r.length - 1]);
      g.position.y = FLOOR_Y;
      route.current = [];
      invalidate();
      return;
    }
    const f = t.current - i;
    g.position.lerpVectors(r[i], r[i + 1], f);
    g.position.y = FLOOR_Y + Math.sin(f * Math.PI) * hop;
    const d = new THREE.Vector3().subVectors(r[i + 1], r[i]);
    if (d.lengthSq() > 0.001) g.rotation.y = Math.atan2(d.x, d.z);
    invalidate();
  });

  return (
    <group ref={ref} visible={visible}>
      {children}
    </group>
  );
}

/** A gentle pop-in scale when something appears (a revealed thief, a placed piece). */
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(-delay);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || t.current >= 1) return;
    t.current += dt / 0.35;
    const x = Math.max(0, Math.min(1, t.current));
    const s = x < 1 ? 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2 : 1;
    g.scale.setScalar(reducedMotion() ? 1 : Math.max(0.001, s));
    invalidate();
  });
  return <group ref={ref} scale={0.001}>{children}</group>;
}
