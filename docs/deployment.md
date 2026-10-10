# Deploying to Cloudflare

Everything (the static client, the API and the rooms) deploys as **one Worker** with two Durable Object
classes. Durable Objects with SQLite storage are available on the free Workers plan, so a group of friends
can host Sneak! Infinite Heist without paying anything.

- [First deploy](#first-deploy)
- [Configuration reference](#configuration-reference)
- [Managing invites](#managing-invites)
- [Kill switch](#kill-switch)
- [Optional: a rate-limiting rule](#optional-a-rate-limiting-rule)
- [Costs and free-plan limits](#costs-and-free-plan-limits)
- [Maintenance](#maintenance)

## First deploy

1. **Log in once.** This opens a browser to authorize Wrangler with your Cloudflare account:
   ```bash
   npx wrangler login
   ```
   On a remote or headless machine, where the browser callback can't reach Wrangler, create an API token
   instead (Cloudflare dashboard → My Profile → API Tokens → the "Edit Cloudflare Workers" template) and
   export it:
   ```bash
   export CLOUDFLARE_API_TOKEN=<token>
   export CLOUDFLARE_ACCOUNT_ID=<account id>   # only needed if the token can see more than one account
   npx wrangler whoami                         # check it works
   ```
2. **Deploy:**
   ```bash
   npm run deploy      # = vite build && wrangler deploy
   ```
   The first deploy creates the `sneak-infinite-heist` Worker and applies the Durable Object migration
   (`v1`: `RoomDurableObject`, `InviteDurableObject`). Wrangler prints the URL, e.g.
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
   Save `ROOM_CODE_SECRET`: Cloudflare won't show secret values again, and changing it invalidates every
   existing room code. The label (`sam`) only identifies the invite; friends use the generated key.
   **Never set `DEV_CHEATS` in production.**
4. **Share** the site URL with anyone (solo needs nothing), and a magic link `<site URL>/?invite=<key>` with
   each friend who should be able to host. Joining a room only needs its link.

## Configuration reference

All configuration is Worker secrets, set with `npx wrangler secret put <NAME>` (and removed with
`npx wrangler secret delete <NAME>`). Locally they come from `.dev.vars`, which `npm run dev` creates from
[`.dev.vars.example`](../.dev.vars.example).

| Secret | Required | What it does |
|---|---|---|
| `ROOM_CODE_SECRET` | For online rooms | Signs room codes so forged or mistyped codes are rejected before reaching a Durable Object. Changing it invalidates every existing room code. |
| `INVITE_CODES` | For online rooms | Who may host: `label:key` pairs, comma- or newline-separated. See [Managing invites](#managing-invites). |
| `ONLINE_ENABLED` | No | Set to `false` to turn online rooms off. Solo mode keeps working. |
| `DEV_CHEATS` | Never in production | Local development only: lets the debug console reveal hidden information in online rooms. |

## Managing invites

`INVITE_CODES` is the whole admin panel. Add an entry to invite someone; remove it to revoke (their existing
room links keep working for players); change the key but keep the label to rotate it. Cloudflare won't reveal
a lost invite key: generate a replacement and update the full `INVITE_CODES` value, keeping any other entries
you still use. The label is the invite's identity: renaming it starts a fresh, empty "My rooms".

Each invite can create at most 10 new rooms per rolling 24 hours and keep 25 saved rooms. Rooms idle for 90
days are deleted.

## Kill switch

```bash
echo false | npx wrangler secret put ONLINE_ENABLED   # online rooms off
npx wrangler secret delete ONLINE_ENABLED             # back on
```

The Worker checks the switch on every new request; the rooms themselves don't. Players already in a room are
cut off because `wrangler secret put` deploys a new version straight away, and every deploy restarts all
Durable Objects and drops their websockets. When their browsers try to reconnect, the Worker refuses them,
and the client stops retrying. With gradual deployments (`wrangler versions secret put`), the switch only
takes effect once that version is fully deployed. Solo mode keeps working either way: it runs entirely in the
browser.

## Optional: a rate-limiting rule

If you serve the Worker from a zone on your Cloudflare account, add a WAF rate-limiting rule there, e.g.
requests to URI path starting with `/api/` above 60 per 10 seconds per IP → Block. Blocked requests never
reach the Worker, so floods can't use up your daily free-plan requests. (`workers.dev` hosts can't have WAF
rules.)

## Costs and free-plan limits

Sneak! Infinite Heist is built to stay inside Cloudflare's free Workers plan:

- **Static files are served as Worker assets**, so only `/api/*` requests (lobby calls and room websockets)
  run the Worker. Every `/api/*` call still counts toward the Workers daily request limit, including the
  ones the Worker turns away (forged room codes, missing or wrong invites).
- **Rooms hibernate** between moves: an idle websocket doesn't keep a Durable Object awake, the 10-second
  heartbeat is answered by Cloudflare without waking the room, and WebSocket messages are billed at 20:1 as
  requests. A 4-player, hour-long game sends a few hundred messages: well under 1% of the free daily
  allowance.
- **Wake-ups are bounded.** Timers, bot moves and dead-socket checks use storage alarms, and an alarm is only
  rewritten when it changes (each write is billed). A room in use checks for dead sockets once a minute;
  after 10 minutes with no joins or messages it stops checking and sleeps, so a tab left open overnight no
  longer keeps waking it. The next join or message checks right away, so a player whose device died in the
  meantime frees their seat (and hands over the host) at once.
- **Room codes are signed**, so guessed or mistyped codes are rejected by the Worker without waking a
  Durable Object. Creating rooms needs an invite, and each invite is limited (see above).
- **Flood control** (`src/shared/rateLimit.ts`) caps every room at 8 messages/s and 1 state change/s
  sustained (state changes are what cost storage writes), and each socket at 3 messages/s over the long run.
  Every message is charged before it is read, so unparseable or oversized junk counts too. Extra messages are
  dropped with a "slow down" notice; a socket that keeps going is closed, and that player (whether it rejoins
  with its player id or by claiming a seat) can't rejoin for a minute. The budgets and penalties survive the room
  being evicted from memory: while anyone is being throttled the room saves a small snapshot, at most every 2
  seconds. Normal play never writes one.
  The limits sit above realistic play: three detectives pinning twice a second each, plus emotes, never get a
  single drop. The room's own cooldowns would allow 5 pins a second, which nobody keeps up for minutes; at that
  rate the long-term limit (3 messages a second per socket) throttles it, and it is never closed for it.

**The gotcha:** when any Durable Object free-tier daily limit is exceeded, Durable Object calls fail for the
**whole account** until the daily reset (00:00 UTC). Every room stops working, not just the busy one. The
Workers request limit is separate and works the same way. Solo mode keeps working because it never talks to
the server. On the free plan these are hard caps, not bills.

### Worst-case estimates

The flood limits put a ceiling on what a single room can cost, even if someone hammers it non-stop. Per
**room-hour**, at its limits, a room uses at most about:

| Free daily limit | One room-hour, worst case | Why |
|---|---|---|
| Duration, 13,000 GB-s | about 450 GB-s | one Durable Object kept awake for an hour |
| Storage writes, 100k rows | about 16,000 + bursts | 1 state change/s, each costing up to 4 rows (see below) |
| Requests, 100k | about 1,440 for messages handled | 8 messages/s ÷ 20 (WebSocket messages bill 20:1) |

One accepted state change can write several rows: the room state, the alarm when a deadline moved, the "last
pushed summary" marker and the invite's room ledger (in another Durable Object, but on the same account). That is
up to 4 per change, so 3,600 × 4, plus up to 1,800 for flood snapshots (only while someone is being throttled,
at most one per 2 seconds) and about 60 for presence alarms. A room flooded at its limits therefore uses roughly
16% of the day's row allowance per hour, so about 6 flooded room-hours would use it up.

Duration is the one firm ceiling: it's wall-clock time, so a room awake for an hour costs the same however
hard it's flooded, and roughly 28 room-hours awake in a day would use it up. The other two rows count only
what the room handles. They leave out messages the room drops for going over the limits (they still wake the
room and count as requests), websocket connections and reconnects, the `/info` check before joining, Worker
requests (which have their own daily limit), and other rooms. A room link works like a key, so if one leaks,
anyone can join that room and spend its share, and each invite can keep up to 25 rooms.

Real games use far less, since rooms hibernate between moves. With invite-only hosting you decide who can
open rooms, so a friends' game night is a small fraction of the free tier.

If you outgrow the free plan, the Workers Paid plan ($5/month) turns these hard daily limits into small
overage charges. If you upgrade, set up a billing notification in the dashboard and add the rate-limiting
rule above. Check Cloudflare's current [Workers](https://developers.cloudflare.com/workers/platform/pricing/)
and [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) pricing, since
limits can change.

## Maintenance

- `npx wrangler tail`: live logs from the deployed Worker (room errors).
- Deploys are manual: run `npm run deploy` again to ship changes. CI only type-checks, tests and builds.
- Renaming the Worker: change `name` in `wrangler.jsonc`.
- If you ever rename or remove a Durable Object class, add a new migration entry. Never edit an applied
  migration (`v1`).
