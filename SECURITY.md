# Security Policy

## Supported versions

Only the latest commit on `main` is supported with security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for a suspected vulnerability, and don't include real invite keys,
room secrets or `ROOM_CODE_SECRET` values in a report. Use GitHub's
[private vulnerability reporting](https://github.com/crcatala/sneak-infinite-heist/security/advisories/new) for
this repository, or contact [@crcatala](https://github.com/crcatala) privately with a reproduction, the
impact, and a suggested mitigation if you have one.

You should receive an acknowledgement within seven days. Public disclosure will be coordinated after a fix
is available.

## Scope

Things that are in scope include ways to see hidden information (the thief's position or moves, or hidden state in a spectator's or detective's view), take over a seat or room you
weren't given, host without a valid invite, or make a deployment use up its
Cloudflare quota faster than the documented limits allow.

Seat claiming in a started game is trust-based by design (it's a game among friends), so choosing
someone else's free seat from another device isn't a vulnerability on its own.

The local `DEV_CHEATS` flag is for development only. Leaving it on in production is a misconfiguration, not a
vulnerability.
