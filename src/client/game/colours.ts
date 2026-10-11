// Board tile colours shared by the player's own highlights and the previews of other detectives.

export const COLOURS = {
  reach: "#ffc14d",
  path: "#fff1b8",
  bad: "#ff4d6d",
  danger: "#ff6b81",
  sight: "#6fe8ff",
  miss: "#9a98b8",
  heat: "#b57bff",
  legal: "#4fe0b0",
  mark: "#ff9f43",
};

/** A hex colour scaled toward black: the legal-move outline sits a shade under the colour it belongs to. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * k).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The dashed legal-move outline for a mover's colour: a shade darker, so it reads as theirs without matching a selected fill. */
export const legalOutline = (hex: string) => shade(hex, 0.8);
