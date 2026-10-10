// The R3F canvas with quality presets (DPR cap, shadows, antialias) and the shared night lighting.
// "Low" quality drops shadows and caps DPR at 1 so phones and old laptops stay smooth.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { usePrefs, type Quality } from "../prefs";
import { Bloom } from "./Bloom";

export const DPR: Record<Quality, [number, number]> = { low: [1, 1], medium: [1, 1.5], high: [1, 2] };

export function SceneCanvas({ children, frameloop = "always", camera, fog = [22, 48] }: { children: ReactNode; frameloop?: "always" | "demand"; camera?: { position: [number, number, number]; fov?: number }; fog?: [number, number] }) {
  const quality = usePrefs((s) => s.quality);
  return (
    <Canvas
      className="canvas-layer"
      frameloop={frameloop}
      dpr={DPR[quality]}
      shadows={quality === "low" ? false : { type: THREE.PCFShadowMap }}
      gl={{ antialias: quality !== "low", alpha: true, powerPreference: "high-performance" }}
      camera={{ position: camera?.position ?? [0, 14, 12], fov: camera?.fov ?? 40, near: 0.1, far: 120 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <fog attach="fog" args={["#0e0c24", fog[0], fog[1]]} />
      {children}
      {quality === "high" && <Bloom />}
    </Canvas>
  );
}

export type LightMood = "night" | "emergency" | "chase" | "dawn";

/** Moonlight + hemisphere, with smooth transitions between moods (power cut, chase). */
export function NightLights({ mood = "night", shadowSize = 16 }: { mood?: LightMood; shadowSize?: number }) {
  const quality = usePrefs((s) => s.quality);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const t = useRef(0);
  const { invalidate } = useThree();

  // Emergency stays close to neutral: light colour multiplies surface colour, so a saturated red sky would
  // crush every room to maroon. The red comes from the pulsing rim, the fog and the screen-edge vignette.
  const targets: Record<LightMood, { sky: string; ground: string; hemi: number; moon: number; moonColour: string; rim: number; rimColour: string; fog: string }> = {
    night: { sky: "#7f96e6", ground: "#241c48", hemi: 1.15, moon: 1.6, moonColour: "#c8d6ff", rim: 0, rimColour: "#ff4d6d", fog: "#0e0c24" },
    emergency: { sky: "#9a86b8", ground: "#3a1c38", hemi: 0.85, moon: 0.9, moonColour: "#ffc0c8", rim: 3, rimColour: "#ff3355", fog: "#2a0a16" },
    chase: { sky: "#8a96e6", ground: "#2a1c48", hemi: 1.1, moon: 1.5, moonColour: "#d8e0ff", rim: 4, rimColour: "#ff4d6d", fog: "#0e0c24" },
    dawn: { sky: "#ffc8a0", ground: "#5a3a48", hemi: 1.6, moon: 2.2, moonColour: "#ffe0b8", rim: 0, rimColour: "#ffb070", fog: "#0e0c24" },
  };

  useEffect(() => invalidate(), [mood, invalidate]);

  useFrame((_, dt) => {
    const want = targets[mood];
    const k = 1 - Math.exp(-dt * 3);
    let moving = false;
    const lerpColour = (c: THREE.Color, hex: string) => {
      const target = new THREE.Color(hex);
      if (Math.abs(c.r - target.r) + Math.abs(c.g - target.g) + Math.abs(c.b - target.b) > 0.003) moving = true;
      c.lerp(target, k);
    };
    if (hemi.current) {
      lerpColour(hemi.current.color, want.sky);
      lerpColour(hemi.current.groundColor, want.ground);
      if (Math.abs(hemi.current.intensity - want.hemi) > 0.01) moving = true;
      hemi.current.intensity += (want.hemi - hemi.current.intensity) * k;
    }
    if (moon.current) {
      lerpColour(moon.current.color, want.moonColour);
      if (Math.abs(moon.current.intensity - want.moon) > 0.01) moving = true;
      moon.current.intensity += (want.moon - moon.current.intensity) * k;
    }
    if (scene.fog) lerpColour(scene.fog.color, want.fog);
    if (rim.current) {
      t.current += dt;
      const pulse = mood === "chase" ? 0.65 + 0.35 * Math.sin(t.current * 7) : mood === "emergency" ? 0.8 + 0.2 * Math.sin(t.current * 2.5) : 1;
      lerpColour(rim.current.color, want.rimColour);
      rim.current.intensity += (want.rim * pulse - rim.current.intensity) * k;
      if (want.rim > 0) moving = true;
    }
    if (moving) invalidate();
  });

  const shadows = quality !== "low";
  return (
    <>
      <hemisphereLight ref={hemi} args={["#7f96e6", "#241c48", 1.15]} />
      <ambientLight intensity={0.15} color="#8a8ad8" />
      <directionalLight
        ref={moon}
        position={[-8, 16, -6]}
        intensity={1.6}
        color="#c8d6ff"
        castShadow={shadows}
        shadow-mapSize={quality === "high" ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-shadowSize / 2 - 2}
        shadow-camera-right={shadowSize / 2 + 2}
        shadow-camera-top={shadowSize / 2 + 2}
        shadow-camera-bottom={-shadowSize / 2 - 2}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      <pointLight ref={rim} position={[0, 7, 9]} intensity={0} distance={40} color="#ff4d6d" />
    </>
  );
}
