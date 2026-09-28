// CSS backgrounds for room colours: fill plus the colour-blind pattern (docs/STYLE.md §7), so a
// colour is never communicated by hue alone.

import type { CSSProperties } from "react";
import type { FloorColour } from "../../shared/board/model";
import { COLOUR_PATTERN, FLOOR_HEX } from "../scene/textures";

const SVG: Record<string, string> = {
  stripes: '<path d="M-2 10 L10 -2 M-2 22 L22 -2 M10 22 L22 10" stroke="rgba(255,255,255,.55)" stroke-width="3"/>',
  dots: '<circle cx="5" cy="5" r="2.2" fill="rgba(255,255,255,.6)"/><circle cx="15" cy="15" r="2.2" fill="rgba(255,255,255,.6)"/>',
  waves: '<path d="M0 6 Q5 2 10 6 T20 6 M0 16 Q5 12 10 16 T20 16" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>',
  chevrons: '<path d="M0 12 L5 7 L10 12 L15 7 L20 12" fill="none" stroke="rgba(60,40,20,.55)" stroke-width="2.5"/>',
  crosses: '<path d="M5 2 V8 M2 5 H8 M15 12 V18 M12 15 H18" stroke="rgba(255,255,255,.6)" stroke-width="2"/>',
  grid: '<path d="M0 0 H20 V20" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>',
  plain: "",
};

export function patternUrl(colour: FloorColour): string {
  const body = SVG[COLOUR_PATTERN[colour]];
  if (!body) return "none";
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'>${body}</svg>`)}")`;
}

export function drawPatternCss(colour: FloorColour): CSSProperties {
  return { backgroundColor: FLOOR_HEX[colour][0], backgroundImage: patternUrl(colour), color: colour === "white" || colour === "yellow" ? "#1b1834" : "#fff" };
}
