# Sneak! Infinite Heist — build plan

A browser adaptation of a 1991 hidden-movement museum-heist board game: one secret Thief versus a team of
Detectives. The source of truth for rules is `docs/research/game-analysis.md` (§3 board, §4 rules, §5 rulings, §6
information model). Toolchain, rooms and deployment follow the conventions in its §9.

## Key decisions

- **One Worker, one room per Durable Object.** One Worker (static assets + `/api/*` + websockets), one `RoomDurableObject` per
  room around a pure `Room` engine, one `InviteDurableObject` per invite label, signed 7-character room codes, the
  `ONLINE_ENABLED` kill switch, `.dev.vars` bootstrapped from `.dev.vars.example`. Solo mode runs the same `Room`
  in the tab (`client/local.ts`).
- **Cells are integers** (`y * width + x`) everywhere in state, protocol and views. Helpers convert to `[x, y]`.
  The board is data (`BoardDef`: rows + openings + slots), so a remixed board is just another `BoardDef`.
- **The game engine is a pure reducer**: `apply(state, actor, action) → { state, events }`. The seeded RNG state
  (mulberry32 seed word) lives inside `GameState`, so dice, lock shuffles, auto-place and bots are replayable.
- **Events carry visibility** (`all | thief | detectives`) and a sequence number. Views include the viewer's
  filtered event log; the client animates events newer than the last one it played. One mechanism drives the
  log, animations, toasts and SFX.
- **Leak proof by indistinguishability.** Besides string/structure checks, the fuzz test scrambles every secret in
  the state (thief cell, path, entry, pending painting, disabled cameras, undiscovered cut, unrevealed lock faces,
  thief-only events) and asserts that the detectives' view is byte-identical before and after.
- **The thief turn is one atomic message**, `thiefTurn {entry?, dest, path?, disableCamera?, cutPower?, tryLock?}`.
  Detectives only ever see `thiefMoved`.
- **Pending paintings are removed at the start of the thief's next turn**, i.e. the moment the detective turn ends
  (before the thief acts). Same information as the rules, shown sooner.
- **Bot think time** is drawn from a fixed range with the room's RNG, never from hidden state. Bots act through the
  same alarm/`tick()` path as timers, so online and solo behave the same.
- **Debug cheats** (peek at the thief, "view as") need `deps.cheats`: on in solo mode and when the Worker has
  `DEV_CHEATS="true"` (only in `.dev.vars`). Other debug commands online are host-only.
- **Bloom without a new dependency**: `three/examples/jsm` `EffectComposer` + `UnrealBloomPass`, only on the
  "High" graphics preset. Everything else uses emissive materials and additive glow sprites.
- **Fonts** come from Google Fonts, with `display=swap` so the title is interactive at once.

## Dependencies

Nothing beyond these:

| Package | Why |
|---|---|
| react, react-dom 19 | UI |
| three, @react-three/fiber 9, @react-three/drei 10 | 3D museum diorama, title scene, dice (drei: `OrbitControls`/`CameraControls`, `Text`, `RoundedBox`, `ContactShadows`) |
| zustand 5 | Single client store |
| zod 4 | Validating client messages in the Durable Object |
| vite, @vitejs/plugin-react, @cloudflare/vite-plugin, wrangler 4 | Build, dev server with local workerd, deploy |
| vitest, typescript, @types/*, @cloudflare/workers-types | Tests and types |

No router library (a tiny hand-rolled router), no physics (dice land on server-decided faces), no
post-processing package (three's own jsm passes), no UI kit.

## Milestones

- M0 scaffold · M1 engine + tests + leak fuzz · M2 STYLE.md, rooms, protocol, DO, invites, solo transport, first
  title/menu/lobby · M3 playable end to end · M4 polish · M5 smart bots · M6 replay, how-to-play, README ·
  stretch: board remix generator, spectators, emotes.

## Decisions (rules questions not covered by analysis §5)

| # | Question | Decision |
|---|---|---|
| D1 | May the thief *enter* through a slot whose inside cell holds a detective? | Yes. Entering is not ending a move; the thief passes through and must end elsewhere. |
| D2 | A detective has no legal destination (e.g. rolled 1 and boxed in by paintings/detectives). | The move is skipped automatically with a public "boxed in" event; the action can still be used. |
| D3 | Motion detector when the thief has 0 snips left. | Answered immediately by the server; no prompt (the snip count is public, so waiting would hide nothing). |
| D4 | Motion response deadline. | 20 s countdown, always running (even if the thief is offline); expiry answers without snipping. |
| D5 | "Museum opens at dawn" limit. | Setting `dawnAfterThiefTurns` (off / 20 / 30 / 40). When the thief would start a turn after that many, the round ends as a detective win. |
| D6 | Can detectives use Eye → camera / Scan / Motion once they already know the power is out? | Allowed but pointless: it reports "the power is out" again and spends the action. The UI greys these out. |
| D7 | `endTurn` before moving. | Not allowed (movement is mandatory unless boxed in). After moving, `endTurn` skips the action. |
| D8 | Painting/camera setup ordering. | Paintings take the lowest unused artwork; cameras take the lowest free number 1–6, so moving a camera keeps its number and removing one frees it. |
| D9 | "Random" thief selection. | Random among all seats (bots included). Full-match mode rotates the thief through every human once, starting with the selected thief. |
| D10 | Setup readiness. | A setup phase advances when every *human* detective controller is ready and the placement is valid. Bot-only detective teams auto-place after think time. |
| D11 | A human disappears mid-game with no turn timer. | The game waits (presence shows who); the host can hand the seat to a bot from the pause menu. |
| D12 | Thief tries a lock whose face is already revealed Open. | Impossible in practice (an Open flip ends the round). |
| D13 | A late joiner reaches a full lobby or a started game. | They can watch as the room's one **spectator** (the detectives' view minus the team's private notes, see gameplay guide) and take a free seat back in the lobby. The host can switch spectators off or remove the watcher. |
| D14 | Bot strength. | Setting `botSkill`: Pro (default) or Rookie (fumbles about a third of its decisions). Timed-out human turns always use Pro. |
| D15 | Timer for bot setup placements. | A shorter fixed range (250–450 ms) than play decisions (900–1600 ms). Both are independent of hidden state. |
| D16 | "Top-down orthographic" camera preset. | A 13° field-of-view camera from high above, which is near-orthographic and allows a smooth dolly-zoom transition from the 3/4 view. |
| D17 | Phones in portrait. | The board view turns 90° (north to the right, marked by a compass on the plaza), so the board's long side runs up the screen for bigger touch targets. |
| D18 | Where a detective bot moves when the power is out. | The detective nearest the switch heads to restore it. The others keep hunting. |

## Built beyond v1 (stretch goals)

- **Board remix generator** (`src/shared/board/remix.ts`): mirror, back-room swap, gallery colour shuffle, and
  sliding doorways and windows. Every candidate is validated, and the seed is shareable from the lobby.
- **Spectators**, **emotes**, and **gamepad** navigation.
