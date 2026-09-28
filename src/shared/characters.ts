// The six original detectives and the thief. Colours match the six physical pawn colours; names,
// looks and personalities are this game's own.

export type DetectiveColour = "red" | "yellow" | "green" | "blue" | "purple" | "white";

export interface Character {
  id: DetectiveColour;
  name: string;
  short: string;
  /** One-line personality for the lobby card. */
  blurb: string;
  /** Pawn and UI colour. */
  hex: string;
  /** What the pawn wears (drives the 3D model). */
  hat: "captain" | "goggles" | "deerstalker" | "helmet" | "guard" | "specs";
}

export const CHARACTERS: Character[] = [
  { id: "red", name: "Captain Cinnabar", short: "Cinnabar", blurb: "Retired sea captain. Smells a rat at forty paces.", hex: "#e8484f", hat: "captain" },
  { id: "yellow", name: "Dot Marigold", short: "Dot", blurb: "Teen gadgeteer with a pocket full of gizmos.", hex: "#f7c531", hat: "goggles" },
  { id: "green", name: "Professor Sage", short: "Sage", blurb: "Botanist, magnifying glass, never hurried.", hex: "#3fb86a", hat: "deerstalker" },
  { id: "blue", name: "Constable Cobalt", short: "Cobalt", blurb: "By-the-book bobby. Has read the book twice.", hex: "#3d7fe0", hat: "helmet" },
  { id: "purple", name: "Vi Nightingale", short: "Vi", blurb: "Night-shift guard. Knows every creaky floorboard.", hex: "#9a5cd6", hat: "guard" },
  { id: "white", name: "Dr. Ivory Quill", short: "Quill", blurb: "Forensic chemist. Dusts everything for prints.", hex: "#eceae4", hat: "specs" },
];

export const THIEF = { name: "The Magpie", hex: "#34343f", blurb: "Masked, soft-soled, fond of shiny things." };

export function character(id: DetectiveColour): Character {
  return CHARACTERS.find((c) => c.id === id)!;
}

/** The nine paintings: original works by the museum's (made-up) artists, not copies of real ones. */
export const ARTWORKS = [
  { id: 0, title: "Lighthouse at Low Tide", artist: "Morwenna Pike" },
  { id: 1, title: "Balloons over Brindle Fair", artist: "Otto Featherstone" },
  { id: 2, title: "Portrait of a Magpie", artist: "Anonymous (suspiciously)" },
  { id: 3, title: "Paper Boats", artist: "Juniper Wren" },
  { id: 4, title: "Tea for Three", artist: "Aunt Clementine" },
  { id: 5, title: "Volcano Island at Dusk", artist: "Rafael Ember" },
  { id: 6, title: "Fox in the First Snow", artist: "Ingrid Frost" },
  { id: 7, title: "The Big Top", artist: "The Brothers Marzipan" },
  { id: 8, title: "Goldfish Bowl", artist: "Pip, age 7" },
] as const;
