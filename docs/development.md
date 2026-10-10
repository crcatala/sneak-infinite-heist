# Development

Running the game locally, the development tools, and the checks to run before a change.

## Local setup

```bash
npm install
npm run dev          # Vite + the Worker + Durable Objects, all local, at http://localhost:3000
```

No Cloudflare account is needed for local development: the Cloudflare Vite plugin runs the Worker and Durable
Objects inside `workerd` on your machine. The first `npm run dev` copies `.dev.vars.example` (repo root) to
`.dev.vars` (local secrets, gitignored), which includes a dev invite.

- **Solo:** open the site, press any key, then **Play Solo**. It runs entirely in your browser, with no server or
  sign-up.
- **Online:** open `http://localhost:3000/?invite=dev-invite-key` once, then **Play Online → Host a game**. Share
  the room link.
- **Several players on one machine:** open the room link with `?as=2`, `?as=3`… in other tabs. Each alias is a
  separate player identity. The debug console has links.

## Testing from another machine

The dev server only listens on `localhost`. To test from another machine, pass `--host <address>` and list the
hostnames you will use in the `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable (comma-separated; a
leading dot allows subdomains). Set it in your shell, not a `.env` file:

```bash
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=my-machine,.example.internal
npm run dev -- --host 192.168.1.20
```

Local dev runs with debug cheats on and a well-known invite key, so anyone who can reach the server may access the
app. Only expose it on a trusted network, and stop it when you are done.

## Debug console

Press <kbd>`</kbd> (backtick) in the game to open it:

- Start now, auto-setup the current phase and skip to play.
- Force the next roll, give the thief paintings, cut or restore the power, end the round.
- Slow-motion animations, the network counters and your view's raw state JSON.
- "View as" thief, detectives or omniscient. This peek is only available in solo mode and in local dev
  (`DEV_CHEATS` in `.dev.vars`), never in production rooms.

## Checks

```bash
npm test             # unit tests: board, engine rules, 500-game leak fuzz, deduction, bots, rooms, invites
npm run typecheck    # client + worker + shared
npm run build        # production build (dist/)
```

See [Architecture](architecture.md) for the code map and [Deploying to Cloudflare](deployment.md) for production
setup.
