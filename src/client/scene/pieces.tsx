// Low-poly game pieces: character pawns with hats, the masked thief with a growing loot sack,
// plus-shaped cameras, framed paintings on gallery stands, and padlocks. Geometry is built in code.

import { useMemo } from "react";
import * as THREE from "three";
import { character, type DetectiveColour } from "../../shared/characters";
import { discTexture, glowTexture, paintingTexture, powerPlateTexture } from "./textures";

const pawnProfile = (() => {
  const pts: [number, number][] = [
    [0, 0],
    [0.27, 0],
    [0.29, 0.03],
    [0.28, 0.08],
    [0.24, 0.1],
    [0.2, 0.16],
    [0.15, 0.3],
    [0.11, 0.42],
    [0.12, 0.45],
    [0.16, 0.47],
    [0.12, 0.5],
    [0, 0.5],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
})();

let pawnGeo: THREE.LatheGeometry | null = null;
function getPawnGeo() {
  if (!pawnGeo) pawnGeo = new THREE.LatheGeometry(pawnProfile, 12);
  return pawnGeo;
}

const HEAD_Y = 0.62;

/** A chunky detective pawn in its character colour, wearing its hat. */
export function Pawn({ colour, dim = false }: { colour: DetectiveColour; dim?: boolean }) {
  const ch = character(colour);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: ch.hex, roughness: 0.35, metalness: 0.05, flatShading: true }), [ch.hex]);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(ch.hex).multiplyScalar(0.55), roughness: 0.6, flatShading: true }), [ch.hex]);
  return (
    <group>
      <mesh geometry={getPawnGeo()} material={mat} castShadow />
      <mesh position={[0, HEAD_Y, 0]} material={mat} castShadow>
        <icosahedronGeometry args={[0.15, 1]} />
      </mesh>
      {/* eyes */}
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} position={[x, HEAD_Y + 0.01, 0.135]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshBasicMaterial color={dim ? "#555" : "#1b1834"} />
        </mesh>
      ))}
      <Hat kind={ch.hat} mat={dark} accent={mat} />
    </group>
  );
}

function Hat({ kind, mat, accent }: { kind: string; mat: THREE.Material; accent: THREE.Material }) {
  const y = HEAD_Y;
  switch (kind) {
    case "captain":
      return (
        <group position={[0, y + 0.1, 0]}>
          <mesh material={mat} castShadow>
            <cylinderGeometry args={[0.15, 0.14, 0.09, 10]} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.17, 0.15, 0.03, 10]} />
            <meshStandardMaterial color="#f2f0ea" flatShading />
          </mesh>
          <mesh position={[0, -0.04, 0.11]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.2, 0.02, 0.1]} />
            <meshStandardMaterial color="#1b1834" />
          </mesh>
          <mesh position={[0, 0.0, 0.15]}>
            <sphereGeometry args={[0.025, 6, 6]} />
            <meshStandardMaterial color="#ffc14d" emissive="#ffc14d" emissiveIntensity={0.4} />
          </mesh>
        </group>
      );
    case "goggles":
      return (
        <group position={[0, y + 0.04, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mat}>
            <torusGeometry args={[0.15, 0.025, 6, 14]} />
          </mesh>
          {[-0.06, 0.06].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.04, 10]} />
              <meshStandardMaterial color="#8fe0ff" emissive="#3aa0d8" emissiveIntensity={0.5} metalness={0.5} roughness={0.2} />
            </mesh>
          ))}
          <mesh position={[0, 0.13, -0.02]} material={accent}>
            <sphereGeometry args={[0.05, 6, 6]} />
          </mesh>
        </group>
      );
    case "deerstalker":
      return (
        <group position={[0, y + 0.07, 0]}>
          <mesh scale={[1.15, 0.7, 1.25]} castShadow>
            <icosahedronGeometry args={[0.15, 1]} />
            <meshStandardMaterial color="#8a6a3a" flatShading />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, -0.03, s * 0.16]} rotation={[s * 0.4, 0, 0]}>
              <boxGeometry args={[0.16, 0.02, 0.08]} />
              <meshStandardMaterial color="#6f5430" flatShading />
            </mesh>
          ))}
          {/* magnifying glass held at the side */}
          <group position={[0.2, -0.3, 0.08]} rotation={[0, 0, -0.5]}>
            <mesh>
              <torusGeometry args={[0.06, 0.012, 6, 12]} />
              <meshStandardMaterial color="#d8b04a" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.09, 5]} />
              <meshStandardMaterial color="#5a3a1a" />
            </mesh>
          </group>
        </group>
      );
    case "helmet":
      return (
        <group position={[0, y + 0.1, 0]}>
          <mesh scale={[1, 1.35, 1]} material={mat} castShadow>
            <sphereGeometry args={[0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, -0.02, 0]} material={mat}>
            <cylinderGeometry args={[0.19, 0.19, 0.02, 12]} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#d8d8e8" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.06, 0.14]}>
            <boxGeometry args={[0.05, 0.06, 0.01]} />
            <meshStandardMaterial color="#e8e8f0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      );
    case "guard":
      return (
        <group>
          <group position={[0, y + 0.1, 0]}>
            <mesh material={mat} castShadow>
              <cylinderGeometry args={[0.16, 0.14, 0.07, 10]} />
            </mesh>
            <mesh position={[0, -0.03, 0.1]} rotation={[0.25, 0, 0]} material={mat}>
              <boxGeometry args={[0.22, 0.02, 0.12]} />
            </mesh>
          </group>
          {/* flashlight */}
          <group position={[0.2, 0.3, 0.1]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.03, 0.025, 0.16, 6]} />
              <meshStandardMaterial color="#2a2840" />
            </mesh>
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.04, 0.03, 0.03, 8]} />
              <meshStandardMaterial color="#fff6c8" emissive="#ffe08a" emissiveIntensity={1.5} />
            </mesh>
          </group>
        </group>
      );
    case "specs":
    default:
      return (
        <group position={[0, y + 0.02, 0.13]}>
          {[-0.055, 0.055].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <torusGeometry args={[0.04, 0.009, 5, 12]} />
              <meshStandardMaterial color="#2a2840" />
            </mesh>
          ))}
          <mesh position={[0, 0.12, -0.13]} castShadow>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#d8d0c0" flatShading />
          </mesh>
        </group>
      );
  }
}

/** The thief: charcoal pawn, gold-rimmed domino mask, loot sack that grows with the haul. */
export function ThiefPawn({ haul = 0, ghost = false }: { haul?: number; ghost?: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a3a48",
        roughness: 0.4,
        flatShading: true,
        transparent: ghost,
        opacity: ghost ? 0.55 : 1,
        emissive: ghost ? "#6a5aa8" : "#000000",
        emissiveIntensity: ghost ? 0.35 : 0,
        depthWrite: !ghost,
      }),
    [ghost],
  );
  const sack = 0.08 + Math.min(9, haul) * 0.018;
  return (
    <group>
      <mesh geometry={getPawnGeo()} material={mat} castShadow={!ghost} />
      <mesh position={[0, HEAD_Y, 0]} material={mat} castShadow={!ghost}>
        <icosahedronGeometry args={[0.15, 1]} />
      </mesh>
      {/* mask band */}
      <mesh position={[0, HEAD_Y + 0.015, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.158, 0.158, 0.07, 14, 1, true]} />
        <meshStandardMaterial color="#15141f" roughness={0.6} side={THREE.DoubleSide} transparent={ghost} opacity={ghost ? 0.6 : 1} />
      </mesh>
      {[-0.055, 0.055].map((x) => (
        <group key={x} position={[x, HEAD_Y + 0.015, 0.15]}>
          <mesh>
            <torusGeometry args={[0.03, 0.008, 5, 10]} />
            <meshStandardMaterial color="#ffc14d" emissive="#ffc14d" emissiveIntensity={0.6} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.022, 6, 6]} />
            <meshBasicMaterial color="#fff5dc" />
          </mesh>
        </group>
      ))}
      {/* beanie */}
      <mesh position={[0, HEAD_Y + 0.08, 0]} scale={[1, 0.7, 1]} material={mat}>
        <sphereGeometry args={[0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* loot sack */}
      <group position={[0, 0.32, -0.2]}>
        <mesh position={[0, 0, -sack * 0.4]} castShadow={!ghost}>
          <icosahedronGeometry args={[sack, 1]} />
          <meshStandardMaterial color="#b89a6a" roughness={0.9} flatShading transparent={ghost} opacity={ghost ? 0.55 : 1} />
        </mesh>
        {haul > 0 && (
          <mesh position={[0, sack * 0.7, -sack * 0.4]}>
            <boxGeometry args={[0.08, 0.1, 0.02]} />
            <meshStandardMaterial color="#ffc14d" emissive="#ffc14d" emissiveIntensity={0.5} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** A red plus-shaped CCTV unit with its number plate and a status LED. */
export function CameraPiece({ n, led }: { n: number; led: "on" | "off" | "dead" }) {
  return (
    <group>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} rotation={[0, r, 0]} position={[0, 0.09, 0]} castShadow>
          <boxGeometry args={[0.56, 0.16, 0.2]} />
          <meshStandardMaterial color="#d8323c" roughness={0.45} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.2, 12]} />
        <meshStandardMaterial color="#e8404a" roughness={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.225, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.14, 16]} />
        <meshBasicMaterial map={discTexture(String(n))} />
      </mesh>
      <mesh position={[0.2, 0.2, 0.2]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial
          color={led === "on" ? "#5cff9a" : led === "dead" ? "#ff4d6d" : "#444455"}
          emissive={led === "on" ? "#2cff7a" : led === "dead" ? "#ff4d6d" : "#000000"}
          emissiveIntensity={led === "off" ? 0 : 2}
        />
      </mesh>
    </group>
  );
}

/** A framed painting on a little walnut gallery stand, with a warm light pool. */
export function PaintingPiece({ id, lit = true }: { id: number; lit?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[0.46, 0.14, 0.24]} />
        <meshStandardMaterial color="#7a5234" roughness={0.6} flatShading />
      </mesh>
      <group position={[0, 0.42, 0]} rotation={[-0.12, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.6, 0.05]} />
          <meshStandardMaterial color="#c8962e" metalness={0.4} roughness={0.35} flatShading />
        </mesh>
        <mesh position={[0, 0, 0.027]}>
          <planeGeometry args={[0.4, 0.5]} />
          <meshStandardMaterial map={paintingTexture(id)} roughness={0.8} emissive="#ffffff" emissiveMap={paintingTexture(id)} emissiveIntensity={lit ? 0.35 : 0.05} />
        </mesh>
      </group>
      {lit && (
        <mesh position={[0, 0.015, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial map={glowTexture()} color="#ffc56b" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

/** A white padlock. Face down it shows the keyhole; flipped it shows silver "O" or red "L". */
export function Padlock({ face }: { face: "open" | "locked" | null }) {
  const sticker = face === "open" ? discTexture("O", "#2a2840", "#d8dce8") : face === "locked" ? discTexture("L", "#ffffff", "#d8323c") : null;
  return (
    <group>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.34, 0.28, 0.14]} />
        <meshStandardMaterial color="#f4f2ec" roughness={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <torusGeometry args={[0.1, 0.03, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#e8e6e0" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.13, 0.071]}>
        <planeGeometry args={[0.2, 0.2]} />
        {sticker ? <meshBasicMaterial map={sticker} /> : <meshStandardMaterial color="#d8d6d0" />}
      </mesh>
      {!sticker && (
        <mesh position={[0, 0.13, 0.073]}>
          <circleGeometry args={[0.03, 8]} />
          <meshBasicMaterial color="#9a98a8" />
        </mesh>
      )}
    </group>
  );
}

/**
 * The power switch: a hazard-striped floor plate with a breaker cabinet behind it. It sits low so a
 * pawn can stand on the plate (a detective ending there flips the power back on). The lever is up
 * and the lamp mint while the power is on; down and red once it's cut.
 */
export function PowerSwitch({ on }: { on: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.88, 0.88]} />
        <meshStandardMaterial map={powerPlateTexture(on)} roughness={0.6} emissive={on ? "#2cff9a" : "#ff2d55"} emissiveMap={powerPlateTexture(on)} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.014, 0]}>
        <boxGeometry args={[0.92, 0.028, 0.92]} />
        <meshStandardMaterial color="#2a2840" roughness={0.8} flatShading />
      </mesh>
      {/* breaker cabinet along the back edge */}
      <group position={[0, 0, -0.34]}>
        <mesh position={[0, 0.26, 0]} castShadow>
          <boxGeometry args={[0.66, 0.5, 0.16]} />
          <meshStandardMaterial color="#d9a52b" roughness={0.55} flatShading />
        </mesh>
        <mesh position={[0, 0.53, 0]} castShadow>
          <boxGeometry args={[0.72, 0.06, 0.2]} />
          <meshStandardMaterial color="#f0c24a" roughness={0.5} flatShading />
        </mesh>
        {/* lever slot + lever */}
        <mesh position={[0, 0.28, 0.085]}>
          <boxGeometry args={[0.1, 0.3, 0.02]} />
          <meshStandardMaterial color="#1b1834" />
        </mesh>
        <group position={[0, 0.28, 0.1]} rotation={[on ? 0.7 : -0.7, 0, 0]}>
          <mesh position={[0, 0.1, 0.03]} castShadow>
            <boxGeometry args={[0.06, 0.2, 0.06]} />
            <meshStandardMaterial color="#e8e6e0" roughness={0.4} flatShading />
          </mesh>
          <mesh position={[0, 0.21, 0.03]}>
            <sphereGeometry args={[0.065, 8, 8]} />
            <meshStandardMaterial color={on ? "#4fe0b0" : "#ff4d6d"} emissive={on ? "#2cff9a" : "#ff2d55"} emissiveIntensity={on ? 1.2 : 0.9} />
          </mesh>
        </group>
        {/* status lamps */}
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} position={[x, 0.43, 0.085]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color={on ? "#5cff9a" : "#ff4d6d"} emissive={on ? "#2cff7a" : "#ff2d55"} emissiveIntensity={2} />
          </mesh>
        ))}
      </group>
      <sprite position={[0, 0.35, 0]} scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={glowTexture()} color={on ? "#4fe0b0" : "#ff4d6d"} transparent opacity={on ? 0.28 : 0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}
