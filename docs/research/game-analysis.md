# Sneak! Infinite Heist: Game Analysis (Rebuild Reference)

**Date:** 2026-09-28
**Purpose:** The single source of truth for a from-scratch rebuild. It covers the original game's mechanics, a
verified board encoding, rule ambiguities and the rulings to use for them, the hidden-information model, lessons
from an earlier prototype, and the online-room and deployment conventions.

**Sources analyzed**

The original rulebook, published clarifications and photos of the physical game were studied, but none of them are
included in this repo. Everything below is a paraphrase in this project's own words.

- A community quick-rules summary of the original game (BoardGameGeek)
- Rules clarifications from co-designer John LaBelle (paraphrased as "Clarif." in §5)
- Photos of a physical copy: board, pieces, dice and the thief's plotting pad
- The BoardGameGeek listing: the 11 locks are **6 OPEN + 5 LOCKED**
- An earlier prototype of this game (a separate, unpublished codebase). Its code was read only; nothing was run.
- An earlier multiplayer project by the same author, the reference for rooms and deployment (§9)

---

## 1. The game at a glance

- The inspiration is *Clue: The Great Museum Caper* (Parker Brothers / Waddingtons, 1991), designed by John
  LaBelle, Thomas Rabideau and Dave Rabideau. *Clue* is a trademark of Hasbro, Inc.; this project is unofficial and
  uses none of its names, characters, artwork or rules text. Asymmetric hidden-movement game for 2–4 players,
  about 30 minutes. One player is the **Thief**. Everyone else is a **Detective**, and the detectives play as a team.
- The Thief's position is **secret**. They move 1–3 spaces a turn, steal paintings, disable cameras, cut the power
  and try to escape through an **unlocked** door or window. They need at least 3 paintings to escape.
- The Detectives roll a **movement die** and an **action die** (Eye / Scan / Motion). They use their own line of
  sight, the numbered cameras and the motion detectors (room colour) to narrow down where the thief is. When a
  detective sees the thief directly, the thief is **revealed** and a **chase** begins. A detective who **ends a move on
  the thief's space** captures them.
- Same family as *Scotland Yard*, *Fury of Dracula* and *Letters from Whitechapel*: deduction from partial answers.
  The fun comes from the tension of hidden movement plus the "one-turn head start" on every theft.

---

## 2. Components of the physical game

| Component | Count | Notes |
|---|---|---|
| 3D plastic board | 1 | Grey plastic walls. Each gallery has its own marbled floor colour. A cobblestone plaza surrounds the building with 2 benches, a round pond/fountain (blue) and a round green ornament, and there are front stairs. Small square **plinths** outside every window and door hold the locks. |
| Paintings | 9 | Miniature framed prints on stands. This game's nine paintings are original designs with their own titles (`src/shared/characters.ts`) and don't imitate the physical game's prints. |
| Video cameras | 6 | Red **plus/cross-shaped** pieces (4 lobes, one per orthogonal view direction) with white number discs **1–6**, placed number side up. |
| Locks | 11 | White plastic padlocks placed face down on the plinths. The sticker underneath says **"O"** (silver = open) or **"L"** (red = locked). 6 O + 5 L. |
| Pawns | 7 | White, purple, blue, green, red and yellow (one per detective) plus a **dark grey/black thief** pawn, which goes on the board only once the thief is revealed. |
| Movement die | 1 | Black d6 with white numerals 1–6. |
| Action die | 1 | White d6 with **4 eye faces, 1 camera-"S" face (scan) and 1 "M" face (motion)**. The author confirmed these counts from the physical die. |
| Thief plotting pad + shield | 1 | A printed top-down map of the museum grid with the P room, lock squares outside the windows and doors, and striped steps at the side doors. At the bottom are **two "M" icons with wire cutters** (the motion-detector snips) and **camera icons 1–6** (for crossing out disabled cameras). |

**Orientation:** the canonical orientation in §3 matches the thief's plotting pad: red gallery at the top (north),
front stairs at the bottom (south), and the power room at the bottom right.

---

## 3. Board (canonical, verified)

The board was cross-checked three ways: the earlier prototype's hand-built board data, the thief plotting
pad (cell by cell) and photos of the physical board. Everything matched: room sizes, the 14 room openings and the
11 lock slots.

### 3.1 Map

Coordinates are `[x, y]`, with x as the column (0–13, west to east) and y as the row (0–11, north to south). 14 × 12.

```
BOARD = [            //  x: 0123456789abcd   (a=10 b=11 c=12 d=13)
  ".....a..b.....",  // y0
  "....RRRRRR....",  // y1
  "....RRRRRR.c..",  // y2
  ".UUUCCCCCCBBB.",  // y3
  "kUUUCWWWWCBBB.",  // y4
  ".UUUCWWWWCCCd.",  // y5
  ".jCCCWWWWCGGG.",  // y6
  ".YYYCWWWWCGGG.",  // y7
  "iYYYCWWWWCGGGe",  // y8
  ".YYYCCCCCCGGG.",  // y9
  "..h.SSCCXX....",  // y10
  "....SSgfXP....",  // y11
]
```

Legend:

| Char | Region | Floor colour (motion-detector answer) | Cells | Paintings allowed? |
|---|---|---|---|---|
| `R` | Red Gallery (north, 6×2) | red | 12 | yes (main room) |
| `U` | Purple Gallery (NW, 3×3) | purple | 9 | yes (main room) |
| `B` | Blue Gallery (NE, 3×2) | blue | 6 | yes (main room) |
| `Y` | Gold/Yellow Gallery (SW, 3×3) | yellow | 9 | yes (main room) |
| `G` | Green Gallery (SE, 3×4) | green | 12 | yes (main room) |
| `W` | White marble Atrium/Courtyard (centre, 4×5) | white | 20 | yes (main room) |
| `C` | Corridor ring, side stubs and front vestibule | grey | 28 | **no** |
| `S` | Small grey room (storeroom), 2×2 | grey | 4 | yes (optional, not a "main room") |
| `X` | Power Room, 2×2 | grey | 3 | **no** |
| `P` | Power switch cell (part of the Power Room) | grey | 1 | **no** |
| `a`–`k` | Lock/entry slots (plinths). **Not walkable** | — | 11 | — |
| `.` | Outside / void | — | — | — |

There are **104 walkable cells**. The six **main rooms** that each need at least one painting are `R U B Y G W`.

### 3.2 Walls and openings

- Two orthogonally adjacent walkable cells have **no wall** between them if they're in the same region (`P` counts
  as region `X`).
- Two walkable cells in **different regions** have a **wall** between them unless the pair appears in `OPENINGS`.
- Walls separate every walkable cell from void cells and slot cells, except for each slot's single entry edge
  (§3.3).
- Nothing else blocks line of sight or movement. Pawns, paintings and cameras never block.

```
OPENINGS = [ // 14 doorways between regions
  [[5,2],[5,3]], [[8,2],[8,3]],                // Red ↔ corridor (2)
  [[6,3],[6,4]], [[7,3],[7,4]],                // corridor ↔ White, north side (2)
  [[6,8],[6,9]], [[7,8],[7,9]],                // White ↔ corridor, south side (2)
  [[4,7],[5,7]], [[8,6],[9,6]],                // White west / east (1 each)
  [[3,5],[4,5]],                               // Purple ↔ corridor
  [[9,4],[10,4]],                              // corridor ↔ Blue
  [[3,8],[4,8]],                               // Gold ↔ corridor
  [[9,8],[10,8]],                              // corridor ↔ Green
  [[5,9],[5,10]],                              // corridor ↔ small grey room
  [[9,9],[9,10]],                              // corridor ↔ Power Room
]
```

### 3.3 Lock / entry slots (11: 7 windows, 4 doors)

Each slot has exactly one **inside cell**. The thief enters there, and that's where they stand to try the lock.

| Slot | Slot cell | Kind | Inside cell (region) | Notes |
|---|---|---|---|---|
| a | [5,0] | window | [5,1] R | north wall of Red |
| b | [8,0] | window | [8,1] R | north wall of Red |
| c | [11,2] | window | [11,3] B | north wall of Blue |
| d | [12,5] | door | [11,5] C | east side door (end of corridor stub) |
| e | [13,8] | window | [12,8] G | east wall of Green |
| f | [7,11] | door | [7,10] C | front door (right), stairs outside |
| g | [6,11] | door | [6,10] C | front door (left), stairs outside |
| h | [2,10] | window | [2,9] Y | south wall of Gold |
| i | [0,8] | window | [1,8] Y | west wall of Gold |
| j | [1,6] | door | [2,6] C | west side door (end of corridor stub) |
| k | [0,4] | window | [1,4] U | west wall of Purple |

On the physical board the four door plinths sit inside the building's outline (in the side stubs and the front
vestibule), while window plinths sit outside the wall. This only matters for how the board is drawn.

### 3.4 ASCII render (for eyeballing; `|`/`---` = wall, `~` = entry edge)

```
      0   1   2   3   4   5   6   7   8   9  10  11  12  13
  0                        a           b
     +   +   +   +   +---+ ~ +---+---+ ~ +---+   +   +   +   +
  1                  | R   R   R   R   R   R |
     +   +   +   +   +   +   +   +   +   +   +   +   +   +   +
  2                  | R   R   R   R   R   R |     c
     +   +---+---+---+---+   +---+---+   +---+---+ ~ +---+   +
  3      | U   U   U | C   C   C   C   C   C | B   B   B |
     +   +   +   +   +   +---+   +   +---+   +   +   +   +   +
  4    k ~ U   U   U | C | W   W   W   W | C   B   B   B |
     +   +   +   +   +   +   +   +   +   +   +---+---+---+   +
  5      | U   U   U   C | W   W   W   W | C   C   C ~ d
     +   +---+---+---+   +   +   +   +   +   +---+---+---+   +
  6        j ~ C   C   C | W   W   W   W   C | G   G   G |
     +   +---+---+---+   +   +   +   +   +   +   +   +   +   +
  7      | Y   Y   Y | C   W   W   W   W | C | G   G   G |
     +   +   +   +   +   +   +   +   +   +   +   +   +   +   +
  8    i ~ Y   Y   Y   C | W   W   W   W | C   G   G   G ~ e
     +   +   +   +   +   +---+   +   +---+   +   +   +   +   +
  9      | Y   Y   Y | C   C   C   C   C   C | G   G   G |
     +   +---+ ~ +---+---+   +   +   +---+   +---+---+---+   +
 10            h     | S   S | C   C | X   X |
     +   +   +   +   +   +   + ~ + ~ +   +   +   +   +   +   +
 11                  | S   S | g   f | X   P |
     +   +   +   +   +---+---+   +   +---+---+   +   +   +   +
```

### 3.5 Derived facts worth knowing

- The corridor forms a ring around the White atrium (x=4 and x=9 columns, y=3 and y=9 rows). Stubs lead to the
  side doors `d` (y=5) and `j` (y=6), and the vestibule `[6..7,10]` leads to the front doors `f`/`g`.
- The White atrium has 6 doorways, so long **sightlines run through it**. For example, a pawn at [6,3] sees all the
  way down x=6 to [6,10], because doorways don't block line of sight.
- **Painting-forbidden cells ("in front of a window or doorway")**, using the ruling in §5:
  - window inside cells: [5,1] [8,1] [11,3] [12,8] [2,9] [1,8] [1,4]
  - the room side of each doorway: [5,2] [8,2] [6,4] [7,4] [6,8] [7,8] [5,7] [8,6] [3,5] [10,4] [3,8] [10,8] [5,10]
  - Cells still eligible per room: R 8, U 7, B 4, Y 6, G 10, W 14, S 3 (52 total).
- Every lock slot has one inside cell and no cell touches two slots, so **trying a lock pins the thief to one exact
  cell**.

---

## 4. Rules: a normalized spec for implementation

The designer's clarifications override the quick rules. Where the rules are silent, the ruling comes from §5 and is marked (R#).

### 4.1 Setup (per round)

1. **Roles.** One player is the Thief and the rest are Detectives. Seats and pawns:
   - 2 players: 1 thief and 1 human controlling **2 detective pawns**, taking separate turns with each.
   - 3 players: 1 thief and 2 detectives.
   - 4 players: 1 thief and 3 detectives.
   - The original has 6 detective colours available, so bots can fill seats.
2. **Locks.** Shuffle 6 Open + 5 Locked face down onto the 11 slots at random. *Variant:* the detectives choose where
   each lock goes, in which case they know the faces (R7).
3. **Paintings (9)**, placed by the detectives:
   - Only in rooms `R U B Y G W S`. Never in the corridor (`C`) or the Power Room (`X`/`P`).
   - Every main room (`R U B Y G W`) gets **at least 1**.
   - Never on a forbidden "in front of" cell (§3.5).
   - One per cell.
4. **Cameras (6, numbered 1–6)**, placed by the detectives on any walkable cell without a painting. Corridors and
   cells next to doors and windows are allowed. One per cell, and never on `P` (R8).
5. **Detective pawns** go on any walkable cell without a painting or another detective. Cameras and `P` are fine.
6. **The thief records** painting and camera positions. Digitally this happens automatically: the thief sees
   everything placed during setup.
7. The Thief moves first.

### 4.2 Turn order

`T, D1, T, D2, T, D3, T, D1, …` The thief takes a turn **after every detective turn**, so with three detectives the
thief moves three times as often as any one of them. In a 2-player game it runs `T, D1, T, D2, …` with the same human
controlling both D1 and D2.

### 4.3 Thief turn

1. **Start of turn.** If a painting was marked last turn while hidden, remove it from the board now, publicly
   (the one-turn delay).
2. **First turn only:** choose any entry slot and record `E`. Entering is free. The thief starts on that slot's
   inside cell and then moves.
3. **Move 1, 2 or 3 spaces**, orthogonally, through openings only.
   - A space can't be visited twice in one turn, and that includes the starting cell, so the thief **must** end
     somewhere different.
   - The thief may **pass through** detectives, paintings and cameras.
   - The thief may **not end** on a detective's space.
   - Hidden: the move is secret (the plotting pad). Revealed: the move is public.
4. **Resolve the end space**, in this order:
   - **Painting:** it's **stolen, and this is mandatory**. Hidden: mark it privately, and it comes off the board at
     the start of the thief's next turn. Revealed: remove it immediately.
   - **Camera:** the thief **may** disable it. That's secret, and the camera stays on the board until the detectives
     discover it.
   - **`P`:** the thief **may** cut the power. That's secret until discovered (§4.5). Cutting it again after a
     restore is allowed.
   - **Inside cell of a slot whose lock isn't already known to be Locked:** if the thief holds ≥ `minPaintingsToEscape`
     (default 3), they **may attempt an escape**.
     - The lock is flipped **openly, even while hidden**, and the thief's position becomes public knowledge (R4).
     - **Open:** the thief escapes and wins the round.
     - **Locked:** the lock stays face up. It stays unusable and the thief stays hidden (the pawn isn't placed).
   - A camera can sit on a slot's inside cell, so disabling a camera and attempting an escape can both happen in one
     turn. Paintings are never on those cells.

### 4.4 Detective turn

1. **Roll both dice.** The movement die `N ∈ 1..6` and the action die `A ∈ {Eye, Scan, Motion}`, with faces
   4 Eye / 1 Scan / 1 Motion, so P(Eye) = 4/6.
2. **Move and act in either order:** move then act, or act then move. The action is optional.
3. **Movement:**
   - Up to `N` steps, orthogonally, through openings only.
   - **Backtracking is allowed.**
   - The detective may **pass through** anything. Passing over the hidden thief does nothing and reveals nothing.
   - The detective may **not end** on a painting or on another detective. Ending on a camera or on `P` is fine.
   - **Legal ends:** every cell at BFS distance 1..N, plus the start cell if `N ≥ 2` (step out and back) or if the
     zero-move house rule is on (R5).
   - **Ending on the thief's cell (hidden or revealed) captures the thief** and the detectives win the round.
   - **Ending on `P` restores the power** if it's cut (R6).
4. **Actions:**
   - **Eye:** choose one of:
     - **My eyes:** "Can I see you?" This checks line of sight from *this* detective (§4.6).
       - Yes: the **thief is revealed**. Their pawn goes on the board and the chase begins. If the thief is standing
         on a marked painting, remove it now (R3).
       - No: nothing happens.
     - **Camera #k** (a camera still on the board):
       - Power cut: the cut is **discovered** (public) and the action is spent.
       - Camera k disabled: "not working", and the camera is **removed** (public).
       - Otherwise: "Can camera k see you?" gets a public **yes/no**. Camera sightings **never reveal** the thief.
   - **Scan (the "S" camera):**
     - Power cut: discovered, and the action is spent.
     - Otherwise, all disabled cameras are **removed** (public), then the game reports **which working cameras see the
       thief** (public list, possibly empty).
   - **Motion (M):**
     - Power cut: discovered, and the action is spent.
     - Otherwise the thief **either** reports the floor colour they stand on (red/purple/blue/yellow/green/white/grey)
       **or snips** the detectors. The thief has **2 snips per round**. Snip use is public, and the thief decides only
       when asked.

### 4.5 Power

- The thief cuts the power by ending on `P` and choosing to. From then on, **all cameras and motion detectors are
  off**.
- The cut is **secret** until a detective tries a camera, a scan or motion. The attempt announces "the power is out"
  and spends the action.
- A detective **ending on `P` turns the power back on**. Cameras the thief disabled individually **stay disabled**.
- Eyes always work, power or no power.

### 4.6 Line of sight (cameras and detectives' eyes)

- Sight runs **orthogonally only**: straight north, south, east and west from the viewer's cell, never diagonally.
- It stops at the **first wall**. Doorways don't block it, and neither do pawns, paintings or cameras.
- The viewer's **own cell** is included. That matters for cameras: a camera sees the thief standing on it, if the
  camera still works. It doesn't matter for detectives, since a detective and the thief can't share a cell except
  on capture.

### 4.7 Reveal, chase, escape, capture

- **Revealed** (only ever by a detective's own eyes):
  - The thief's pawn is placed and stays visible for the rest of the round.
  - Every thief move from then on is public, and paintings are removed as soon as the thief lands on them.
  - The thief still moves 1–3, still passes through pawns and still rolls no dice.
- **Capture:** a detective ends a move on the thief's cell, whether the thief is hidden or revealed. Detectives win
  the round.
- **Escape:** see §4.3. The thief doesn't have to be revealed first.

### 4.8 Winning and scoring

- **Single round (default):**
  - The thief wins by escaping with ≥3 paintings. Paintings marked but still pending count.
  - The detectives win by capturing the thief.
- **Full match:** every player plays the thief once.
  - Round score = paintings stolen if the thief escaped, **0 if captured**.
  - The player with the highest thief score wins.
- **Optional house rule** (not in the original): a turn limit, such as "the museum opens at dawn" after N thief
  turns, where running out counts as a detective win. It guards against stalling.

### 4.9 Emergent consequences (engine must produce these naturally; UI should surface them)

- **Stealing buys a turn of safety.** While hidden, the marked painting stays on the thief's cell until their next
  turn. Detectives can't end on painting cells, so a thief standing on a fresh theft **can't be captured that turn**.
  Detectives learn where the thief *was* one turn later, when the painting disappears.
- **Negative answers carry information.** "No", a colour, a list of cameras, a detective ending on a cell without a
  capture, a removed painting, a discovered disabled camera, a discovered power cut and a flipped lock each prune
  the set of cells the thief could be on. That's the deduction core of the game.
- **The thief's information edge.** The thief knows every detective position, every camera and which cameras are
  dead, so they can compute exactly which cells are "hot". Displaying that for them is fair.
- **Why cut the power.** It kills Scan, Motion and camera checks until someone walks to `P`, which pulls a detective
  toward the south-east corner.

---

## 5. Ambiguities and the rulings to use

Wherever a ruling is a matter of taste, expose it as a lobby house-rule setting.

| # | Question | Sources | Ruling (default) | Setting? |
|---|---|---|---|---|
| R1 | Does entering cost movement? | Clarif.: no | Start on the inside cell, then move 1–3 | no |
| R2 | May the thief stay put or end on its start cell? | Clarif.: no | Thief must end on a new cell | no |
| R3 | Thief revealed while standing on a marked (pending) painting? | silent | Remove the painting immediately on reveal (revealed ⇒ no delay) | no |
| R4 | Does a failed lock flip reveal the thief? | Clarif.: the flip is open even when hidden | The lock is public and the thief's cell is publicly known ("last seen" marker), but the pawn isn't placed and the thief stays hidden next turn | no |
| R5 | May a detective move 0? | Designers disagree | Default: **not** allowed. This only matters when rolling a 1. | `detectiveMayStay` |
| R6 | Detective ends on `P` while the power cut is undiscovered | silent (the earlier prototype required discovery first) | Restore silently. The thief is told privately and the detectives learn nothing. No information leaks. | no |
| R7 | Lock placement | Rules: random; variant: detectives choose | Random 6 O / 5 L | `lockPlacement: random \| detectives` |
| R8 | Camera on `P`? | silent | Not allowed (avoids a confusing double action) | no |
| R9 | "In front of a window or doorway" | Rules + clarif. | The window inside cell **and** the room-side cell of every doorway (§3.5). The earlier prototype only blocked window/door inside cells. | no |
| R10 | Paintings in the small grey room `S`? | Clarif.: allowed | Allowed. The earlier prototype wrongly disallowed it. | no |
| R11 | Escape attempt with fewer than the minimum paintings? | "should have a minimum of three before escaping" | Not offered unless the thief holds ≥ `minPaintingsToEscape` | `minPaintingsToEscape` (default 3) |
| R12 | Minimum paintings in full-match mode | Rules only say 3 for the short game | Use the same setting (default 3) | same |
| R13 | Action die faces | The rulebook doesn't say. **The author confirmed them from the physical die.** | 4 Eye / 1 Scan / 1 Motion, as a fixed constant | no |
| R14 | Thief escaping through the slot they entered by | silent | Allowed if that lock is Open | no |
| R15 | Must the thief flip a lock after ending next to an exit? | "must turn over the lock" | Optional (the thief chooses "Try the lock") | no |
| R16 | Is the detectives' action optional? | implied | Optional (Skip) | no |
| R17 | Answering questions honestly | Physical: the thief self-reports | The **server answers automatically**. The thief's only live decision is the motion-detector snip (§7). | no |
| R18 | Does a camera flagged in a Scan reveal the thief? | Rules: no | A public list of cameras, no reveal | no |

---

## 6. Information model (who knows what)

This is critical for a digital build. The server alone holds the full state, and each client gets a **per-viewer
projection**.

| Info | Thief | Detectives | Public/all |
|---|---|---|---|
| Board, detective positions, dice rolls, action results | ✓ | ✓ | ✓ |
| Painting and camera positions still on the board | ✓ | ✓ | ✓ |
| Thief position and path (hidden phase) | ✓ | ✗ | ✗ |
| Thief entry slot | ✓ | ✗ | ✗ (revealed at round end) |
| Marked but not yet removed painting | ✓ | ✗ | ✗ |
| Which cameras the thief disabled (undiscovered) | ✓ | ✗ | ✗ |
| Power cut (undiscovered) | ✓ | ✗ | ✗ |
| Lock faces (random placement) | ✗ | ✗ | revealed per flip |
| Lock faces (detectives-choose variant) | ✗ | ✓ | revealed per flip |
| Snips remaining | ✓ | ✓ | ✓ (announced when used) |
| Detective team notes and suspect marks | ✗ | ✓ | ✗ |
| Full thief path replay | — | — | ✓ **after the round ends** |

**Leak vectors to guard against:**

- Broadcasting full state.
- Sending the log unfiltered.
- Positional audio or animation for hidden thief moves.
- Thief-only prompts that stall the turn visibly. Camera and power choices must be made in the move-confirm UI, so
  the thief's turn has the same shape every time.
- Pathfinding round-trips.
- Timing differences in bot thinking.

---

## 7. Digital adaptation notes

- **The server is the referee.** It rolls dice, resolves line of sight, answers every question and enforces every
  rule. Thieves can't lie, and nobody has to track a paper pad.
- **Live thief decisions:**
  - At the end of each move: disable a camera or cut the power, both optional.
  - When a lock is available: "Try the lock?"
  - During a detective's Motion action: snip or answer. This **blocks the detective's turn** until the thief
    responds. Give it a short countdown, and default to *answer* if the thief is disconnected or times out.
- **Thief HUD ("plotting pad"):**
  - A secret trail with the E mark, per-turn dots and lines, X marks on paintings (circled when stolen) and the
    camera icons 1–6 (crossed out when disabled).
  - The M ×2 snips with wire cutters, and the power state.
  - An optional **danger overlay** showing cells currently in any detective's or working camera's line of sight.
- **Detective aids:**
  - Shared team marks and pings.
  - An optional **"possible thief locations" overlay**, computed **only from public events**: expand 1–3 steps per
    thief turn, then prune on every answer. It could also drive the bot detectives.
  - Host setting: `off | marks only | auto overlay`.
- **After-round reveal:** replay the thief's full secret path on the board. This is a big payoff moment that the
  physical game can't offer.
- **Bots:**
  - Detective bots use the public possible-set, chase the densest region and pick the action with the best expected
    information.
  - Thief bots take paths that minimise exposure to line of sight and weigh painting value against escape distance.
  - The simulation tests need random legal-move bots.

---

## 8. Earlier prototype inventory (~28k LOC, code-only review)

File names in this section refer to the prototype's code, which isn't published.

**Stack:**

- Bun server with Bun WebSockets.
- Drizzle ORM and SQLite (a JSON blob per game).
- Fly.io and Docker.
- Client: React 18, TanStack Router, Zustand, Tailwind 4, GSAP and Radix.
- R3F v8: only a demo cube and a camera-demo route. **The game board itself is a 2D HTML/CSS grid.**
- `socket.io-client` is a dependency but unused.

### 8.1 Features that exist

| Area | What exists | Worth porting? |
|---|---|---|
| Board data | `gmcClassicBoardTilesOnly.ts` (a 2,672-line tile/edge config), verified accurate | **Yes, as data**: re-encoded compactly in §3 |
| "Infinite" board remix | `GMCBoardGenerator` with a seeded RNG (LCG), board validator, and options: gallery colours, window/door placement, room openings, security-room location, power-switch location, utility-room swap, painting/camera count, unlock %. Plus a `/tools/board-generator` page. | **Concept yes, code no.** Build it later as a seeded generator over the §3 data format, with a validator (connectivity, slot inside cells, rooms reachable). |
| Lobby | 4-char room codes, host, ready toggles, host transfer on leave, rejoin by playerId, stale game expiry (2h), username validation, duplicate-name check, copy-code button, board-settings modal (seed + randomization toggles), rate limit of 20 msg/s | Replace with the patterns in §9 |
| Setup phases | Collaborative real-time painting and camera placement shared by all detectives, an **auto-generate** (random valid) button, remove-all, detective pawn placement, thief entry placement with privacy | **UX yes**: collaborative placement plus auto-place |
| Turn engine | Thief first turn, 1–3 move, dice (4/1/1), detective move, valid-move highlighting, end turn | Rebuild |
| Thief actions | Steal with the 1-turn delay (`isPendingTheft`), disable camera, cut power, attempt escape, motion refusals (max 2) | Rebuild |
| Detection | Eyes line of sight, check camera, scan, motion detector with a thief-response modal and a detective waiting modal, power-cut discovery, restore power | Rebuild |
| Chase | Chase phase banner with the thief pawn visible | Rebuild with a much stronger presentation |
| Notifications | Toasts: painting stolen, power cut discovered, power restored, disabled cameras found, escape attempt (5s auto-fade) | **Event list yes** |
| Game log | `TurnRecord` history with `isSecret` and `revealedAt`, privacy-filtered per viewer | **Concept yes** |
| Overlays | Camera coverage overlay on the board, line-of-sight util (client and server copies) | Yes, as engine functions |
| Camera system | Isometric and top-down camera presets with eased transitions and keyboard controls (`/tools/camera-demo`) | Idea only |
| Debug | Hidden debug menu (click the logo 5×), dockable panel (bottom/left/right) with a state inspector, WebSocket monitor, player management and game-log preview | Replace with the backtick debug console (§9), plus game-specific commands |
| Branding | Name "**Sneak! Infinite Heist** – A Museum Mystery". Logo `src/client/assets/menu-hud/game-logo-full.png`. 10 key-art backgrounds (Pixar-like night museum, detectives and a shadowy thief). Asset-button PNGs. A "Victorian steampunk museum" palette with the fonts Cinzel and Merriweather (`docs/menu-ui-design-system.md`) | **Only the name.** The logo, key art, palette and fonts are **not** carried over, so the rebuild can create its own visual identity (decision in §10). |
| SVG assets | Tile SVGs (gallery marbles, corridor, power room) and pawn/camera/painting SVGs | No (crude) |
| Tests | Many unit tests (services, schemas, board, line of sight, pathfinding) | Rules test *cases* are worth mirroring |

### 8.2 Old rule deviations and gaps (don't repeat these)

- Locks were random at a 50% unlock rate, not 6 Open / 5 Locked.
- Paintings weren't allowed in the small grey room, but the rules allow them there.
- "In front of" only covered window and door inside cells, not room doorways.
- Player colours were limited to grey/red/blue/yellow, and there was no 2-player "one human controls two
  detectives" mode.
- Cameras had an optional `facing` field. That isn't in the rules: cameras see in all four directions.
- Restoring the power required discovering the cut first (see R6).
- The first lobby player was always the thief. There was no role choice and no thief rotation or match scoring.
- There were no bots, no solo mode and no end-of-round path reveal.

---

## 9. Online-room and deployment conventions

Toolchain: **npm**, Vite 8, React 19, R3F 9,
drei 10, three 0.186, zustand 5, zod 4, vitest 5, wrangler 4 and `@cloudflare/vite-plugin`.

- **One Worker serves everything.** Static assets use `not_found_handling: single-page-application` and
  `run_worker_first: ["/api/*"]`.
  - `POST /api/rooms` creates a room and needs an invite key.
  - `GET /api/invite` returns invite info and "My rooms".
  - `DELETE /api/invite/rooms/:code` deletes one of the invite's rooms.
  - `GET /api/rooms/:code/info` checks that a room exists.
  - `GET /api/rooms/:code/ws` opens the websocket.
  - `/api/health` is the health check.
- **One Durable Object per room** (`RoomDurableObject`, SQLite-backed, `idFromName(code)`).
  - It's a thin shell around a **pure `Room` engine in `src/shared/room.ts`** that the tests drive directly.
  - It uses the hibernating websocket API with socket attachments `{playerId, sid, since, stale}`.
  - `setWebSocketAutoResponse("ping","pong")` answers heartbeats without waking the room.
  - A stale-socket sweep runs from an alarm (90s stale, 60s sweep).
  - Alarms handle timers and are only rewritten when the deadline changes, with a backoff if one gets stuck.
  - State is saved after every change and broadcast as a **per-player view** (`viewFor(playerId)`).
- **Signed room codes** (`shared/roomCode.ts`):
  - 5 random characters plus 2 HMAC check characters from `ROOM_CODE_SECRET`.
  - The alphabet leaves out 0/O/1/I/L.
  - The Worker rejects forged codes without waking a Durable Object.
- **Invites** (`InviteDurableObject`, `shared/invites.ts`):
  - Hosting needs an invite key from the `INVITE_CODES` secret (`label:key` pairs), sent as `?invite=` magic links.
  - Quotas: 10 rooms per 24h and 25 saved rooms.
  - A "My rooms" ledger, which rooms keep updated with summaries.
  - Lazy 90-day idle expiry, with no alarms.
  - Joining a room only needs the link.
- **Kill switch:** `ONLINE_ENABLED=false`.
- **Secrets** go in `.dev.vars` locally, created from `.dev.vars.example` by `scripts/ensure-dev-vars.mjs`.
- **Protocol** (`shared/protocol.ts`):
  - Client messages are a zod discriminated union on `t`, validated server-side.
  - Server messages: `welcome` (pid and secret), `claim` (seat picker), `closed`, `state` (full `RoomView`),
    `error` and `pong`.
  - Close codes in the 4xxx range are final: `refused 4403`, `notFound 4404`, `claim 4409`, `deleted 4410` and
    `offline 4503`.
- **Client:**
  - `net.ts` handles websocket reconnects with exponential backoff up to 8s, a 10s heartbeat with pong timeout, and
    a queue for messages sent while offline.
  - `identity.ts` stores the per-room `{pid, secret}` in localStorage, and `?as=2` gives each tab its own identity
    for multi-tab testing.
  - `router.ts` is a tiny router: `/`, `/solo`, `/r/CODE`.
  - `presence.ts` shows "X left / X is back" toasts.
  - `sfx.ts` synthesizes WebAudio SFX with a persisted mute.
  - `store.ts` is a single zustand store.
- **Seat reclaim:** joining a started game without your secret offers the seats nobody is using ("I'm Alice"). It's
  trust-based.
- **Solo mode** (`client/local.ts`) runs the **same `Room` engine in the tab**, with `setTimeout` standing in for
  alarms and nothing persisted. Screens can't tell the difference.
- **Debug console:**
  - Toggled with the backtick key.
  - Phase jumps, "skip to…", slow-motion animations and a state viewer.
  - `?as=` seat links.
  - Server-side `debug` commands.
- **CI:** GitHub Actions on Node 24 running `npm ci`, typecheck, `vitest run` and build. Tests live in `tests/*.test.ts`
  and run in a node environment.
- **Architecture rule:** `src/shared` is pure TypeScript with no DOM or Workers APIs, and everything is unit tested.

---

## 10. Decisions (resolved 2026-09-28)

| # | Question | Decision |
|---|---|---|
| 1 | Action die faces | **4 Eye / 1 Scan / 1 Motion**, confirmed from the physical die. A fixed constant, not a setting. |
| 2 | Name and branding | Keep the name **"Sneak! Infinite Heist"**. **Don't port** the old logo, key art, palette or fonts. The rebuild designs its own visual identity, including a console-style title screen and menus. |
| 3 | IP | Use original detective characters and names. No Clue/Hasbro names, characters, logo, board art or painting designs. The classic grid geometry and mechanics are fine. |
| 4 | Package manager | **npm**. |
| 5 | Default game mode | **Single round.** A full match (rotating thief, highest score wins) is available as a lobby setting. |
| 6 | Board remix ("Infinite") | **After v1**, as the first stretch goal. The v1 engine must be data-driven, so a remix board is just data. |
| 7 | Hosting gate | **Invite-only hosting** (§9). Joining only needs the link. |
