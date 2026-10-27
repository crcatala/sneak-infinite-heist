# Architecture

How the code is organised, and where the game's hidden information is kept.

## How it fits together

```
src/
  shared/          Pure TypeScript, no DOM/Workers APIs, deterministic, unit tested
    board/           classic.ts (verbatim board data), model.ts, validate.ts, los.ts, paths.ts, remix.ts
    game/            config, state, setup, engine (the turn machine), detection, views, deduce, score, actions
    bots/            random (tests), detective (public deduction), thief (exposure/escape scoring)
    room.ts          lobby → round (setup → play → round over) → next round / lobby; seats, bots, clocks
    protocol.ts      zod-validated client messages, server messages, per-player RoomView
    roomCode.ts      signed room codes (HMAC check characters) · invites.ts: quotas, "My rooms", expiry
    presence.ts      when a room wakes to check for dead sockets, and when it goes quiet and sleeps
    rateLimit.ts     flood control: token buckets per socket and per room (see Costs & limits)
  worker/          Cloudflare Worker + Durable Objects (index, env, roomObject, inviteObject)
  client/          React + React Three Fiber
    net.ts / local.ts   websocket transport (online) / the same Room engine in the tab (solo)
    screens/            Title (boot, title, menus), Lobby, Game, How to Play, RoomScreen, SoloScreen
    scene/              Museum diorama, pieces, overlays, camera rig, title scene, bloom
    hud/                turn bar, action panel, plotting pad, dice tray, log, motion prompt, round over
    game/               interaction (clicks and highlights), other detectives' pending choices (remote.ts), turn rotation (turnOrder.ts), event presentation, derived helpers
    lobbyFlow.ts        pure helpers for the lobby: cover-flow ring maths and the first-time hint steps
    sfx.ts              sound effects (clips from public/audio/sfx, synth fallback), volume buses
    music.ts            background music and round-end stingers (public/audio/music), crossfaded
```

- **The server is the referee.** The full game state lives only in the room's Durable Object (or the in-tab engine
  in solo). Each player receives `viewFor(role)`, built field by field from a whitelist. The server answers every
  question itself, so the thief can't lie.
- **One mechanism for everything visible:** every change emits typed events with a visibility (`all`, `thief` or
  `detectives`). Views carry the viewer's filtered log, and the client plays new events as log lines, animations,
  toasts and sounds. Hidden thief moves produce the same single "the thief moved" event every time.
- **Leak tests:**
  - 500 seeded bot-vs-bot games check, after every step, that the detectives' and spectators' views don't change
    when every secret in the state is scrambled.
  - The same run checks structural leaks, game invariants, termination, and that the public deduction always
    contains the thief.
- **Bots** see only their own role's view. Their think time is a fixed random range, never influenced by hidden
  state.
- **Spectators** are not seats. At most one per room (`MAX_SPECTATORS`) lives in `RoomState.spectators`, outside
  `players`, so they never touch turns, clocks, the host or match rotation. They get the `spectator` view: the
  detectives' view minus the team's private notes (suspect marks, lock faces), so a spectator who is the thief's
  friend has nothing to pass along that the thief isn't allowed to know. The host's `allowSpectator` setting and `kick` control who watches.
- **Pending choices (`intent`).** A detective's picked-but-unconfirmed space, Eye target or lifted piece goes out as a
  stateless `intent` message, relayed to everyone else like a pin: detectives only, no memory, never changes game
  state. Receivers check it against their own view (right turn, a space the pawn can really reach, a piece that is
  there) and ignore it otherwise, so a stale or odd one just doesn't draw. It only describes public things, so it
  can't leak anything. The reach outline needs no message: every client computes it from the public roll.
- **Reconnects:** your seat is remembered per room, so refreshing rejoins the same seat. From another device, a
  started game offers the seats nobody is using. The host can hand an absent player's seat to a bot from the pause
  menu.


## Alarm backstops

A room's alarm is its "wake me up at" timer: the next bot move, turn deadline, motion prompt or dead-socket check.
It's the one cost that needs no player. Every wake-up is a billed request and a storage write or two, and if a bug
made the room keep asking to be woken "now", it would wake every 50 ms for as long as the bug lasted: about 1.7
million times a day per room, with nobody online. That is how the well-known Durable Object bills of tens of
thousands of dollars happened. Three backstops, all in `src/worker/roomObject.ts`, each with a test in
`tests/worker/roomObject.test.ts` that fails without it:

1. **Wake-ups at least 2 s apart** (`MIN_ALARM_GAP_MS`). `scheduleAlarm` never sets the alarm sooner than 2 s
   after the last wake-up, so a looping room costs about 43,000 wake-ups a day instead of 1.7 million. The last
   wake-up time is kept in memory, which is enough: Cloudflare only evicts an idle object after about 10 s, longer
   than the gap.
2. **The kill switch reaches alarms.** Alarms survive deploys, including the one `wrangler secret put` triggers,
   and go straight to the room. So `alarm()` and `webSocketMessage()` check `ONLINE_ENABLED` too
   (`closeIfOffline`), and `scheduleAlarm` drops every alarm while it's off, whoever calls it (a late close event,
   the constructor). The room's state is kept for when online rooms come back.
3. **Only `scheduleAlarm` sets the alarm.** `tests/tooling/alarmCalls.test.ts` parses `src/` and fails CI on a
   direct `setAlarm`/`deleteAlarm` call anywhere else (`destroy` may delete it). It reads names, not types, so
   `storage["setAlarm"]` would slip past; don't write that.

### Decision: a 2 s gap (2026-10-27)

The gap has to stay below the delay the fastest legitimate deadline can tolerate. Here that's a bot step: each
wake-up runs one, and the next comes 0.9–1.6 s later in play (`BOT_THINK_MS`) or 250–450 ms later while bots
set up the museum (`BOT_SETUP_MS`). Bots play in an online room when the host adds bot seats, hands an absent
player's seat to a bot, or a turn timer runs out. Measured on the engine with one human thief and three bots:

| Gap | Bot setup | Bots' share of each round | Ceiling per looping room |
|---|---|---|---|
| none (before) | about 5 s | about 3.7 s | 1.7 million wake-ups/day |
| 1 s | about 12 s | about 3.7 s | 86,000/day |
| **2 s** | **about 24 s** | **about 5.9 s** | **43,000/day** |
| 250 ms | about 5 s | about 3.7 s | 345,000/day |

We kept the playbook's 2 s: the same ceiling as the other games, and bots in online rooms are the only thing it
slows. Bots are meant for solo play, which runs in the browser with no alarms and isn't affected; online rooms
stop offering bot seats in a separate change. A seat handed to a bot, or a turn a bot finishes after its timer ran
out, moves one step every 2 s (tested). Turn timers (60 s and up, tested) and motion prompts (20 s) fire exactly
on time. Revisit if a feature needs alarms more often than every 2 s: lower the gap and update the ceiling
here and in [Deployment](deployment.md).
