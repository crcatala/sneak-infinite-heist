// A small paper minimap of a board layout (the lobby's museum preview).

import type { BoardDef } from "../../shared/board/model";
import type { GameView } from "../../shared/game/views";
import { PadMap } from "../hud/ThiefPad";

export function BoardPreview({ board }: { board: BoardDef }) {
  const game = {
    board,
    thief: { trail: [], stolen: [], entry: null },
    paintings: [],
    cameras: [],
    locks: board.slots.map((s) => ({ slot: s.id, revealed: false })),
    events: [],
  } as unknown as GameView;
  return (
    <div className="board-preview paper">
      <PadMap game={game} />
    </div>
  );
}
