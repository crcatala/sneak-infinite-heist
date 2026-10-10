# Contributing

Thanks for your interest in Sneak! Infinite Heist.

This is a personally maintained project. Issues and bug reports are welcome, and I may accept
code contributions in the future. For now, please open an issue to discuss a change before
writing a pull request. Pull requests that weren't discussed first may be closed without review.

## Bug reports

Bug reports are welcome when they include a clear reproduction. The most useful ones include:

- What you expected, what happened, and the steps to reproduce it.
- Where you played: browser and version, operating system, and whether it was a phone, tablet, or desktop.
- Whether it was solo or online, and how many players were in the room.
- The version and commit shown in the title screen footer (for example `v0.1.0 · 8858508`).
- Screenshots or a screen recording, and any error text from the browser console.

Search existing issues before opening a new one. Never include invite codes, room codes, or other
secrets. Crop or redact screenshots that show a real invite link.

## Ideas and feature requests

Ideas are welcome as issues. Describe the problem you're trying to solve, not only the feature you
have in mind.

## Security issues

Please do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

Use Node.js 24, the version CI runs on, and npm.

```bash
npm ci
npm run dev          # http://localhost:3000
npm run typecheck
npm test
npm run build
```

`npm run dev` copies `.dev.vars.example` to `.dev.vars` if it's missing. Production secrets and
deployment steps are in [docs/deployment.md](docs/deployment.md).

Before reporting a bug or opening a pull request, check that `npm run typecheck`, `npm test`, and
`npm run build` pass on your machine.

## Code guidelines

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), such as
  `feat(hud): ...` or `fix(worker): ...`, matching the existing history.
- Keep changes focused. Add or update tests in `tests/` when you change rules, the engine, or the
  worker.
- Don't commit `.dev.vars`, `.env*` files, or anything under `.wrangler/`.

## Game content and assets

- The game is an unofficial, fan-made adaptation. Don't add artwork, rules text, logos, or other
  material from the original board game. Keep the existing disclaimer in place.
- Only add art, music, or sound effects whose license allows redistribution in this repository,
  and document the source in the [README](README.md#credits--legal).

## Forks

You are welcome to fork this project and adapt it to your own needs under the terms of the
[MIT License](LICENSE).
