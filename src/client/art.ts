// Character art: transparent full-body illustrations in public/art/detectives (see docs/ART.md).

import type { DetectiveColour } from "../shared/characters";

export type ArtId = DetectiveColour | "thief";

export const characterArt = (id: ArtId) => `${import.meta.env.BASE_URL}art/detectives/${id}.webp`;

export const ALL_ART: ArtId[] = ["red", "yellow", "green", "blue", "purple", "white", "thief"];

/** Small round face crops (96px) for HUD chips, cut from the full-body art. */
export const faceArt = (id: ArtId) => `${import.meta.env.BASE_URL}art/faces/${id}.webp`;
