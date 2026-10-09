// Board camera: orbit with a clamped polar angle, zoom and pan clamped to the board, and three presets
// with smooth transitions: Overview (1), Top-down tactical (2/T, a narrow-FOV near-orthographic view)
// and Focus on my pawn (F). Touch: one finger rotates, pinch zooms, two fingers pan.
// Walls shrink as the camera drops toward the table, so the interior never hides behind them.
// The board is also fitted into the part of the screen the HUD leaves free (a projection shift and
// scale, so orbiting and zooming still work on top of it).

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Board } from "../../shared/board/model";
import { useGameUi, type CameraPreset } from "../game/uiStore";
import { useReducedMotion } from "../prefs";
import { cellXZ } from "./layout";

interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/** A projection shift and scale about the screen centre: p' = s·(p − c) + c + (x, y). */
interface Fit {
  s: number;
  x: number;
  y: number;
}
const NO_FIT: Fit = { s: 1, x: 0, y: 0 };

interface Px {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What the HUD covers, in canvas pixels: full-width bands at the top and bottom, and side panels. */
function measureHud(canvas: HTMLElement): { top: number; bottom: number; sides: Px[] } {
  const box = canvas.getBoundingClientRect();
  let top = 0;
  let bottom = 0;
  const sides: Px[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("[data-hud]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const px = { x0: r.left - box.left, y0: r.top - box.top, x1: r.right - box.left, y1: r.bottom - box.top };
    const band = el.dataset.hud === "band" || r.width > box.width * 0.6;
    if (!band) sides.push(px);
    else if (px.y0 + px.y1 < box.height) top = Math.max(top, px.y1);
    else bottom = Math.max(bottom, box.height - px.y0);
  }
  return { top, bottom, sides };
}

type Pt = [number, number];

/** Convex hull (monotone chain) of projected points: the board's real outline on screen. */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: Pt[]) => {
    const h: Pt[] = [];
    for (const q of pts) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Does the screen rectangle `r` overlap the polygon by more than a sliver? */
function overlaps(poly: Pt[], r: Px): boolean {
  const m = 6;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 4; j++) {
      const x = r.x0 + ((r.x1 - r.x0) * i) / 6;
      const y = r.y0 + ((r.y1 - r.y0) * j) / 4;
      if (inside(poly, x, y) && inside(poly, Math.min(r.x1, x + m), y)) return true;
    }
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      if (x > r.x0 + m && x < r.x1 - m && y > r.y0 + m && y < r.y1 - m) return true;
    }
  }
  return false;
}

export function CameraRig({ board, preset, nonce, focus, onWallScale, portrait }: { board: Board; preset: CameraPreset; nonce: number; focus: THREE.Vector3 | null; onWallScale: (s: number) => void; portrait: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  const reduced = useReducedMotion();
  const anim = useRef<{ from: Shot; to: Shot; t: number } | null>(null);
  const lastScale = useRef(1);
  const hudNonce = useGameUi((s) => s.hudNonce);
  const fit = useRef<{ from: Fit; to: Fit; cur: Fit; t: number }>({ from: NO_FIT, to: NO_FIT, cur: NO_FIT, t: 1 });
  const gl = useThree((s) => s.gl);

  // The footprint to keep on screen: every walkable cell plus a wall's width, at floor and wall height.
  // (The building isn't a rectangle, so its outline leaves the empty corners free for HUD cards.)
  const corners = useMemo(() => {
    const m = 0.65;
    const seen = new Set<string>();
    const out: THREE.Vector3[] = [];
    for (const c of board.walkable) {
      const [x, z] = cellXZ(board, c);
      for (const dx of [-m, m])
        for (const dz of [-m, m])
          for (const y of [0, 0.55]) {
            const key = `${x + dx},${z + dz},${y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(new THREE.Vector3(x + dx, y, z + dz));
          }
    }
    return out;
  }, [board]);

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

  /** Where the board should sit so the HUD doesn't cover it, given the camera pose of `shot`. */
  const fitFor = (p: CameraPreset, shot: Shot): Fit => {
    const W = size.width;
    const H = size.height;
    const hud = measureHud(gl.domElement);
    const ref = new THREE.PerspectiveCamera(shot.fov, W / Math.max(1, H), camera.near, camera.far);
    ref.position.copy(shot.pos);
    ref.lookAt(shot.target);
    ref.updateMatrixWorld();
    ref.updateProjectionMatrix();
    const toPx = (v: THREE.Vector3): [number, number] => {
      const q = v.clone().project(ref);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
    };
    const free: Px = { x0: 8, y0: hud.top + 6, x1: W - 8, y1: H - hud.bottom - 6 };
    if (free.y1 - free.y0 < H * 0.3) return NO_FIT;
    if (p === "focus") {
      // Keep the zoom, just put the pawn in the middle of the free area.
      const [, py] = toPx(shot.target);
      return { s: 1, x: 0, y: (free.y0 + free.y1) / 2 - py };
    }
    const pts = corners.map(toPx);
    const shape = hull(pts);
    const bx0 = Math.min(...pts.map((q) => q[0]));
    const bx1 = Math.max(...pts.map((q) => q[0]));
    const by0 = Math.min(...pts.map((q) => q[1]));
    const by1 = Math.max(...pts.map((q) => q[1]));
    const solve = (f: Px) => {
      const s = THREE.MathUtils.clamp(Math.min((f.x1 - f.x0) / (bx1 - bx0), (f.y1 - f.y0) / (by1 - by0)), 0.4, 1.25);
      const cx = (f.x0 + f.x1) / 2;
      const cy = (f.y0 + f.y1) / 2;
      const x = cx - (s * ((bx0 + bx1) / 2 - W / 2) + W / 2);
      const y = cy - (s * ((by0 + by1) / 2 - H / 2) + H / 2);
      const outline = shape.map(([px, py]): Pt => [s * (px - W / 2) + W / 2 + x, s * (py - H / 2) + H / 2 + y]);
      return { fit: { s, x, y }, outline };
    };
    let out = solve(free);
    // Side panels only matter where they actually sit on the board: step the free area around them.
    const hits = hud.sides.filter((q) => overlaps(out.outline, q));
    if (hits.length) {
      const narrowed = { ...free };
      for (const q of hits) {
        if ((q.x0 + q.x1) / 2 < W / 2) narrowed.x0 = Math.max(narrowed.x0, q.x1 + 8);
        else narrowed.x1 = Math.min(narrowed.x1, q.x0 - 8);
      }
      if (narrowed.x1 - narrowed.x0 > W * 0.45) out = solve(narrowed);
    }
    return out.fit;
  };

  const applyFit = (f: Fit) => {
    const cam = camera as THREE.PerspectiveCamera;
    const W = size.width;
    const H = size.height;
    if (Math.abs(f.s - 1) < 0.001 && Math.abs(f.x) < 0.5 && Math.abs(f.y) < 0.5) cam.clearViewOffset();
    else cam.setViewOffset(W * f.s, H * f.s, ((f.s - 1) * W) / 2 - f.x, ((f.s - 1) * H) / 2 - f.y, W, H);
  };

  // Re-fit whenever the camera preset, the window or the HUD layout changes.
  useEffect(() => {
    const to = fitFor(preset, shotFor(preset));
    const f = fit.current;
    f.from = f.cur;
    f.to = to;
    f.t = reduced ? 1 : 0;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, portrait, size.width, size.height, hudNonce, corners]);

  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const c = controls.current;
    const a = anim.current;
    const f = fit.current;
    if (f.t < 1 || f.cur !== f.to) {
      f.t = Math.min(1, f.t + dt / 0.5);
      const e = 1 - (1 - f.t) ** 3;
      f.cur = f.t >= 1 ? f.to : { s: f.from.s + (f.to.s - f.from.s) * e, x: f.from.x + (f.to.x - f.from.x) * e, y: f.from.y + (f.to.y - f.from.y) * e };
      applyFit(f.cur);
      invalidate();
    }
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
