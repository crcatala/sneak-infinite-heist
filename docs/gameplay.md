# Gameplay guide

Rules, controls and lobby settings for Sneak! Infinite Heist. The rules here are a summary; the game itself
has the full illustrated rules under **How to Play** (`/how-to-play`).

## How to play (short version)

The full, illustrated rules are in the game under **How to Play** (`/how-to-play`).

**Setup:** the detectives do this together, live, and the thief watches everything.

1. **Locks:** 6 open and 5 locked, shuffled face down onto the 11 plinths.
2. **Paintings:** 9 of them, at least one in each main gallery, never in corridors, the Power Room, or in front of a
   window or doorway.
3. **Cameras:** 6, numbered in the order they're placed.
4. **Detectives:** each takes a starting space.

**Turns:** the thief moves after *every* detective turn (T, D1, T, D2, T, D3…). In a 2-player game, one player runs
two detectives.

**The thief:**

- Enters for free through any window or door, then moves 1–3 spaces. Never twice onto the same space, never ending
  on a detective, but passing through anything.
- Ending on a painting steals it. While the thief is hidden, the painting leaves the wall only at the start of their
  next turn, which gives them a one-turn head start and protects them from capture meanwhile.
- Ending on a camera or the power switch can secretly disable it or cut the power.
- With enough paintings (3 by default), the thief may try the lock next to them. The flip is public: open means
  escape, locked means that exit is closed for good.

**The detectives** roll a movement die (1–6) and an action die (4 Eye / 1 Scan / 1 Motion). They move and act in
either order:

- **Eye:** look along your own sightlines (walls block, doorways don't). A yes reveals the thief and the chase
  begins. Or ask one camera for a yes or no. A disabled camera is found dead and removed.
- **Scan:** removes every dead camera, then lists the working cameras that see the thief.
- **Motion:** the thief tells you the floor colour they're on, or snips the wires (twice per round).
- **Power:** a cut power supply spends any camera, scan or motion attempt on discovering the cut. Ending on the
  switch restores it; if nobody had discovered the cut yet, the restore is silent.
- **Capture:** end a move on the thief's space. Passing through does nothing.

**Winning:**

- A single round is the default: escape with 3 or more paintings, or be captured.
- In a **full match**, everyone is the thief once. An escaped thief scores their paintings, a captured one scores 0,
  and the best haul wins.

## Controls

| Input | Action |
|---|---|
| Click or tap | Pick a space, plinth, piece or option |
| Right-click or long-press | Drop a pointer pin (detectives place them, everyone sees them; fades after 8 s, 3 per player) · remove a piece (setup) |
| Shift + right-click | Suspect mark (detectives). On touch, the Pin / Mark switch picks what a long-press drops |
| Drag · pinch · two fingers | Rotate · zoom · pan |
| <kbd>1</kbd> · <kbd>2</kbd>/<kbd>T</kbd> · <kbd>F</kbd> | Overview · top-down tactical · focus on my pawn |
| Arrows + <kbd>Enter</kbd> | Board cursor and select |
| <kbd>Space</kbd>/<kbd>Enter</kbd> | Roll · confirm · skip a cinematic (hold <kbd>Space</kbd> to fast-forward) |
| <kbd>E</kbd> · <kbd>Shift</kbd>+<kbd>1–6</kbd> · <kbd>S</kbd> · <kbd>M</kbd> · <kbd>X</kbd> | Eyes · camera # · Scan · Motion · skip action |
| <kbd>A</kbd> · <kbd>S</kbd> in the motion prompt | Answer · snip |
| <kbd>D</kbd> · <kbd>H</kbd> · <kbd>P</kbd> · <kbd>L</kbd> | Danger overlay · heat overlay · plotting pad · log |
| <kbd>Esc</kbd> | Undo the selection · pause menu |
| Menus | Arrows/WASD + <kbd>Enter</kbd>/<kbd>Esc</kbd>, mouse or touch |
| Gamepad | D-pad or stick to move · A select/confirm · B back · X roll/skip · Y focus · LB/RB camera · Start pause |

On phones in portrait, the board turns 90° (north on the right; the gold "N" on the plaza marks it) so the long side
runs up the screen.

## Reading the table

**Turn order.** The turn pill at the top lists the whole rotation as portraits, for everyone (thief and spectator
too). Whoever plays now is the large glowing face, the next turn has a dashed ring and a "next" tag, and the thief's
turns are the small charcoal faces between the detectives: the thief moves after *every* detective, so a game with
three detectives reads `thief › Cinnabar › thief › Dot › thief › Sage ↻`. "You" marks your own pawns. The chevron in
the pill's top right collapses it to a face, whose turn it is and the clock; the choice is remembered per browser.
On a short landscape screen (under 520px tall) the rotation is always hidden.

**Watching a detective decide.** Everything a detective has picked but not confirmed shows on everyone's board,
thief and spectator included. Hovering never does.

| When | Everyone else sees |
|---|---|
| The roll lands | A dashed outline, in the mover's colour, on every space they could end on |
| They pick a space | The filled tile, the route, a ghost pawn, the step count and an "Alex · 4 steps" tag |
| They pick an Eye target | The sightline of their own eyes or the camera, and "Alex · asking camera 3" |
| Setup: they lift a painting, camera or pawn | Its old space ringed in their colour, and "Alex is moving a painting" |

Lock setup is never shown, because the faces are hidden from the thief.

## The lobby

The lobby is a one-screen character select that sizes itself from the window height, so it fits anything from
1280×720 up to ultrawide without scrolling. The crew runs along the top, the detectives sit in a cover-flow carousel
(arrow keys, D-pad, swipe or the on-screen arrows to cycle, Enter or A to choose), and the thief selector and the
ready button run along the bottom. <kbd>R</kbd> or X toggles ready. The house rules open from one button, below.
First-time players get two hand-drawn arrows, one at the Choose button and one at the ready button. Each goes away for
good once that step has been done (kept in `localStorage` as `sneak:lobby-hints`).

## Lobby settings (host)

| Setting | Options (default first) | What it does |
|---|---|---|
| Game length | **Single round** · Full match | A match rotates the thief through every human; the best haul wins. |
| Who's the thief | **Random** · Volunteers · Host picks | Random includes bots. Volunteers pick at random among raised hands. |
| Paintings to escape | **3** (1–9) | Paintings needed before trying a lock. |
| Locks | **Shuffled** · Detectives place | When the detectives place the locks, they know which exits are open. |
| Stay put on a 1 | **Must move** · May stay | The original designers disagreed on this rule. |
| Turn timer | **Off** · 60 · 90 · 120 s | Out of time, a bot finishes the turn. Pauses while that player is offline. |
| Bot skill | **Pro** · Rookie | Rookie bots fumble about a third of their decisions. |
| Detective aids | Off · **Marks** · Marks + overlay | Team suspect marks, or marks plus the "where could the thief be" heat map. |
| Museum opens at dawn | **Off** · 20 · 30 · 40 turns | The detectives win if the thief is still inside by then. |
| Spectator | **Allowed** · Off | Lets one person watch without a seat (see below). Turning it off removes the current watcher. |

The action die is always 4 Eye / 1 Scan / 1 Motion.

## Watching

One person per room can watch without taking a seat: no avatar, no turns, and they never become the host. They join
with the host's **Copy watch link** (`/r/CODE?watch=1`), with **Watch instead** on the name prompt, with **Just watch**
when rejoining a game that has started, or automatically when they arrive at a full lobby of humans.

- **They see what the detectives see**: the board, the log, the "the thief moved" ticks and (with the overlay on) the
  where-could-they-be heat map. They never see the thief, the thief's moves or any other secret. They also don't get
  the team's suspect marks, or the lock faces when the detectives place the locks, because the thief isn't allowed
  to know those either.
- **They can look around and react.** The camera, the overlays and emotes work as usual. Pins, marks and every
  game action are for the players.
- **Everyone is told.** An eye chip in the top bar shows while someone is watching, with a toast when they arrive or
  leave, so the thief is never watched in secret.
- **They can come back.** Closing the tab or losing the connection keeps their place until someone else takes it:
  a new watcher can take the place of one who is disconnected, but not of one who is connected.
- **The host is in charge.** The host can remove the watcher at any time (the lobby chip, or the pause menu in a game),
  or switch spectators off in the house rules.

