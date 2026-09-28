// Round results and match standings (analysis §4.8). A captured (or dawn-caught) thief scores 0; an
// escaped thief scores the paintings they got out with, pending ones included.

import type { RoundResult } from "./state";

export function roundScore(result: RoundResult): number {
  return result.winner === "thief" && result.reason === "escaped" ? result.paintings : 0;
}

export interface MatchRound {
  thief: string;
  result: RoundResult;
}

export interface Standing {
  playerId: string;
  score: number;
  /** Rounds this player has been the thief. */
  thiefRounds: number;
  escapes: number;
}

/** Standings for a match: best thief score first, ties broken by escapes then seat order. */
export function standings(playerIds: string[], rounds: MatchRound[]): Standing[] {
  const rows = playerIds.map((playerId) => {
    const mine = rounds.filter((r) => r.thief === playerId);
    return {
      playerId,
      score: mine.reduce((sum, r) => sum + roundScore(r.result), 0),
      thiefRounds: mine.length,
      escapes: mine.filter((r) => r.result.winner === "thief").length,
    };
  });
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.score - a.r.score || b.r.escapes - a.r.escapes || a.i - b.i)
    .map(({ r }) => r);
}

/** Player ids sharing the top score (several when tied). */
export function matchWinners(table: Standing[]): string[] {
  if (!table.length) return [];
  const best = table[0].score;
  return table.filter((s) => s.score === best).map((s) => s.playerId);
}
