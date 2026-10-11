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
    game/               interaction (clicks and highlights), event presentation, derived helpers
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
- **Reconnects:** your seat is remembered per room, so refreshing rejoins the same seat. From another device, a
  started game offers the seats nobody is using. The host can hand an absent player's seat to a bot from the pause
  menu.

