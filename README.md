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
| Right-click or long-press | Suspect mark (detectives) · remove a piece (setup) |
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
are available on the free Workers plan.

1. **Log in once.** This opens a browser to authorize Wrangler with your Cloudflare account:
   ```bash
   npx wrangler login
   ```
   On a remote or headless machine, where the browser callback can't reach Wrangler, create an API token instead
   (Cloudflare dashboard → My Profile → API Tokens → the "Edit Cloudflare Workers" template) and export it:
   ```bash
   export CLOUDFLARE_API_TOKEN=<token>
   export CLOUDFLARE_ACCOUNT_ID=<account id>   # only needed if the token can see more than one account
   npx wrangler whoami                         # check it works
   ```
2. **Deploy:**
   ```bash
   npm run deploy      # = vite build && wrangler deploy
   ```
   The first deploy creates the `sneak-infinite-heist` Worker and applies the Durable Object migration (`v1`:
   `RoomDurableObject`, `InviteDurableObject`). Wrangler prints the URL, e.g.
   `https://sneak-infinite-heist.<your-subdomain>.workers.dev`.
3. **Set the production secrets.** They survive redeploys, and online hosting needs both:
   ```bash
   ROOM_CODE_SECRET=$(openssl rand -base64 32)
   printf '%s\n' "$ROOM_CODE_SECRET"  # copy this value to your password manager
   printf '%s' "$ROOM_CODE_SECRET" | npx wrangler secret put ROOM_CODE_SECRET
   unset ROOM_CODE_SECRET

   npm run invite:new -- sam          # prints a fresh invite entry and magic link
   npx wrangler secret put INVITE_CODES   # paste entries, comma-separated: sam:<key>,jo:<key>
   ```
   - Save `ROOM_CODE_SECRET`: Cloudflare won't show secret values again, and changing it invalidates every
     existing room code.
   - The label (`sam`) only identifies the invite. Friends use the generated key.
   - Never set `DEV_CHEATS` in production.
4. **Share the site URL** with anyone (solo needs nothing), and a magic link `<site URL>/?invite=<key>` with each
   friend who should be able to host. Joining a room only needs its link.

**Managing invites:**

- `INVITE_CODES` is the whole admin panel. Add an entry to invite someone, and remove it to revoke (their existing
  room links keep working).
- To rotate a key, change the key but keep the label.
- Each invite may create 10 rooms per rolling 24 hours and keep 25. Rooms idle for 90 days are deleted lazily.

**Kill switch:**

- `echo false | npx wrangler secret put ONLINE_ENABLED` turns online rooms off instantly. Solo keeps working.
- `npx wrangler secret delete ONLINE_ENABLED` turns them back on.

**Optional rate limiting:** if you serve the Worker from your own zone, add a WAF rate-limiting rule for `/api/`
(e.g. more than 60 requests per 10 seconds per IP → block).

**Useful afterwards:**

- Deploys are manual: run `npm run deploy` again to ship changes. CI only type-checks, tests and builds.
- `npx wrangler tail` streams the live logs.
- If you ever rename or remove a Durable Object class, append a migration; don't edit `v1`.

### Costs & limits

A group of friends playing most nights should fit comfortably in the **free Workers plan**. On the free plan,
going over a daily limit doesn't bill you: further requests fail until the daily reset, so online rooms stop
working for the rest of the day while solo keeps working (it runs in the browser). See Cloudflare's
[Workers](https://developers.cloudflare.com/workers/platform/pricing/) and
[Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) pricing for current numbers.

What a game uses, and why it stays cheap:

- **Static files are free.** Only `/api/*` runs the Worker.
- **Rooms sleep between moves.** Durable Objects bill for every second they stay awake. Rooms use the WebSocket
  hibernation API, so a room with players connected but idle isn't billed, and the 10-second heartbeat is answered
  by Cloudflare without waking the room.
- **Requests are small.** A 4-player, hour-long game sends a few hundred messages plus the heartbeats (incoming
  WebSocket messages are billed at 1/20 of a request). That's well under 1% of the free daily allowance.
- **Wake-ups are bounded.**
  - Timers, bot moves and dead-socket checks use storage alarms. An alarm is only rewritten when it changes, since
    each write is billed.
  - A room in use checks for dead sockets once a minute. After 10 minutes with no joins or messages, it stops
    checking and sleeps, so a tab left open overnight no longer keeps waking it. The tab's heartbeats may still
    count as a few hundred requests a day. The next join or message checks right away, so a player whose
    device died in the meantime frees their seat (and hands over the host) at once.
- **Bad links never reach a room.** Room codes are signed, so the Worker rejects made-up codes without waking a
  Durable Object. Creating rooms needs an invite, and each invite is limited (see above).
- **No rate limit by default.** Anyone with a room link can send messages. On the free plan the worst case is
  hitting the daily cap. On the paid plan ($5/month), add a billing notification in the dashboard, and the WAF rule
  above if you use your own domain.

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
