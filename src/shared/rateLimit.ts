// Flood control for room Durable Objects: token buckets per socket and per room, closing sockets
// that keep flooding, and a short rejoin penalty for their players. Pure logic (time is passed in),
// tests drive it directly.
//
// Hibernation: the room object is evicted from memory after ~10 s without messages, which would
// refill every bucket and forget every penalty. So a flooder could drain its budget, pause, and
// start again with a full one. The room therefore saves a snapshot (snapshot()/restore()) while
// anyone is being throttled or a bucket runs low, and always when it closes a socket. Honest play
// never gets near that, so it costs no storage writes.
//
// Why it matters: every message wakes the room (duration) and counts as a request (1 per 20
// WebSocket messages), and every state change is a storage write. On the free plan, going over any
// daily limit breaks every room on the account until the next day.
//
// Sneak is turn-based, so the limits sit above realistic play, not above every conceivable input.
// The room's own cooldowns allow a detective 5 pins/s, but nobody clicks that fast for minutes; at
// that bot-like rate the sustained limit (3/s) throttles them, without ever closing the socket
// (see tests/rateLimit.test.ts). Realistic heavy use (2 pins/s plus emotes) is never dropped.

export interface BucketSpec {
  /** Most tokens a bucket holds: how big a burst it allows. */
  capacity: number;
  /** Tokens added per second: the sustained rate it allows. */
  perSecond: number;
}

export const RATE_LIMITS = {
  /** Every message from one socket, short term: a burst of pins or taps is fine, a flood is not. */
  socket: { capacity: 30, perSecond: 15 } satisfies BucketSpec,
  /**
   * Every message from one socket, long term: no socket can keep sending more than 3 messages a
   * second, which is more than a person plays at for minutes on end.
   */
  socketSustained: { capacity: 1200, perSecond: 3 } satisfies BucketSpec,
  /** Every message, across the whole room: a flood can't keep a room busy at more than 8 messages a second. */
  roomMessages: { capacity: 600, perSecond: 8 } satisfies BucketSpec,
  /**
   * Messages that may change room state, across the whole room. Each one is a storage write, and
   * writes are the scarcest free-plan resource (100k/day for the whole account). A lively game
   * stays far below 1/s on average; the burst absorbs setup flurries (everyone readying up).
   */
  roomWrites: { capacity: 60, perSecond: 1 } satisfies BucketSpec,
  /**
   * A socket with this many messages dropped over its own limits (not the room's, which another
   * player may have used up) within floodWindowMs is closed: dropping alone still lets it wake the
   * room and use up requests. People never get near it.
   */
  floodDrops: 100,
  floodWindowMs: 10_000,
  /** A player whose socket was closed for flooding can't rejoin for this long. */
  penaltyMs: 60_000,
  /** A throttled socket hears "slow down" at most this often. */
  noticeMs: 5000,
};

export type FloodVerdict = "ok" | "drop" | "close";

/** What survives the room being evicted: bucket levels as of `at`, and who is serving a penalty. */
export interface FloodSnapshot {
  at: number;
  messages: number;
  writes: number;
  /** Long-term budget left, by socket id. */
  sustained: Record<string, number>;
  /** Player id -> when the penalty ends. */
  penalties: Record<string, number>;
}

interface SocketState {
  burst: TokenBucket;
  sustained: TokenBucket;
  drops: number;
  windowStart: number;
  noticeAt: number;
}

export class FloodControl {
  private sockets = new Map<string, SocketState>();
  private messages: TokenBucket;
  private writes: TokenBucket;
  private penalties = new Map<string, number>();

  constructor(now: number) {
    this.messages = new TokenBucket(RATE_LIMITS.roomMessages, now);
    this.writes = new TokenBucket(RATE_LIMITS.roomWrites, now);
  }

  /**
   * Judges one incoming message from socket `sid` (player `playerId`); `writes` is whether it may
   * change room state. "drop": ignore it (`notice`: tell the sender to slow down). "close": close
   * the socket; the player is barred from rejoining for RATE_LIMITS.penaltyMs.
   */
  check(sid: string, playerId: string, writes: boolean, now: number): { verdict: FloodVerdict; notice: boolean } {
    let s = this.sockets.get(sid);
    if (!s) {
      s = { burst: new TokenBucket(RATE_LIMITS.socket, now), sustained: new TokenBucket(RATE_LIMITS.socketSustained, now), drops: 0, windowStart: now, noticeAt: -Infinity };
      this.sockets.set(sid, s);
    }
    const own = s.burst.take(now) && s.sustained.take(now);
    if (own && this.messages.take(now) && (!writes || this.writes.take(now))) return { verdict: "ok", notice: false };

    if (!own) {
      if (now - s.windowStart > RATE_LIMITS.floodWindowMs) {
        s.windowStart = now;
        s.drops = 0;
      }
      if (++s.drops >= RATE_LIMITS.floodDrops) {
        this.sockets.delete(sid);
        this.penalties.set(playerId, now + RATE_LIMITS.penaltyMs);
        return { verdict: "close", notice: false };
      }
    }
    const notice = now - s.noticeAt >= RATE_LIMITS.noticeMs;
    if (notice) s.noticeAt = now;
    return { verdict: "drop", notice };
  }

  /** Whether this player was recently closed for flooding (and may not rejoin yet). */
  penalized(playerId: string, now: number): boolean {
    const until = this.penalties.get(playerId);
    if (until === undefined) return false;
    if (until > now) return true;
    this.penalties.delete(playerId);
    return false;
  }

  /** Forgets a socket that has gone. */
  forget(sid: string) {
    this.sockets.delete(sid);
  }

  /** True when someone is close enough to a limit that the room should save a snapshot. */
  pressured(now: number): boolean {
    for (const until of this.penalties.values()) if (until > now) return true;
    if (this.messages.level(now) < RATE_LIMITS.roomMessages.capacity / 2) return true;
    if (this.writes.level(now) < RATE_LIMITS.roomWrites.capacity / 2) return true;
    for (const s of this.sockets.values()) if (s.sustained.level(now) < RATE_LIMITS.socketSustained.capacity / 2) return true;
    return false;
  }

  snapshot(now: number): FloodSnapshot {
    const sustained: Record<string, number> = {};
    for (const [sid, s] of this.sockets) sustained[sid] = s.sustained.level(now);
    const penalties: Record<string, number> = {};
    for (const [id, until] of this.penalties) if (until > now) penalties[id] = until;
    return { at: now, messages: this.messages.level(now), writes: this.writes.level(now), sustained, penalties };
  }

  /**
   * Picks up where a snapshot left off (buckets refill for the time that passed since). Only sockets
   * in `liveSids` come back, with their long-term budget; short-term bursts refill in seconds anyway.
   */
  restore(snap: FloodSnapshot, now: number, liveSids: Set<string>) {
    this.messages = new TokenBucket(RATE_LIMITS.roomMessages, snap.at, snap.messages);
    this.writes = new TokenBucket(RATE_LIMITS.roomWrites, snap.at, snap.writes);
    this.penalties = new Map(Object.entries(snap.penalties).filter(([, until]) => until > now));
    this.sockets.clear();
    for (const [sid, tokens] of Object.entries(snap.sustained)) {
      if (!liveSids.has(sid)) continue;
      this.sockets.set(sid, { burst: new TokenBucket(RATE_LIMITS.socket, now), sustained: new TokenBucket(RATE_LIMITS.socketSustained, snap.at, tokens), drops: 0, windowStart: now, noticeAt: -Infinity });
    }
  }
}

export class TokenBucket {
  private tokens: number;
  private at: number;

  constructor(
    private spec: BucketSpec,
    now: number,
    tokens: number = spec.capacity,
  ) {
    this.tokens = Math.min(spec.capacity, tokens);
    this.at = now;
  }

  /** Tokens available now, without taking one. */
  level(now: number): number {
    return Math.min(this.spec.capacity, this.tokens + (Math.max(0, now - this.at) / 1000) * this.spec.perSecond);
  }

  /** Takes one token. Returns false (and takes nothing) when the bucket is empty. */
  take(now: number): boolean {
    this.tokens = Math.min(this.spec.capacity, this.tokens + (Math.max(0, now - this.at) / 1000) * this.spec.perSecond);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
