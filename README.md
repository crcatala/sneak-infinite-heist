# Sneak! Infinite Heist

A hidden-movement museum heist for **2–4 friends** in the browser, or **solo against bots**.

- One player is the **Thief**. Their position is secret while they sneak through a toy-like 3D museum at night,
  stealing paintings, disabling cameras and cutting the power.
- Everyone else is a **Detective**. The detectives roll dice, check sightlines, cameras and motion detectors, and
  close in on where the thief could be.
- The thief wins by escaping through an unlocked exit with enough loot. The detectives win by landing on the thief.

It's an unofficial, fan-made digital adaptation inspired by *Clue: The Great Museum Caper* (1991), with an original
look, cast, artwork and sound (see [Credits & legal](#credits--legal)). The rules reference is
`docs/research/game-analysis.md`, and the visual identity is in `docs/STYLE.md`.

## Quick start

```bash
npm install
npm run dev          # Vite + the Worker + Durable Objects, all local
```

No Cloudflare account is needed for local development: the Cloudflare Vite plugin runs the Worker and Durable
Objects inside `workerd` on your machine. The first `npm run dev` copies `.dev.vars.example` to `.dev.vars` (local
secrets, gitignored), which includes a dev invite.

The dev server only listens on `localhost`. To test from another machine, pass `--host <address>` and list the
hostnames you will use in the `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable (comma-separated; a
leading dot allows subdomains). Set it in your shell, not a `.env` file:

```bash
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=my-machine,.example.internal
npm run dev -- --host 192.168.1.20
```

Local dev runs with debug cheats on and a well-known invite key, so anyone who can reach the server may access the
app. Only expose it on a trusted network, and stop it when you are done.

- **Solo:** open the site, press any key, then **Play Solo**. It runs entirely in your browser, with no server or
  sign-up.
- **Online:** open `http://localhost:3000/?invite=dev-invite-key` once, then **Play Online → Host a game**. Share
  the room link.
- **Several players on one machine:** open the room link with `?as=2`, `?as=3`… in other tabs. Each alias is a
  separate player identity. The debug console has links.
- **Debug console:** press <kbd>`</kbd> (backtick) for:
  - Start now, auto-setup the current phase and skip to play.
  - Force the next roll, give the thief paintings, cut or restore the power, end the round.
  - Slow-motion animations, the network counters and your view's raw state JSON.
  - "View as" thief, detectives or omniscient. This peek is only available in solo mode and in local dev
    (`DEV_CHEATS` in `.dev.vars`), never in production rooms.

```bash
npm test             # unit tests: board, engine rules, 500-game leak fuzz, deduction, bots, rooms, invites
npm run typecheck    # client + worker + shared
npm run build        # production build (dist/)
```

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

The action die is always 4 Eye / 1 Scan / 1 Motion.

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
- **Reconnects:** your seat is remembered per room, so refreshing rejoins the same seat. From another device, a
  started game offers the seats nobody is using. The host can hand an absent player's seat to a bot from the pause
  menu.

## Deploying to Cloudflare (Workers + Durable Objects)

Everything deploys as **one Worker**: the static client, the API and the rooms. Durable Objects with SQLite storage
are available on the free Workers plan. You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```bash
npx wrangler login
npm run deploy                          # = vite build && wrangler deploy
npx wrangler secret put ROOM_CODE_SECRET   # e.g. the output of: openssl rand -base64 32
npm run invite:new -- sam               # prints an invite entry (sam:<key>) and its magic link
npx wrangler secret put INVITE_CODES    # paste entries, comma-separated: sam:<key>,jo:<key>
```

Send each friend who should be able to host their magic link, `<site URL>/?invite=<key>`. Joining a room only needs
its link, and solo needs nothing. See [Deploying to Cloudflare](docs/deployment.md) for the full walkthrough, invite
management and the kill switch. Never set `DEV_CHEATS` in production.

### Costs & limits

Sneak! is designed to run for free on Cloudflare's Workers free plan. On the free plan, going over a daily limit
doesn't bill you: further requests fail until the daily reset, so online rooms stop working for the rest of the day
while solo keeps working (it runs in the browser).

- **Only `/api/*` runs the Worker.** Static files are free.
- **Rooms sleep between moves** (WebSocket hibernation), and a room left open and quiet stops waking itself after 10
  minutes.
- **Bad links never reach a room.** Room codes are signed, so the Worker rejects made-up codes without waking a
  Durable Object. Creating rooms needs an invite, and each invite creates at most 10 rooms per 24 hours and keeps 25.
- **Every room is rate limited.** A room handles at most 8 messages/s and saves at most 1 change/s sustained, and a
  socket that keeps flooding is disconnected for a minute. That puts a ceiling on what any one room can cost.

> On the free plan, limits are hard caps, not bills. If any daily Durable Object limit, or the Workers request
> limit, is exceeded, every online room on your account stops working until the reset at 00:00 UTC. Solo keeps
> working. Add the optional WAF rate-limiting rule if you serve the Worker from your own domain. On the Workers Paid
> plan ($5/month), the hard limits become small overage charges: set a billing notification in the dashboard.

See [Costs and free-plan limits](docs/deployment.md#costs-and-free-plan-limits) for the worst-case numbers per room-hour.

## Credits & legal

Sneak! Infinite Heist is an unofficial, fan-made game inspired by *Clue: The Great Museum Caper* (Parker Brothers,
1991), designed by John LaBelle, Thomas Rabideau and Dave Rabideau. It's a non-commercial project, made to play with
friends.

- It isn't affiliated with, sponsored by or endorsed by Hasbro, Parker Brothers or any of their brands. *Clue* is a
  trademark of Hasbro, Inc.
- No artwork, rules text, logos, characters or other assets from the original game are used. The 3D models,
  textures and the nine paintings are all original and made in code for this project. The detective and thief
  portraits in the lobby (`public/art/detectives`) are original illustrations generated with OpenAI's image model
  from the prompts in [docs/ART.md](docs/ART.md).
  The sound effects (`public/audio/sfx`) were generated with [ElevenLabs](https://elevenlabs.io) from text prompts.
  The music (`public/audio/music`) is original to this project; `node scripts/normalize-music.mjs <dir>` rebuilds
  the level-matched MP3s from raw exports.
- **Fonts:** Bungee, Fredoka, Nunito and Caveat, all under the SIL Open Font License, served by Google Fonts.
- **Built with** React, Three.js, React Three Fiber and drei, zustand, zod and Cloudflare Workers.

If you're a rights holder and have a concern, please open an issue or email crcatala@gmail.com.

## License

The source code is released under the [MIT License](LICENSE). The license covers this project's own code and
assets only; it grants no rights to the original board game or its trademarks.
