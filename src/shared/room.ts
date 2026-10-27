// The whole room as a pure state machine: lobby → game (setup → play → round over) → next round or
// back to the lobby. The Durable Object wraps this with sockets, persistence and alarms; solo mode
// runs it in the tab (client/local.ts); tests drive it directly.
//
// Timers and bots both run through `tick()` / `nextAlarm()`: bots act after a think time drawn from
// a fixed range (never from hidden state); turn timers hand an expired turn to the bot logic.

import { CLASSIC_BOARD } from "./board/classic";
import { getBoard } from "./board/model";
import { remixBoard } from "./board/remix";
import { botAction } from "./bots";
import { CHARACTERS, type DetectiveColour } from "./characters";
import type { GameAction } from "./game/actions";
import { DEFAULT_RULES, MOTION_RESPONSE_MS } from "./game/config";
import { activePawn, apply, debugOps, isDetective, isThief, waitingOn } from "./game/engine";
import { standings } from "./game/score";
import { autoPlace, createGame } from "./game/setup";
import { GameError, SETUP_PHASES, type GameState } from "./game/state";
import { viewFor, type Viewer } from "./game/views";
import type { RoomSummary } from "./invites";
import { CHEAT_COMMANDS, type ClientMessage, type ClockView, type MatchView, type Role, type RoomView, type ServerMessage } from "./protocol";
import { randomCode, randomSeed, shuffle, stateRng, type Rng } from "./rng";
import type { Player, RoomSettings, RoomState } from "./roomTypes";

export interface RoomDeps {
  now: () => number;
  rng: Rng;
  /** Allows debug commands that reveal hidden information (solo mode, local dev). */
  cheats: boolean;
  /**
   * The host may fill seats with bots. Solo only: online, each bot move is a Durable Object alarm, and alarms are
   * spaced at least 2 s apart (docs/architecture.md, "Alarm backstops"), which made online bots sluggish.
   */
  botSeats: boolean;
}

export interface HandleResult {
  /** Room state changed: persist and broadcast fresh views. */
  changed: boolean;
  /** Messages that don't touch persistent state (errors, emotes). */
  outbound: { to: "others" | "self" | "team"; msg: ServerMessage }[];
  /** People who were just removed from the room: the transport tells them why and closes their sockets. */
  dropped?: { playerId: string; message: string }[];
}

export class RoomError extends Error {}

/** Joining a game in progress without a valid seat secret: the player must pick an empty seat. */
export class SeatClaimNeeded extends RoomError {
  constructor(public seats: { id: string; name: string }[]) {
    super("This game has already started. Pick your seat to rejoin.");
  }
}

export interface JoinOptions {
  playerId?: string;
  secret?: string;
  name?: string;
  /** Join as the spectator (no seat; watches from the detectives' side). */
  spectate?: boolean;
  /** Take over this disconnected seat (trust-based rejoin from a new device or browser). */
  claim?: string;
}

export const MAX_SEATS = 4;
export const MIN_SEATS = 2;
/** People who can watch a room without a seat. The state keeps a list, so this is the only knob. */
export const MAX_SPECTATORS = 1;
/** Bot think time: a fixed range, independent of anything hidden. */
export const BOT_THINK_MS: [number, number] = [900, 1600];
/** Setup placements are quicker (and public anyway). */
export const BOT_SETUP_MS: [number, number] = [250, 450];
/** Minimum gap between two emotes from the same player. */
export const EMOTE_COOLDOWN_MS = 1500;
/** Minimum gap between two pointer pins from the same player (placing several in a row is fine). */
export const PIN_COOLDOWN_MS = 200;

const BOT_NAMES = ["Clank", "Widget", "Sprocket", "Gizmo", "Rivet", "Bolt"];

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: "single",
  thiefSelection: "random",
  turnTimerSec: 0,
  botSkill: "pro",
  layout: { kind: "classic" },
  rules: { ...DEFAULT_RULES },
  allowSpectator: true,
};

export function createRoomState(code: string, now: number, inviteId?: string): RoomState {
  return {
    code,
    createdAt: now,
    ...(inviteId ? { inviteId } : {}),
    phase: "lobby",
    players: [],
    secrets: {},
    nextId: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    hostThief: null,
    game: null,
    match: null,
    clock: null,
  };
}

export class Room {
  /** Cheat views per player (not persisted: a refresh turns them off). */
  private viewAs = new Map<string, Viewer>();
  private lastEmote = new Map<string, number>();
  private lastPin = new Map<string, number>();

  constructor(
    public state: RoomState,
    private deps: RoomDeps,
  ) {
    state.spectators ??= [];
    // Rooms saved before the setting existed.
    state.settings.allowSpectator ??= true;
  }

  private get spectators(): Player[] {
    return (this.state.spectators ??= []);
  }

  isSpectator(id: string): boolean {
    return this.spectators.some((p) => p.id === id);
  }

  // --- helpers --------------------------------------------------------------------------------

  private nextId = (prefix: string) => `${prefix}${(this.state.nextId++).toString(36)}`;

  player(id: string): Player | undefined {
    return this.state.players.find((p) => p.id === id) ?? this.spectators.find((p) => p.id === id);
  }

  private humans(): Player[] {
    return this.state.players.filter((p) => !p.isBot);
  }

  /** Bots, and humans the host handed to the bots while they're away. */
  private isAutomated(id: string): boolean {
    const p = this.player(id);
    return !p || p.isBot || !!p.botTakeover;
  }

  private requireHost(playerId: string) {
    if (!this.player(playerId)?.isHost) throw new RoomError("Only the host can do that.");
  }

  private requireLobby() {
    if (this.state.phase !== "lobby") throw new RoomError("That only works in the lobby.");
  }

  private unreadyAll() {
    for (const p of this.state.players) if (!p.isBot) p.ready = false;
  }

  private freeCharacter(except?: string): DetectiveColour | null {
    const used = new Set(this.state.players.filter((p) => p.id !== except).map((p) => p.character));
    return CHARACTERS.find((c) => !used.has(c.id))?.id ?? null;
  }

  startBlocker(): string | null {
    const seats = this.state.players.length;
    if (seats < MIN_SEATS) return this.deps.botSeats ? "You need at least 2 seats: invite a friend or add a bot." : "You need at least 2 players: invite a friend.";
    const s = this.state.settings;
    if (s.mode === "match" && this.humans().length === 0) return "A match needs at least one human thief.";
    if (s.thiefSelection === "host" && !this.player(this.state.hostThief ?? "")) return "The host needs to pick the thief.";
    if (s.thiefSelection === "volunteer" && !this.state.players.some((p) => p.volunteer)) return "Someone needs to volunteer as the thief.";
    return null;
  }

  // --- membership -----------------------------------------------------------------------------

  join(opts: JoinOptions): { playerId: string; secret: string } {
    const existing = opts.playerId ? this.player(opts.playerId) : undefined;
    if (existing && !existing.isBot && this.state.secrets[existing.id] === opts.secret) {
      existing.connected = true;
      delete existing.botTakeover;
      this.syncClock();
      return { playerId: existing.id, secret: opts.secret! };
    }
    if (opts.spectate) return this.addSpectator(opts.name, "watch");
    if (this.state.phase !== "lobby") return this.claimSeat(opts.claim);
    if (this.state.players.length >= MAX_SEATS) {
      const bot = [...this.state.players].reverse().find((p) => p.isBot);
      // A full lobby of humans: come in and watch instead.
      if (!bot) return this.addSpectator(opts.name, "full");
      // A human bumps a bot.
      this.removePlayer(bot.id);
    }

    const playerId = this.nextId("u");
    const secret = Array.from({ length: 4 }, () => randomCode(this.deps.rng, 8)).join("");
    const humanCount = this.humans().length;
    const player: Player = {
      id: playerId,
      name: (opts.name ?? "").trim().slice(0, 24) || `Player ${humanCount + 1}`,
      isBot: false,
      isHost: humanCount === 0,
      ready: false,
      connected: true,
      joinedAt: this.deps.now(),
      character: null,
      volunteer: false,
    };
    player.character = this.freeCharacter();
    // Humans sit before bots so friends are next to each other.
    const firstBot = this.state.players.findIndex((p) => p.isBot);
    if (firstBot >= 0) this.state.players.splice(firstBot, 0, player);
    else this.state.players.push(player);
    this.state.secrets[playerId] = secret;
    return { playerId, secret };
  }

  /**
   * Seats the spectator. The seat is first come, first served, but a holder who has disconnected
   * doesn't keep it from someone else (their old secret stops working). `why` only picks the refusal text.
   */
  private addSpectator(name: string | undefined, why: "watch" | "full"): { playerId: string; secret: string } {
    if (!this.state.settings.allowSpectator) throw new RoomError(why === "full" ? "This room is full." : "The host isn't allowing spectators in this room.");
    for (const gone of this.spectators.filter((w) => !w.connected)) {
      if (this.spectators.length < MAX_SPECTATORS) break;
      this.removeSpectator(gone.id);
    }
    if (this.spectators.length >= MAX_SPECTATORS) throw new RoomError(why === "full" ? "This room is full, and someone is already watching." : "Someone is already watching this room.");
    const playerId = this.nextId("w");
    const secret = Array.from({ length: 4 }, () => randomCode(this.deps.rng, 8)).join("");
    this.spectators.push({ id: playerId, name: (name ?? "").trim().slice(0, 24) || "Watcher", isBot: false, isHost: false, ready: false, connected: true, joinedAt: this.deps.now(), character: null, volunteer: false });
    this.state.secrets[playerId] = secret;
    return { playerId, secret };
  }

  private removeSpectator(id: string) {
    this.state.spectators = this.spectators.filter((p) => p.id !== id);
    delete this.state.secrets[id];
  }

  /** Humans whose seat nobody is using right now: the seats a late (re)joiner may take over. */
  claimableSeats(): { id: string; name: string }[] {
    return this.humans()
      .filter((p) => !p.connected)
      .map((p) => ({ id: p.id, name: p.name }));
  }

  private claimSeat(claim: string | undefined): { playerId: string; secret: string } {
    const seats = this.claimableSeats();
    // No seat to claim yet: offer the free seats (possibly none) and the option to watch.
    if (!claim) throw new SeatClaimNeeded(seats);
    const player = this.player(claim);
    if (!player || player.isBot) throw new RoomError("That seat doesn't exist.");
    if (player.connected) throw new RoomError(`Someone is already playing as ${player.name}.`);
    // Trust-based: whoever picks a free seat gets it. A fresh secret means the old device's copy
    // no longer works, so one seat can't be driven from two places.
    const secret = Array.from({ length: 4 }, () => randomCode(this.deps.rng, 8)).join("");
    this.state.secrets[player.id] = secret;
    player.connected = true;
    delete player.botTakeover;
    this.syncClock();
    return { playerId: player.id, secret };
  }

  setConnected(playerId: string, connected: boolean): boolean {
    const p = this.player(playerId);
    if (!p || p.connected === connected) return false;
    p.connected = connected;
    if (connected) delete p.botTakeover;
    // A host who leaves hands the crown to the next connected human.
    if (!connected && p.isHost) {
      const next = this.humans().find((h) => h.connected && h.id !== p.id);
      if (next) {
        p.isHost = false;
        next.isHost = true;
      }
    }
    this.syncClock();
    return true;
  }

  /**
   * Marks exactly the given humans as connected (used when a room wakes up and its sockets may
   * have been dropped without close events, e.g. after a deploy). Returns true if anything changed.
   */
  syncConnections(connected: Set<string>): boolean {
    let changed = false;
    for (const p of [...this.humans(), ...this.spectators]) changed = this.setConnected(p.id, connected.has(p.id)) || changed;
    return changed;
  }

  private removePlayer(id: string) {
    this.state.players = this.state.players.filter((p) => p.id !== id);
    delete this.state.secrets[id];
    if (this.state.hostThief === id) this.state.hostThief = null;
  }

  private dropSpectator(id: string, message: string, result: HandleResult) {
    this.removeSpectator(id);
    (result.dropped ??= []).push({ playerId: id, message });
  }

  /** Both players are detectives in the current round (for team-only messages). */
  sameTeam(a: string, b: string): boolean {
    const g = this.state.game;
    return !!g && g.phase !== "roundOver" && isDetective(g, a) && isDetective(g, b);
  }

  // --- messages -------------------------------------------------------------------------------

  handle(playerId: string, msg: ClientMessage): HandleResult {
    const result: HandleResult = { changed: false, outbound: [] };
    try {
      this.dispatch(playerId, msg, result);
    } catch (err) {
      if (err instanceof RoomError || err instanceof GameError) {
        result.outbound.push({ to: "self", msg: { t: "error", message: err.message } });
        return result;
      }
      throw err;
    }
    if (result.changed) this.syncClock();
    return result;
  }

  private dispatch(playerId: string, msg: ClientMessage, result: HandleResult) {
    const me = this.player(playerId);
    if (!me) throw new RoomError("You're not in this room.");
    if (this.isSpectator(playerId) && !["ping", "setName", "emote", "sit"].includes(msg.t)) throw new RoomError("You're watching: take a seat in the lobby to play.");

    switch (msg.t) {
      case "sit": {
        this.requireLobby();
        if (!this.isSpectator(playerId)) return;
        if (this.state.players.length >= MAX_SEATS) {
          const bot = [...this.state.players].reverse().find((p) => p.isBot);
          if (!bot) throw new RoomError("Every seat is taken.");
          this.removePlayer(bot.id);
        }
        this.state.spectators = this.spectators.filter((p) => p.id !== playerId);
        me.isHost = this.humans().length === 0;
        me.character = this.freeCharacter();
        const firstBot = this.state.players.findIndex((p) => p.isBot);
        if (firstBot >= 0) this.state.players.splice(firstBot, 0, me);
        else this.state.players.push(me);
        result.changed = true;
        return;
      }

      case "ping":
        result.outbound.push({ to: "self", msg: { t: "pong" } });
        return;

      case "setName":
        me.name = msg.name;
        result.changed = true;
        return;

      case "setReady":
        this.requireLobby();
        me.ready = msg.ready;
        result.changed = true;
        this.maybeStart();
        return;

      case "setCharacter": {
        this.requireLobby();
        if (msg.character && this.state.players.some((p) => p.id !== playerId && p.character === msg.character)) {
          throw new RoomError("Someone else already picked that detective.");
        }
        me.character = msg.character;
        result.changed = true;
        return;
      }

      case "volunteer":
        this.requireLobby();
        me.volunteer = msg.on;
        result.changed = true;
        return;

      case "settings": {
        this.requireHost(playerId);
        this.requireLobby();
        const s = this.state.settings;
        this.state.settings = { ...s, ...msg.patch, rules: { ...s.rules, ...msg.patch.rules } };
        // Who may watch isn't a rule of the game: it shouldn't make everyone ready up again.
        if (Object.keys(msg.patch).some((k) => k !== "allowSpectator")) this.unreadyAll();
        if (!this.state.settings.allowSpectator) for (const w of [...this.spectators]) this.dropSpectator(w.id, "The host turned spectators off.", result);
        result.changed = true;
        return;
      }

      case "setThief": {
        this.requireHost(playerId);
        this.requireLobby();
        if (msg.playerId && !this.player(msg.playerId)) throw new RoomError("That player isn't here.");
        this.state.hostThief = msg.playerId;
        this.unreadyAll();
        result.changed = true;
        return;
      }

      case "addBot": {
        if (!this.deps.botSeats) throw new RoomError("Bots are for solo play. Online rooms need friends!");
        this.requireHost(playerId);
        this.requireLobby();
        if (this.state.players.length >= MAX_SEATS) throw new RoomError(`At most ${MAX_SEATS} seats (including bots).`);
        const used = new Set(this.state.players.map((p) => p.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.state.players.length + 1}`;
        this.state.players.push({
          id: this.nextId("bot"),
          name,
          isBot: true,
          isHost: false,
          ready: true,
          connected: true,
          joinedAt: this.deps.now(),
          character: this.freeCharacter(),
          volunteer: false,
        });
        result.changed = true;
        this.maybeStart();
        return;
      }

      case "kick": {
        this.requireHost(playerId);
        if (msg.playerId === playerId) throw new RoomError("You can't remove yourself.");
        // The spectator can be removed at any time; seats only in the lobby.
        if (this.isSpectator(msg.playerId)) {
          this.dropSpectator(msg.playerId, "The host removed you from the room.", result);
          result.changed = true;
          return;
        }
        this.requireLobby();
        this.removePlayer(msg.playerId);
        result.changed = true;
        this.maybeStart();
        return;
      }

      case "game": {
        const game = this.state.game;
        if (this.state.phase !== "game" || !game) throw new RoomError("No round is being played.");
        this.applyGame(playerId, msg.action);
        result.changed = true;
        return;
      }

      case "nextRound": {
        this.requireHost(playerId);
        const game = this.state.game;
        if (!game || game.phase !== "roundOver") throw new RoomError("The round isn't over yet.");
        const match = this.state.match;
        if (match && match.round + 1 < match.thieves.length) {
          match.round++;
          this.startRound(match.thieves[match.round]);
        } else {
          // Single round (or the match is done): play again with a new thief.
          this.startGame();
        }
        result.changed = true;
        return;
      }

      case "backToLobby": {
        this.requireHost(playerId);
        this.toLobby();
        result.changed = true;
        return;
      }

      case "botTakeover": {
        this.requireHost(playerId);
        const p = this.player(msg.playerId);
        if (!p || p.isBot) throw new RoomError("That seat isn't a player.");
        if (msg.on && p.connected) throw new RoomError(`${p.name} is still here.`);
        if (msg.on) p.botTakeover = true;
        else delete p.botTakeover;
        result.changed = true;
        return;
      }

      case "emote": {
        const now = this.deps.now();
        if (now - (this.lastEmote.get(playerId) ?? -Infinity) < EMOTE_COOLDOWN_MS) return;
        this.lastEmote.set(playerId, now);
        // Emotes are public table talk (like across a real table); both teams see them.
        const out: ServerMessage = { t: "emote", by: playerId, emote: msg.emote };
        result.outbound.push({ to: "others", msg: out }, { to: "self", msg: out });
        return;
      }

      case "pin": {
        const g = this.state.game;
        if (!g || g.phase === "roundOver" || !isDetective(g, playerId)) throw new RoomError("Only detectives can point things out to each other.");
        const board = getBoard(g.board);
        if (!(msg.x >= -0.5 && msg.y >= -0.5 && msg.x <= board.width - 0.5 && msg.y <= board.height - 0.5)) return;
        const now = this.deps.now();
        if (now - (this.lastPin.get(playerId) ?? -Infinity) < PIN_COOLDOWN_MS) return;
        this.lastPin.set(playerId, now);
        // Pins are public table talk, like emotes: detectives plan out loud with the thief listening in,
        // so everyone in the room sees where they point.
        const out: ServerMessage = { t: "pin", by: playerId, x: msg.x, y: msg.y };
        result.outbound.push({ to: "others", msg: out }, { to: "self", msg: out });
        return;
      }

      case "intent": {
        const g = this.state.game;
        if (!g || g.phase === "roundOver" || !isDetective(g, playerId)) throw new RoomError("Only detectives can show a pending choice.");
        // Relayed as-is, with no memory: it's a hint about public things, validated by whoever draws it,
        // and a reconnecting player simply sees the next change. The sender already knows what they picked.
        result.outbound.push({ to: "others", msg: { t: "intent", by: playerId, intent: msg.intent } });
        return;
      }

      case "debug":
        this.debug(playerId, msg);
        result.changed = true;
        return;
    }
  }

  private applyGame(actor: string, action: GameAction) {
    const game = this.state.game!;
    const p = this.player(actor);
    // Acting yourself takes your seat back from the bots.
    if (p?.botTakeover && !p.isBot) delete p.botTakeover;
    this.state.game = apply(game, actor, action).state;
    this.afterGameChange();
  }

  private afterGameChange() {
    const game = this.state.game;
    const match = this.state.match;
    if (!game || game.phase !== "roundOver" || !game.result || !match) return;
    // Record the round once.
    if (match.results.length === match.round) match.results.push({ thief: game.thief.controller, result: game.result });
  }

  // --- phase transitions ----------------------------------------------------------------------

  private maybeStart() {
    if (this.state.phase !== "lobby") return;
    const humans = this.humans();
    if (humans.length === 0 || !humans.every((p) => p.ready)) return;
    if (this.startBlocker()) return;
    this.startGame();
  }

  /** Picks the thief per the settings. In a match, only humans take a turn as thief. */
  private chooseThief(): string {
    const s = this.state.settings;
    const pool = s.mode === "match" ? this.humans() : this.state.players;
    const pickFrom = (list: Player[]) => shuffle(list, this.deps.rng)[0];
    if (s.thiefSelection === "host" && this.state.hostThief && pool.some((p) => p.id === this.state.hostThief)) return this.state.hostThief;
    const volunteers = pool.filter((p) => p.volunteer);
    if (s.thiefSelection === "volunteer" && volunteers.length) return pickFrom(volunteers).id;
    return pickFrom(pool).id;
  }

  private startGame() {
    const first = this.chooseThief();
    if (this.state.settings.mode === "match") {
      const humans = this.humans().map((p) => p.id);
      this.state.match = { thieves: [first, ...humans.filter((id) => id !== first)], round: 0, results: [] };
    } else {
      this.state.match = null;
    }
    this.startRound(first);
  }

  private startRound(thiefId: string) {
    const others = this.state.players.filter((p) => p.id !== thiefId);
    // Fill in missing characters, then seat the detectives: one pawn each, or two for a lone detective.
    for (const p of others) if (!p.character) p.character = this.freeCharacter(p.id);
    const pawns = others.map((p) => ({ character: p.character!, controller: p.id }));
    if (pawns.length === 1) {
      const used = new Set([pawns[0].character]);
      const second = CHARACTERS.find((c) => !used.has(c.id))!.id;
      pawns.push({ character: second, controller: pawns[0].controller });
    }
    const layout = this.state.settings.layout;
    this.state.game = createGame({
      board: layout?.kind === "remix" ? remixBoard(layout.seed) : CLASSIC_BOARD,
      rules: this.state.settings.rules,
      seed: randomSeed(this.deps.rng),
      thief: thiefId,
      detectives: pawns,
      autoReady: others.filter((p) => p.isBot).map((p) => p.id),
    });
    this.state.phase = "game";
    this.state.clock = null;
    for (const p of this.state.players) p.ready = p.isBot;
  }

  private toLobby() {
    this.state.phase = "lobby";
    this.state.game = null;
    this.state.match = null;
    this.state.clock = null;
    this.unreadyAll();
  }

  // --- clocks and bots ------------------------------------------------------------------------

  /** Who acts next on their own (bots, taken-over seats, timed-out turns), if anyone. */
  private automatedActor(): string | null {
    const game = this.state.game;
    if (this.state.phase !== "game" || !game || game.phase === "roundOver") return null;
    if (SETUP_PHASES.includes(game.phase)) {
      // Bots only set up the museum when no human detective is there to do it.
      const controllers = [...new Set(game.detectives.map((d) => d.controller))];
      const humanHere = controllers.some((c) => !this.isAutomated(c));
      if (humanHere) return null;
      return controllers.find((c) => !game.ready[c]) ?? null;
    }
    const waiting = waitingOn(game);
    const clock = this.state.clock;
    return waiting.find((id) => this.isAutomated(id) || (clock?.autoplay && id === this.turnOwner(game))) ?? null;
  }

  /** The player whose turn it is (not the thief answering a motion prompt). */
  private turnOwner(game: GameState): string | null {
    if (game.turn.kind === "thief") return game.thief.controller;
    if (game.turn.kind === "detective") return activePawn(game)!.controller;
    return null;
  }

  private turnKey(game: GameState): string {
    if (game.turn.kind === "thief") return `t${game.thief.turns}`;
    if (game.turn.kind === "detective") return `d${game.thief.turns}:${game.turn.pawn}`;
    return game.phase;
  }

  /** Brings timers in line with the current decision. Returns true if anything changed. */
  private syncClock(): boolean {
    const before = JSON.stringify(this.state.clock);
    const game = this.state.game;
    const now = this.deps.now();
    if (this.state.phase !== "game" || !game || game.phase === "roundOver") {
      this.state.clock = null;
      return before !== "null";
    }
    const key = this.turnKey(game);
    let clock = this.state.clock;
    if (!clock || clock.key !== key) {
      clock = { key, turnDeadline: null, pausedLeft: null, autoplay: false, motionDeadline: null, botAt: null };
      const owner = this.turnOwner(game);
      const timer = this.state.settings.turnTimerSec * 1000;
      if (timer > 0 && owner && !this.isAutomated(owner)) clock.turnDeadline = now + timer;
      this.state.clock = clock;
    }

    // Motion prompt: its own short countdown, which runs even if the thief is offline (D4).
    const awaiting = game.turn.kind === "detective" && game.turn.awaitingThief;
    if (awaiting && clock.motionDeadline === null && !this.isAutomated(game.thief.controller)) clock.motionDeadline = now + MOTION_RESPONSE_MS;
    if (!awaiting) clock.motionDeadline = null;

    // The turn timer pauses while its owner is offline or the thief is being asked.
    const owner = this.turnOwner(game);
    const ownerHere = !!owner && !!this.player(owner)?.connected;
    const shouldPause = awaiting || !ownerHere;
    if (clock.turnDeadline !== null && shouldPause) {
      clock.pausedLeft = Math.max(0, clock.turnDeadline - now);
      clock.turnDeadline = null;
    } else if (clock.pausedLeft !== null && !shouldPause) {
      clock.turnDeadline = now + clock.pausedLeft;
      clock.pausedLeft = null;
    }

    const actor = this.automatedActor();
    if (actor && clock.botAt === null) clock.botAt = now + this.thinkTime();
    if (!actor) clock.botAt = null;
    return JSON.stringify(this.state.clock) !== before;
  }

  private thinkTime(): number {
    const setup = !!this.state.game && SETUP_PHASES.includes(this.state.game.phase);
    const [lo, hi] = setup ? BOT_SETUP_MS : BOT_THINK_MS;
    return lo + Math.floor(this.deps.rng() * (hi - lo));
  }

  /** Runs whatever is due (bot moves, timeouts). Returns true if state changed. */
  tick(): boolean {
    let changed = false;
    for (let guard = 0; guard < 50; guard++) {
      const game = this.state.game;
      const clock = this.state.clock;
      if (this.state.phase !== "game" || !game || !clock) break;
      const now = this.deps.now();

      if (clock.motionDeadline !== null && clock.motionDeadline <= now) {
        // Out of time: answer without snipping.
        this.state.game = apply(game, game.thief.controller, { a: "motionResponse", snip: false }).state;
        clock.botAt = null;
      } else if (clock.turnDeadline !== null && clock.turnDeadline <= now && !clock.autoplay) {
        clock.autoplay = true;
        clock.turnDeadline = null;
      } else if (clock.botAt !== null && clock.botAt <= now) {
        const actor = this.automatedActor();
        clock.botAt = null;
        if (actor) this.botStep(actor);
      } else {
        break;
      }
      changed = true;
      this.afterGameChange();
      this.syncClock();
    }
    return changed;
  }

  private botStep(actor: string) {
    const game = this.state.game!;
    const role: Viewer = isThief(game, actor) ? "thief" : "detectives";
    // Humans whose turn ran out get the full-strength bot; bot seats play at the chosen skill.
    const level = this.player(actor)?.isBot ? (this.state.settings.botSkill === "rookie" ? "rookie" : "smart") : "smart";
    const action = botAction(viewFor(game, role), actor, this.deps.rng, level);
    if (!action) return;
    try {
      this.state.game = apply(game, actor, action).state;
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      // A bot proposing something illegal is a bug; don't stall the game on it.
      console.error(`Bot ${actor} tried ${JSON.stringify(action)}: ${err.message}`);
      const fallback = botAction(viewFor(game, role), actor, this.deps.rng, "random");
      if (fallback) this.state.game = apply(game, actor, fallback).state;
    }
  }

  nextAlarm(): number | null {
    const c = this.state.clock;
    if (!c || this.state.phase !== "game") return null;
    const times = [c.botAt, c.turnDeadline, c.motionDeadline].filter((t): t is number => t !== null);
    return times.length ? Math.min(...times) : null;
  }

  // --- debug ----------------------------------------------------------------------------------

  private debug(playerId: string, msg: Extract<ClientMessage, { t: "debug" }>) {
    if (CHEAT_COMMANDS.includes(msg.cmd) && !this.deps.cheats) throw new RoomError("Peeking is only allowed in solo mode and local dev builds.");
    if (!this.deps.cheats) this.requireHost(playerId);
    const game = this.state.game;
    const needGame = () => {
      if (!game) throw new RoomError("No round is being played.");
      return game;
    };

    switch (msg.cmd) {
      case "startNow":
        this.requireLobby();
        if (this.startBlocker()) throw new RoomError(this.startBlocker()!);
        this.startGame();
        return;
      case "autoSetup": {
        const g = structuredClone(needGame());
        if (!SETUP_PHASES.includes(g.phase)) throw new RoomError("Setup is over.");
        autoPlace(g, stateRng(g));
        this.state.game = g;
        return;
      }
      case "skipToPlay": {
        const g = structuredClone(needGame());
        debugOps.skipSetup(g);
        this.state.game = g;
        return;
      }
      case "forceRoll": {
        const g = needGame();
        debugOps.forceRoll(g, { move: msg.move ?? 6, action: msg.action ?? "eye" });
        return;
      }
      case "givePaintings":
        debugOps.giveThiefPaintings(needGame(), msg.n ?? 3);
        return;
      case "cutPower":
        debugOps.setPower(needGame(), true);
        return;
      case "restorePower":
        debugOps.setPower(needGame(), false);
        return;
      case "endRound":
        debugOps.endRound(needGame(), msg.winner ?? "detectives");
        this.afterGameChange();
        return;
      case "viewAs":
        if (msg.as) this.viewAs.set(playerId, msg.as);
        else this.viewAs.delete(playerId);
        return;
    }
  }

  // --- views ----------------------------------------------------------------------------------

  /** What the "My rooms" list shows for this room. */
  summary(): RoomSummary {
    const humans = this.humans();
    const g = this.state.game;
    const m = this.state.match;
    let detail = "In the lobby";
    if (g) {
      const stage = SETUP_PHASES.includes(g.phase) ? "Setting up" : g.phase === "play" ? "Heist in progress" : "Round over";
      detail = m ? `Round ${m.round + 1} of ${m.thieves.length} · ${stage}` : stage;
    }
    return { phase: this.state.phase, players: humans.map((p) => p.name), bots: this.state.players.length - humans.length, detail };
  }

  roleOf(playerId: string): Role | null {
    const g = this.state.game;
    if (this.isSpectator(playerId)) return "spectator";
    if (!g) return null;
    if (isThief(g, playerId)) return "thief";
    if (isDetective(g, playerId)) return "detective";
    return "spectator";
  }

  private matchView(): MatchView | null {
    const g = this.state.game;
    const m = this.state.match;
    const ids = this.state.players.map((p) => p.id);
    if (!m) {
      if (!g) return null;
      const results = g.result ? [{ thief: g.thief.controller, result: g.result }] : [];
      return { mode: "single", round: 0, total: 1, thieves: [g.thief.controller], results, standings: standings(ids, results), done: !!g.result };
    }
    return {
      mode: "match",
      round: m.round,
      total: m.thieves.length,
      thieves: m.thieves.slice(),
      results: structuredClone(m.results),
      standings: standings(m.thieves, m.results),
      done: m.results.length === m.thieves.length,
    };
  }

  private clockView(): ClockView | null {
    const c = this.state.clock;
    if (!c) return null;
    if (c.motionDeadline !== null) return { kind: "motion", deadline: c.motionDeadline, pausedLeft: null, autoplay: false };
    if (c.turnDeadline === null && c.pausedLeft === null && !c.autoplay) return null;
    return { kind: "turn", deadline: c.turnDeadline, pausedLeft: c.pausedLeft, autoplay: c.autoplay };
  }

  viewFor(viewer: string): RoomView {
    const g = this.state.game;
    const role = this.roleOf(viewer);
    const peek = this.deps.cheats ? (this.viewAs.get(viewer) ?? null) : null;
    const gameViewer: Viewer = peek ?? (role === "thief" ? "thief" : role === "detective" ? "detectives" : "spectator");
    return {
      code: this.state.code,
      phase: this.state.phase,
      you: viewer,
      players: this.state.players.map((p) => ({ ...p })),
      spectators: this.spectators.map((p) => ({ ...p })),
      settings: structuredClone(this.state.settings),
      hostThief: this.state.hostThief,
      startBlocker: this.state.phase === "lobby" ? this.startBlocker() : null,
      role,
      game: g ? viewFor(g, gameViewer) : null,
      match: this.matchView(),
      clock: this.clockView(),
      waitingOn: g ? waitingOn(g) : [],
      cheats: this.deps.cheats,
      viewAs: peek === "spectator" ? null : peek,
      serverNow: this.deps.now(),
    };
  }
}
