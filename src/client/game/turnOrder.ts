// The rotation shown in the turn bar. The thief moves after every detective (T, D1, T, D2, T, D3, ...), so the
// thief's turns are easy to count and the detective order is the part players lose track of. Public information
// only: it comes from `nextDetective` and the pawns' order, which every view already carries.

import type { DetectivePawn } from "../../shared/game/state";
import type { GameView } from "../../shared/game/views";

export type TurnNode = { kind: "thief" } | { kind: "detective"; pawn: DetectivePawn };

/**
 * One full cycle starting with whoever is playing now: a detective turn is followed by the thief, then the next
 * detective in order, and so on, so a game with n pawns is 2n nodes long. `null` outside the play phase.
 */
export function turnSequence(game: GameView): TurnNode[] | null {
  if (game.phase !== "play") return null;
  const pawns = game.detectives;
  const n = pawns.length;
  if (n === 0) return null;
  const t = game.turn;
  const nodes: TurnNode[] = [];
  if (t.kind === "detective") {
    const at = pawns.findIndex((d) => d.id === t.pawn);
    if (at < 0) return null;
    for (let k = 0; k < n; k++) nodes.push({ kind: "detective", pawn: pawns[(at + k) % n] }, { kind: "thief" });
  } else if (t.kind === "thief") {
    nodes.push({ kind: "thief" });
    for (let k = 0; k < n; k++) {
      nodes.push({ kind: "detective", pawn: pawns[(game.nextDetective + k) % n] });
      if (k < n - 1) nodes.push({ kind: "thief" });
    }
  } else return null;
  return nodes;
}
