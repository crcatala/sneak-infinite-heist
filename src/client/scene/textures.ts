// Procedural canvas textures: marbled gallery floors, flagstones, cobbles, the nine paintings,
// dice faces and number discs. Everything is drawn in code (no image assets) and cached.

import * as THREE from "three";
import type { FloorColour } from "../../shared/board/model";
import { mulberry32 } from "../../shared/rng";

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function finish(key: string, c: HTMLCanvasElement, repeat = false): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

// --- value noise ---------------------------------------------------------------------------------

function makeNoise(seed: number) {
  const rng = mulberry32(seed);
  const size = 64;
  const grid = Array.from({ length: size * size }, () => rng());
  const at = (x: number, y: number) => grid[((y % size) + size) % size * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const v = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
    return a + (b - a) * yf;
  };
  return (x: number, y: number) => v(x, y) * 0.5 + v(x * 2, y * 2) * 0.25 + v(x * 4, y * 4) * 0.125 + v(x * 8, y * 8) * 0.0625;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const FLOOR_HEX: Record<FloorColour, [string, string]> = {
  red: ["#b8323c", "#f07a7a"],
  purple: ["#6e3fa8", "#b98ae8"],
  blue: ["#2f5fb8", "#86b5ff"],
  yellow: ["#c88a22", "#ffd77a"],
  green: ["#2e8f5a", "#8fe0a8"],
  white: ["#e6e2d8", "#a9a4b8"],
  grey: ["#7d8194", "#a3a7b8"],
};

/** Colour-blind patterns per floor colour (docs/STYLE.md §7). */
export const COLOUR_PATTERN: Record<FloorColour, "stripes" | "dots" | "waves" | "chevrons" | "crosses" | "plain" | "grid"> = {
  red: "stripes",
  purple: "dots",
  blue: "waves",
  yellow: "chevrons",
  green: "crosses",
  white: "plain",
  grey: "grid",
};

export function drawPattern(ctx: CanvasRenderingContext2D, pattern: (typeof COLOUR_PATTERN)[FloorColour], w: number, h: number, colour: string, step = 32) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = step / 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (pattern === "stripes") for (let i = -h; i < w + h; i += step / 1.5) (ctx.moveTo(i, 0), ctx.lineTo(i + h, h));
  if (pattern === "waves") for (let y = step / 2; y < h; y += step) for (let x = 0; x <= w; x += 4) (x === 0 ? ctx.moveTo(x, y + Math.sin(x / 8) * 5) : ctx.lineTo(x, y + Math.sin(x / 8) * 5));
  if (pattern === "chevrons")
    for (let y = step / 2; y < h + step; y += step / 1.3)
      for (let x = 0; x < w; x += step) (ctx.moveTo(x, y), ctx.lineTo(x + step / 2, y - step / 3), ctx.lineTo(x + step, y));
  if (pattern === "crosses")
    for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) (ctx.moveTo(x - 6, y), ctx.lineTo(x + 6, y), ctx.moveTo(x, y - 6), ctx.lineTo(x, y + 6));
  if (pattern === "grid") for (let i = 0; i <= w; i += step) (ctx.moveTo(i, 0), ctx.lineTo(i, h), ctx.moveTo(0, i), ctx.lineTo(w, i));
  ctx.stroke();
  if (pattern === "dots") for (let y = step / 2; y < h; y += step) for (let x = (y / step) % 2 ? step : step / 2; x < w; x += step) (ctx.beginPath(), ctx.arc(x, y, step / 8, 0, Math.PI * 2), ctx.fill());
  ctx.restore();
}

/** Marbled floor for a gallery colour, optionally with its colour-blind pattern. Tiles across. */
export function marbleTexture(colour: FloorColour, pattern: boolean): THREE.Texture {
  const key = `marble:${colour}:${pattern}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const [base, vein] = FLOOR_HEX[colour];
  const b = hexRgb(base);
  const v = hexRgb(vein);
  const n = makeNoise(colour.length * 97 + colour.charCodeAt(0));
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Seamless: sample on a torus by blending wrapped coordinates.
      const u = x / S;
      const w = y / S;
      const f = (px: number, py: number) => n(px * 6, py * 6);
      const nn = f(u, w) * (1 - u) * (1 - w) + f(u - 1, w) * u * (1 - w) + f(u, w - 1) * (1 - u) * w + f(u - 1, w - 1) * u * w;
      const vein0 = Math.abs(Math.sin((u + w * 0.6) * 9 + nn * 7));
      const t = Math.pow(1 - vein0, 6) * 0.8 + nn * 0.35;
      const i = (y * S + x) * 4;
      img.data[i] = b[0] + (v[0] - b[0]) * t;
      img.data[i + 1] = b[1] + (v[1] - b[1]) * t;
      img.data[i + 2] = b[2] + (v[2] - b[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (colour === "grey") {
    // Flagstones: faint joints on a 2×2 grid per texture repeat.
    ctx.strokeStyle = "rgba(20,20,40,0.25)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, S / 2, S / 2);
    ctx.strokeRect(S / 2, S / 2, S / 2, S / 2);
  }
  if (pattern && COLOUR_PATTERN[colour] !== "plain") {
    ctx.globalAlpha = 0.45;
    drawPattern(ctx, COLOUR_PATTERN[colour], S, S, colour === "white" || colour === "yellow" ? "#3a2e2a" : "#ffffff", 32);
    ctx.globalAlpha = 1;
  }
  return finish(key, c, true);
}

export function cobbleTexture(): THREE.Texture {
  const hit = cache.get("cobble");
  if (hit) return hit;
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#2b2a45";
  ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(42);
  for (let y = 0; y < S + 40; y += 30) {
    for (let x = (y / 30) % 2 ? 0 : 20; x < S + 40; x += 42) {
      const shade = 90 + rng() * 30;
      ctx.fillStyle = `rgb(${shade * 0.78},${shade * 0.8},${shade})`;
      const rx = 17 + rng() * 4;
      const ry = 12 + rng() * 3;
      ctx.beginPath();
      ctx.ellipse(x + rng() * 4, y + rng() * 4, rx, ry, rng() * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(x - 3, y - 4, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish("cobble", c, true);
}

/** Soft radial glow (for lamp pools, spotlights, the danger pulse). */
export function glowTexture(): THREE.Texture {
  const hit = cache.get("glow");
  if (hit) return hit;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = finish("glow", c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A white disc with a number (camera plates) or a letter. */
export function discTexture(label: string, fg = "#1b1834", bg = "#ffffff"): THREE.Texture {
  const key = `disc:${label}:${fg}:${bg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = `700 ${S * 0.62}px Fredoka, Nunito, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, S / 2, S / 2 + 6);
  return finish(key, c);
}

/** The camera plate of a dead camera: a greyed disc with its number crossed out in red. */
export function deadDiscTexture(label: string): THREE.Texture {
  const key = `disc:dead:${label}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#9a9aa8";
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#55556a";
  ctx.font = `700 ${S * 0.62}px Fredoka, Nunito, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, S / 2, S / 2 + 6);
  ctx.strokeStyle = "#ff4d6d";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(28, 28);
  ctx.lineTo(S - 28, S - 28);
  ctx.moveTo(S - 28, 28);
  ctx.lineTo(28, S - 28);
  ctx.stroke();
  return finish(key, c);
}

/** A small rounded name tag in a detective's colour (floats over their pointer pins). */
export function tagTexture(label: string, bg: string, fg = "#07061a"): THREE.Texture {
  const key = `tag:${label}:${bg}:${fg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 80;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, (H - 8) / 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(7, 6, 26, 0.55)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `700 ${H * 0.5}px Fredoka, Nunito, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W / 2, H / 2 + 3, W - 36);
  return finish(key, c);
}

/** A name tag sized to its text, for what another detective is doing ("Alex · 4 steps"). `userData.aspect` is width over height. */
export function noteTexture(label: string, bg: string, fg = "#07061a"): THREE.Texture {
  const key = `note:${label}:${bg}:${fg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const H = 80;
  const font = `700 ${H * 0.5}px Fredoka, Nunito, sans-serif`;
  const probe = canvas(8, 8)[1];
  probe.font = font;
  const W = Math.ceil(probe.measureText(label).width + H * 0.9);
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, (H - 8) / 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(7, 6, 26, 0.55)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W / 2, H / 2 + 3);
  const tex = finish(key, c);
  tex.userData.aspect = W / H;
  return tex;
}

/** The power switch's floor plate: hazard-striped border around a bolt (mint when the power is on, alarm red when cut). */
export function powerPlateTexture(on: boolean): THREE.Texture {
  const key = `powerPlate:${on}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#22203a";
  ctx.fillRect(0, 0, S, S);
  // Hazard stripes around the edge.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  ctx.rect(26, 26, S - 52, S - 52);
  ctx.clip("evenodd");
  ctx.fillStyle = "#ffc14d";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#1b1834";
  for (let i = -S; i < S * 2; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 20, 0);
    ctx.lineTo(i + 20 + S, S);
    ctx.lineTo(i + S, S);
    ctx.fill();
  }
  ctx.restore();
  // Inner panel with the bolt.
  const tint = on ? "#4fe0b0" : "#ff4d6d";
  ctx.fillStyle = on ? "#123a34" : "#3d1224";
  ctx.fillRect(26, 26, S - 52, S - 52);
  ctx.fillStyle = tint;
  ctx.strokeStyle = tint;
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(146, 52);
  ctx.lineTo(88, 138);
  ctx.lineTo(126, 138);
  ctx.lineTo(110, 204);
  ctx.lineTo(170, 114);
  ctx.lineTo(130, 114);
  ctx.closePath();
  if (on) ctx.fill();
  else {
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(196, 196);
    ctx.stroke();
  }
  return finish(key, c);
}

// --- dice --------------------------------------------------------------------------------------

function dieCanvas(bg: string): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  return [c, ctx];
}

export function numberDieFace(n: number): THREE.Texture {
  const key = `dieN:${n}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = dieCanvas("#1a1826");
  ctx.fillStyle = "#26233a";
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "400 78px Bungee, Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 70);
  return finish(key, c);
}

export function actionDieFace(face: "eye" | "scan" | "motion"): THREE.Texture {
  const key = `dieA:${face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = dieCanvas("#f4f1e8");
  ctx.strokeStyle = "#1b1834";
  ctx.fillStyle = "#1b1834";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (face === "eye") {
    ctx.beginPath();
    ctx.moveTo(18, 64);
    ctx.quadraticCurveTo(64, 20, 110, 64);
    ctx.quadraticCurveTo(64, 108, 18, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f1e8";
    ctx.beginPath();
    ctx.arc(58, 58, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === "scan") {
    // A security camera with an "S".
    ctx.strokeRect(26, 40, 62, 42);
    ctx.beginPath();
    ctx.moveTo(88, 52);
    ctx.lineTo(106, 42);
    ctx.lineTo(106, 80);
    ctx.lineTo(88, 70);
    ctx.stroke();
    ctx.font = "700 36px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", 57, 63);
  } else {
    ctx.font = "400 76px Bungee, Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("M", 64, 70);
  }
  return finish(key, c);
}

// --- paintings ----------------------------------------------------------------------------------

/** The nine paintings (see ARTWORKS): original scenes, drawn in code. */
export function paintingTexture(id: number): THREE.Texture {
  const key = `art:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 128;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(id * 131 + 7);
  const grad = (stops: [number, string][], x0 = 0, y0 = 0, x1 = 0, y1 = H) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  const oval = (x: number, y: number, rx: number, ry: number, col: string, rot = 0, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const circle = (x: number, y: number, r: number, col: string, a = 1) => oval(x, y, r, r, col, 0, a);
  const poly = (col: string, ...pts: number[]) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  };
  const rect = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  const line = (col: string, width: number, ...pts: number[]) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  switch (id) {
    case 0: {
      // Lighthouse at Low Tide: a striped lighthouse on the rocks, teal dusk sea
      grad([[0, "#2d6f7a"], [0.62, "#9ad6c4"], [0.63, "#1f7d86"], [1, "#134a54"]]);
      ctx.globalAlpha = 0.3;
      poly("#fff4b0", 40, 45, 128, 22, 128, 72);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 12; i++) {
        const x = 50 + rng() * 70;
        const y = 108 + rng() * 48;
        line("rgba(255,255,255,0.45)", 2, x, y, x + 8 + rng() * 10, y);
      }
      oval(42, 116, 34, 14, "#3a3a46");
      oval(18, 122, 16, 8, "#2c2c38");
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(30, 110);
      ctx.lineTo(50, 110);
      ctx.lineTo(46, 50);
      ctx.lineTo(34, 50);
      ctx.closePath();
      ctx.clip();
      rect(0, 0, W, H, "#f6f2ea");
      for (const y of [58, 78, 98]) rect(0, y, W, 10, "#d8383c");
      ctx.restore();
      rect(31, 48, 18, 3, "#2a2a34");
      rect(34, 38, 12, 10, "#ffe680");
      poly("#d8383c", 31, 39, 49, 39, 40, 28);
      break;
    }
    case 1: {
      // Balloons over Brindle Fair: three hot-air balloons over green hills
      grad([[0, "#6fbcee"], [1, "#dff3fc"]]);
      for (const [x, y] of [[24, 30], [100, 70], [60, 118]]) {
        oval(x, y, 16, 6, "#ffffff", 0, 0.8);
        oval(x + 10, y - 4, 10, 6, "#ffffff", 0, 0.8);
      }
      oval(28, 172, 70, 36, "#6fbf5a");
      oval(112, 176, 60, 36, "#57a848");
      const balloon = (x: number, y: number, r: number, col: string, stripe: string) => {
        line("#6a4a2a", 1, x - r * 0.55, y + r * 0.75, x - 3, y + r + 9);
        line("#6a4a2a", 1, x + r * 0.55, y + r * 0.75, x + 3, y + r + 9);
        poly(col, x - r * 0.86, y + r * 0.5, x + r * 0.86, y + r * 0.5, x, y + r + 5);
        circle(x, y, r, col);
        oval(x, y, r * 0.38, r, stripe);
        rect(x - 4, y + r + 8, 8, 6, "#8a5a2a");
      };
      balloon(40, 48, 20, "#e8484f", "#f7c531");
      balloon(94, 34, 13, "#f7c531", "#3d7fe0");
      balloon(88, 96, 15, "#3fb86a", "#f2efe6");
      break;
    }
    case 2: {
      // Portrait of a Magpie: the thief's namesake, with a stolen gold ring
      grad([[0, "#f2a7b8"], [1, "#d27290"]]);
      oval(64, 80, 50, 64, "#fbd9e0");
      ctx.strokeStyle = "#c8962e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(64, 80, 50, 64, 0, 0, Math.PI * 2);
      ctx.stroke();
      line("#6a4226", 5, 18, 118, 112, 110);
      poly("#1f2a4a", 46, 96, 14, 124, 22, 130, 52, 104);
      oval(62, 92, 23, 15, "#1c1c24", -0.4);
      oval(68, 99, 12, 8, "#f6f6f6", -0.4);
      oval(56, 87, 12, 5, "#ffffff", -0.4);
      circle(80, 72, 11, "#1c1c24");
      poly("#2a2a2a", 89, 69, 102, 74, 89, 77);
      circle(83, 70, 2.2, "#ffffff");
      line("#1c1c24", 2, 64, 106, 62, 114);
      line("#1c1c24", 2, 72, 105, 72, 113);
      ctx.strokeStyle = "#f0c040";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(103, 81, 5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 3: {
      // Paper Boats: white paper boats on a moonlit navy pond
      grad([[0, "#161b48"], [1, "#2c3f8c"]]);
      circle(98, 28, 12, "#f5e7b0");
      for (let y = 50; y < H; y += 8) line("rgba(245,231,176,0.35)", 2, 98 - 6 - rng() * 6, y, 98 + 6 + rng() * 6, y);
      for (let i = 0; i < 16; i++) {
        const x = rng() * W;
        const y = 50 + rng() * 110;
        line("rgba(160,190,255,0.35)", 1.5, x, y, x + 10 + rng() * 10, y);
      }
      const boat = (x: number, y: number, k: number) => {
        oval(x, y + 9 * k, 16 * k, 3 * k, "#0e1234", 0, 0.5);
        poly("#f4f1e8", x - 15 * k, y, x + 15 * k, y, x + 9 * k, y + 7 * k, x - 9 * k, y + 7 * k);
        poly("#ffffff", x - 8 * k, y, x + 8 * k, y, x, y - 15 * k);
        poly("#d6d2c6", x, y - 15 * k, x + 8 * k, y, x, y);
      };
      boat(36, 76, 1.1);
      boat(82, 112, 1.4);
      boat(34, 138, 0.9);
      break;
    }
    case 4: {
      // Tea for Three: a blue-and-white teapot and three cups on a mustard wall
      grad([[0, "#f2c650"], [1, "#d59c2c"]]);
      rect(0, 112, W, 48, "#f4efe4");
      rect(0, 120, W, 4, "#3d7fe0");
      for (let i = 0; i < 5; i++) line("rgba(255,255,255,0.7)", 2, 96 + i * 3, 64 - i * 6, 100 + i * 3, 58 - i * 6);
      poly("#f7f7fb", 78, 90, 100, 70, 104, 74, 84, 100);
      ctx.strokeStyle = "#f7f7fb";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(34, 88, 12, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      oval(58, 90, 27, 22, "#f7f7fb");
      for (let a = 0; a < 8; a++) circle(58 + Math.cos(a * 0.8) * 16, 92 + Math.sin(a * 0.8) * 11, 3, "#3d7fe0");
      circle(58, 92, 5, "#3d7fe0");
      oval(58, 68, 13, 5, "#f7f7fb");
      circle(58, 62, 4, "#3d7fe0");
      const cup = (x: number, y: number) => {
        oval(x, y + 8, 13, 3.5, "#e6e6ee");
        poly("#f7f7fb", x - 9, y - 6, x + 9, y - 6, x + 6, y + 7, x - 6, y + 7);
        oval(x, y - 6, 9, 2.5, "#9a5a2e");
        rect(x - 8, y - 2, 16, 2, "#3d7fe0");
      };
      cup(22, 134);
      cup(64, 146);
      cup(106, 134);
      break;
    }
    case 5: {
      // Volcano Island at Dusk: a smoking green volcano under a violet sky
      grad([[0, "#3b1f5e"], [0.42, "#7a3b8c"], [0.62, "#f08a4b"], [0.63, "#2a2350"], [1, "#161330"]]);
      for (let i = 0; i < 14; i++) circle(rng() * W, rng() * 50, 0.6 + rng(), "#ffffff", 0.8);
      for (let y = 106; y < H; y += 7) line("rgba(255,150,80,0.35)", 2, 50 + rng() * 10, y, 76 + rng() * 10, y);
      circle(66, 42, 16, "#ffb04a", 0.35);
      poly("#3f7a4a", 12, 102, 116, 102, 76, 44, 56, 44);
      poly("#2f5e3a", 66, 102, 116, 102, 76, 44, 68, 44);
      poly("#ff5a2a", 58, 44, 74, 44, 70, 64, 66, 56, 62, 72, 60, 52);
      for (const [x, y, r] of [[70, 30, 8], [80, 18, 10], [94, 8, 12]]) circle(x, y, r, "#8a8098", 0.6);
      break;
    }
    case 6: {
      // Fox in the First Snow: an orange fox sitting in fresh snow
      grad([[0, "#7f9fc0"], [0.55, "#c7d8ea"], [0.56, "#f2f6fb"], [1, "#ffffff"]]);
      for (const [x, h] of [[14, 40], [34, 52], [102, 46], [120, 36]]) poly("#5e7d8f", x - 12, 88, x + 12, 88, x, 88 - h);
      oval(98, 124, 22, 8, "#e8743a", -0.5);
      oval(113, 115, 7, 5, "#fbf3e8", -0.5);
      oval(70, 114, 21, 17, "#e8743a");
      rect(56, 124, 5, 12, "#3a2418");
      rect(66, 126, 5, 10, "#3a2418");
      oval(58, 110, 8, 12, "#fbf3e8");
      poly("#e8743a", 47, 76, 51, 60, 59, 74);
      poly("#e8743a", 57, 74, 64, 60, 67, 78);
      poly("#3a2418", 49, 67, 51, 60, 54, 66);
      poly("#3a2418", 61, 66, 64, 60, 65, 68);
      circle(57, 85, 12, "#e8743a");
      poly("#e8743a", 48, 82, 34, 90, 48, 94);
      poly("#fbf3e8", 34, 90, 48, 94, 52, 92, 44, 90);
      circle(35, 89, 2, "#1a1a1a");
      circle(53, 82, 1.8, "#1a1a1a");
      for (let i = 0; i < 40; i++) circle(rng() * W, rng() * H, 1 + rng() * 1.5, "#ffffff", 0.85);
      break;
    }
    case 7: {
      // The Big Top: a red-and-cream striped circus tent with a blue pennant
      grad([[0, "#ffc98a"], [1, "#ffeccc"]]);
      rect(0, 128, W, 32, "#4f9a3e");
      ctx.save();
      ctx.beginPath();
      ctx.rect(18, 86, 92, 44);
      ctx.clip();
      for (let x = 18, i = 0; x < 110; x += 12, i++) rect(x, 86, 12, 44, i % 2 ? "#f6eedc" : "#d8383c");
      ctx.restore();
      for (let i = 0; i < 9; i++) poly(i % 2 ? "#f6eedc" : "#d8383c", 64, 34, 10 + i * 12, 88, 22 + i * 12, 88);
      line("#b82830", 3, 10, 88, 118, 88);
      poly("#3a1e2a", 55, 130, 73, 130, 64, 100);
      line("#6a4a2a", 2, 64, 34, 64, 18);
      poly("#3d7fe0", 64, 18, 80, 22, 64, 27);
      for (let i = 0; i < 5; i++) {
        const x = 6 + i * 11;
        poly(["#3d7fe0", "#f7c531", "#3fb86a", "#9a5cd6", "#e8484f"][i], x, 50 - i * 3, x + 9, 50 - i * 3, x + 4, 58 - i * 3);
      }
      line("#6a4a2a", 1, 4, 50, 60, 36);
      break;
    }
    case 8: {
      // Goldfish Bowl: two goldfish in a round bowl on a wooden shelf
      grad([[0, "#b4ecd6"], [1, "#7ccfb0"]]);
      rect(0, 126, W, 34, "#b88a5a");
      rect(0, 124, W, 4, "#8a6038");
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 66, W, H);
      ctx.clip();
      circle(64, 88, 36, "rgba(110,180,240,0.6)");
      ctx.restore();
      for (let i = 0; i < 9; i++) circle(40 + rng() * 48, 116 + rng() * 5, 4, ["#e8484f", "#f7c531", "#f2efe6", "#9a5cd6"][i % 4]);
      line("#3a9a4a", 3, 44, 118, 40, 100, 46, 86);
      line("#3a9a4a", 3, 50, 118, 54, 98);
      oval(60, 88, 12, 7, "#f07a2a");
      poly("#f07a2a", 71, 88, 83, 80, 83, 96);
      circle(54, 86, 1.6, "#1a1a1a");
      oval(82, 104, 7, 4, "#ffb040");
      poly("#ffb040", 75, 104, 68, 99, 68, 109);
      circle(88, 103, 1.2, "#1a1a1a");
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      for (const [x, y, r] of [[50, 76, 2], [47, 70, 2.5]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(64, 88, 38, -0.3 * Math.PI, 1.3 * Math.PI);
      ctx.stroke();
      line("rgba(255,255,255,0.6)", 3, 36, 100, 34, 88);
      break;
    }
  }
  // Canvas grain.
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rng() < 0.5 ? "#000" : "#fff";
    ctx.fillRect(rng() * W, rng() * H, 2, 2);
  }
  ctx.globalAlpha = 1;
  return finish(key, c);
}

/** What a stolen painting leaves in its frame: a dark hollow with torn scraps and a red X. */
export function stolenPaintingTexture(): THREE.Texture {
  const hit = cache.get("art:gone");
  if (hit) return hit;
  const W = 128;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b0820");
  g.addColorStop(1, "#241c4a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const scrap = (col: string, ...pts: number[]) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  };
  scrap("#c9774f", 0, 0, 52, 0, 44, 16, 30, 11, 22, 34, 0, 26);
  scrap("#3a2f7a", W, H, 92, H, 98, 140, 114, 142, W, 112);
  ctx.strokeStyle = "#ff4d6d";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(26, 36);
  ctx.lineTo(W - 26, H - 36);
  ctx.moveTo(W - 26, 36);
  ctx.lineTo(26, H - 36);
  ctx.stroke();
  return finish("art:gone", c);
}

/** The painting as a data URL (for the HUD and plotting pad thumbnails). */
export function paintingDataUrl(id: number): string {
  const t = paintingTexture(id);
  return (t.image as HTMLCanvasElement).toDataURL();
}

/** Vertical fade for light beams: bright at v = 1 (the source), gone at v = 0. */
export function beamTexture(): THREE.Texture {
  const hit = cache.get("beam");
  if (hit) return hit;
  const [c, ctx] = canvas(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const t = finish("beam", c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
