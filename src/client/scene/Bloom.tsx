// Bloom for the "High" graphics preset, using three's own post-processing passes (no extra
// dependency). Takes over rendering at priority 1; lamps, glows and emissive LEDs bloom softly.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export function Bloom({ strength = 0.55, radius = 0.5, threshold = 0.85 }: { strength?: number; radius?: number; threshold?: number }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold));
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, viewport.dpr]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}
