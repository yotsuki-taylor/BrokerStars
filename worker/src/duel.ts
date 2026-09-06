/**
 * A duel: one Durable Object, one match, two people.
 *
 * The object *is* the match. It builds the state with the same `createMatch`
 * the game has always used, steps it on its own clock, and sends both players a
 * picture of every tick; a tap arrives as a message and goes through the same
 * `applyAction` a bot's does. Nothing is simulated in either browser.
 *
 * That is the whole design decision and it is worth the paragraph. The obvious
 * alternative — both clients run the seed, and the object only orders the
 * inputs — is cheaper on bandwidth and was rejected: an ability moves prices,
 * so two clients that disagree by one tick about when one went off draw two
 * different charts for the rest of the match, and there is no way for either to
 * find out. Here the chart is the same because there is only one of it. The
 * abilities land on the same state for the same reason, and so does the result,
 * which is why the stars a duel pays can be written straight to the board
 * without anybody being asked what they won.
 *
 * What this object deliberately does not do is survive its own eviction. The
 * match lives in memory for the eighty seconds it lasts, held there by two open
 * sockets and a running timer; only the invitation is written to storage, and
 * only so that the object created by `POST /duel/new` is still there when the
 * guest turns up eight minutes later.
 */

import { CONFIG } from '../../src/sim/config';
import { pickCompanies } from '../../src/sim/companies';
import { useAbility } from '../../src/sim/abilities';
import { createMatch, resign, step } from '../../src/sim/match';
import { Rng } from '../../src/sim/rng';
import { TRADE_FRACTION, applyAction, undoLast } from '../../src/sim/trading';
import type { MatchState } from '../../src/sim/types';
import { perksFor } from '../../src/ui/perks';
import { RARITIES, SLOTS, type Outfit } from '../../src/ui/wardrobe';
import {
  DUEL_INTRO_MS,
  DUEL_TTL_MS,
  type ClientMsg,
  type DuelError,
  type DuelAward,
  type ServerMsg,
} from '../../src/duel/protocol';
import { otherSeat, ordered, snapshotFor, syncFor, type Seat } from '../../src/duel/snapshot';
import { award, clearedBar, record, topLeague, type Env, type Outcome } from './results';
import { verifyInitData } from './telegram';

interface Player {
  id: string;
  name: string;
  outfit: Outfit;
  /** the league this player is paid at, read off the board at kick-off */
  payLeague: number;
}

interface Meta {
  /** the league whose companies are dealt — the host's */
  league: number;
  expiresAt: number;
  players: [Player | null, Player | null];
  /** 'lobby' until both are in, then 'live', then 'done' */
  phase: 'lobby' | 'live' | 'done';
}

/**
 * A socket that says nothing for this long has not introduced itself and is
 * not a player. Long enough for a phone waking up, short enough that an
 * abandoned connection does not hold a seat.
 */
const HELLO_TIMEOUT_MS = 15_000;

/** Taps per second one socket may send before it is simply ignored. */
const MAX_MESSAGES_PER_SECOND = 25;

/** How long the finished object hangs around before it clears itself out. */
const LINGER_MS = 120_000;

/** Outfit from an untrusted message: five known slots, five known rarities, nothing else. */
function cleanOutfit(raw: unknown): Outfit {
  const out: Outfit = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const slot of SLOTS) {
    const r = src[slot];
    if (typeof r === 'string' && (RARITIES as string[]).includes(r)) {
      out[slot] = r as Outfit[typeof slot];
    }
  }
  return out;
}

export class Duel implements DurableObject {
  private meta: Meta | null = null;
  private loaded = false;

  /** the live sockets, by seat; a reconnect replaces the one it finds */
  private sockets: [WebSocket | null, WebSocket | null] = [null, null];
  private match: MatchState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** wall clock the tick numbers are measured from, so drift cannot accumulate */
  private startAt = 0;
  /** how much of each trader's log and of the news each seat has already been sent */
  private sentTrades: [number, number] = [0, 0];
  private sentNews = 0;
  /** what the match paid, kept so a reconnect after the whistle is still told */
  private awards: [DuelAward | null, DuelAward | null] = [null, null];

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  /* ------------------------------------------------------------- the routes */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === '/new' && request.method === 'POST') {
      const body = (await request.json()) as {
        id?: string;
        name?: string;
        outfit?: unknown;
        league?: number;
      };
      if (this.meta) return json({ error: 'taken' }, 409);
      const league = Math.min(4, Math.max(0, Math.floor(Number(body.league) || 0)));
      const expiresAt = Date.now() + DUEL_TTL_MS;
      this.meta = {
        league,
        expiresAt,
        players: [
          {
            id: String(body.id),
            name: String(body.name ?? 'PLAYER').slice(0, 24),
            outfit: cleanOutfit(body.outfit),
            payLeague: 0,
          },
          null,
        ],
        phase: 'lobby',
      };
      await this.save();
      // sweep the invitation away the moment it stops being one
      await this.state.storage.setAlarm(expiresAt + LINGER_MS);
      return json({ ok: true, expiresAt });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.accept(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'no such route' }, 404);
  }

  async alarm(): Promise<void> {
    await this.load();
    // A match that is still running keeps the object; anything else is over
    // one way or another and the invitation should not outlive it.
    if (this.meta?.phase === 'live' && this.match && !this.match.finished) {
      await this.state.storage.setAlarm(Date.now() + LINGER_MS);
      return;
    }
    this.stopTimer();
    for (const s of this.sockets) close(s);
    this.sockets = [null, null];
    await this.state.storage.deleteAll();
    this.meta = null;
  }

  /* ----------------------------------------------------------- the lobby */

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.meta = (await this.state.storage.get<Meta>('meta')) ?? null;
    this.loaded = true;
  }

  private async save(): Promise<void> {
    if (this.meta) await this.state.storage.put('meta', this.meta);
  }

  /**
   * A fresh socket. It holds no seat until it says who it is, and the timer
   * below is what stops an anonymous one from sitting on the object forever.
   */
  private accept(ws: WebSocket): void {
    ws.accept();
    let seat: Seat | null = null;
    let windowStart = 0;
    let inWindow = 0;

    const hello = setTimeout(() => {
      if (seat === null) close(ws);
    }, HELLO_TIMEOUT_MS);

    ws.addEventListener('message', (event) => {
      // A flood is not an error worth answering; it is one worth not reading.
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        inWindow = 0;
      }
      if (++inWindow > MAX_MESSAGES_PER_SECOND) return;

      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(event.data)) as ClientMsg;
      } catch {
        return;
      }

      // A keepalive is the client having nothing to say and saying it anyway,
      // so that the connection does not look abandoned to whatever is between
      // us. There is nothing to answer and nothing to charge it against.
      if (msg?.k === 'ping') return;

      if (msg?.k === 'hello') {
        if (seat !== null) return;
        void this.seat(ws, msg).then((s) => {
          seat = s;
          if (s !== null) clearTimeout(hello);
        });
        return;
      }
      if (seat === null) return;
      this.command(seat, msg);
    });

    const drop = () => {
      clearTimeout(hello);
      if (seat === null) return;
      if (this.sockets[seat] === ws) {
        this.sockets[seat] = null;
        this.sendTo(otherSeat(seat), { k: 'gone' });
      }
    };
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);
  }

  /** Check the signature, find or take a seat, and say what happens next. */
  private async seat(ws: WebSocket, msg: Extract<ClientMsg, { k: 'hello' }>): Promise<Seat | null> {
    const fail = (reason: DuelError): null => {
      send(ws, { k: 'error', reason });
      close(ws);
      return null;
    };

    if (!this.env.BOT_TOKEN) return fail('noserver');
    const caller = await verifyInitData(String(msg.initData ?? ''), this.env.BOT_TOKEN);
    if (!caller) return fail('badsig');

    await this.load();
    const meta = this.meta;
    if (!meta) return fail('notfound');

    const host = meta.players[0];
    const guest = meta.players[1];
    let seat: Seat;

    if (host && host.id === caller.id) seat = 0;
    else if (guest && guest.id === caller.id) seat = 1;
    else if (meta.phase !== 'lobby') return fail('started');
    else if (guest) return fail('full');
    else if (Date.now() > meta.expiresAt) return fail('expired');
    else {
      // Note what the first branch already covers: a host who opens their own
      // link comes back as the host rather than sitting down opposite
      // themselves, so there is no duelling yourself for the winner's stars.
      seat = 1;
      meta.players[1] = {
        id: caller.id,
        name: String(msg.name ?? caller.name).slice(0, 24) || caller.name,
        outfit: cleanOutfit(msg.outfit),
        payLeague: 0,
      };
      await this.save();
    }

    // A reconnect takes the seat back off whatever is still holding it.
    const previous = this.sockets[seat];
    if (previous && previous !== ws) close(previous);
    this.sockets[seat] = ws;

    if (meta.phase === 'lobby') {
      this.broadcastLobby();
      if (meta.players[0] && meta.players[1]) await this.begin();
    } else {
      this.resume(seat);
    }
    return seat;
  }

  private broadcastLobby(): void {
    const meta = this.meta;
    if (!meta) return;
    for (const s of [0, 1] as Seat[]) {
      const rival = meta.players[otherSeat(s)];
      this.sendTo(s, {
        k: 'lobby',
        you: s,
        rival: rival ? { name: rival.name, outfit: rival.outfit } : null,
        league: meta.league,
        expiresAt: meta.expiresAt,
      });
    }
  }

  /* -------------------------------------------------------------- the match */

  private async begin(): Promise<void> {
    const meta = this.meta;
    if (!meta || meta.phase !== 'lobby') return;
    const [a, b] = meta.players;
    if (!a || !b) return;

    // What each of them is paid at. Read now rather than at the whistle so a
    // match handed in mid-duel cannot change what this one is worth.
    a.payLeague = Math.min(meta.league, await topLeague(this.env, a.id));
    b.payLeague = Math.min(meta.league, await topLeague(this.env, b.id));

    meta.phase = 'live';
    await this.save();

    const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
    const perks = [
      perksFor(a.outfit, CONFIG.match.startingCash),
      perksFor(b.outfit, CONFIG.match.startingCash),
    ];
    // A clean draw for the league. The board perks — reroll, pin, ban, the
    // whole of what the HEAD slot sells — are a single-player bargain with the
    // dealer, and there is no honest way for two of them to be struck at once
    // over one board.
    const stocks = pickCompanies(meta.league, new Rng(seed ^ 0x1b873593), 3);

    this.match = createMatch(seed, CONFIG, {
      stocks,
      traders: [
        {
          name: a.name.toUpperCase(),
          kind: 'human',
          preset: 'medium',
          perks: perks[0].trader,
          ability: perks[0].ui.ability,
        },
        {
          name: b.name.toUpperCase(),
          kind: 'human',
          preset: 'medium',
          perks: perks[1].trader,
          ability: perks[1].ui.ability,
        },
      ],
    });

    for (const s of [0, 1] as Seat[]) {
      this.sendTo(s, {
        k: 'setup',
        seed,
        league: meta.league,
        stocks,
        names: ordered(s, [a.name.toUpperCase(), b.name.toUpperCase()]),
        outfits: ordered(s, [a.outfit, b.outfit]),
        abilities: ordered(s, [perks[0].ui.ability, perks[1].ui.ability]),
        startsInMs: DUEL_INTRO_MS,
      });
    }

    // The versus screen and the 3–2–1 run on both phones at once; the object
    // waits the same span out on its own clock rather than asking either of
    // them when it is ready, so nobody's slow phone delays the other's start.
    this.startAt = Date.now() + DUEL_INTRO_MS;
    this.arm();
  }

  /** Everything a client that arrived late, or came back, needs to draw the match so far. */
  private resume(seat: Seat): void {
    const meta = this.meta;
    const st = this.match;
    if (!meta) return;
    if (!st) {
      // The object was evicted with the match in it. Nothing can be salvaged
      // and pretending otherwise would be worse than saying so.
      this.sendTo(seat, { k: 'error', reason: 'notfound' });
      return;
    }
    const perks = st.traders.map((t) => t.ability);
    this.sendTo(seat, {
      k: 'setup',
      seed: st.seed,
      league: meta.league,
      stocks: st.cfg.stocks,
      names: ordered(seat, [st.traders[0].name, st.traders[1].name]),
      outfits: ordered(seat, [
        meta.players[0]?.outfit ?? {},
        meta.players[1]?.outfit ?? {},
      ]),
      abilities: ordered(seat, [perks[0], perks[1]]),
      startsInMs: null,
    });
    this.sendTo(seat, {
      k: 'sync',
      sync: syncFor(st, seat),
      tick: snapshotFor(st, seat, [], []),
    });
    // A duel that is already over still owes the reconnecting player the
    // number their result screen is waiting for.
    if (this.awards[seat]) this.sendTo(seat, { k: 'end', award: this.awards[seat]! });
    this.sendTo(otherSeat(seat), { k: 'back' });
  }

  /** Queue the next tick against the wall clock, so 160 of them still take 80 seconds. */
  private arm(): void {
    this.stopTimer();
    const st = this.match;
    if (!st || st.finished) return;
    const due = this.startAt + (st.tick + 1) * st.cfg.match.tickMs;
    this.timer = setTimeout(() => this.pump(), Math.max(0, due - Date.now()));
  }

  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const st = this.match;
    if (!st) return;
    try {
      step(st);
      this.broadcastTick();
    } catch (err) {
      console.error('duel tick failed', err);
    }
    if (st.finished) void this.settle();
    else this.arm();
  }

  /* --------------------------------------------------------- what they send */

  private command(seat: Seat, msg: ClientMsg): void {
    const st = this.match;
    if (!st || st.finished) return;
    // Nothing anybody taps counts before the whistle.
    if (Date.now() < this.startAt) return;

    let changed = false;
    switch (msg?.k) {
      case 'act': {
        const stock = Math.floor(Number(msg.stock));
        if (!(stock >= 0 && stock < st.stocks.length)) return;
        if (msg.side !== 'buy' && msg.side !== 'sell') return;
        changed = Boolean(
          applyAction(st, { trader: seat, stock, side: msg.side, fraction: TRADE_FRACTION }),
        );
        break;
      }
      case 'undo':
        changed = undoLast(st, seat);
        break;
      case 'ability':
        changed = useAbility(st, seat);
        break;
      case 'resign':
        resign(st, seat);
        changed = true;
        break;
      default:
        return;
    }

    if (!changed) return;
    // Answer at once rather than at the next tick: half a second between the
    // tap and the number moving is the difference between a trade and a lag.
    this.broadcastTick();
    if (st.finished) void this.settle();
  }

  /* ------------------------------------------------------------- the picture */

  private broadcastTick(): void {
    const st = this.match;
    if (!st) return;
    const news = st.news.slice(this.sentNews);
    this.sentNews = st.news.length;
    const trades = [
      ...st.traders[0].trades.slice(this.sentTrades[0]),
      ...st.traders[1].trades.slice(this.sentTrades[1]),
    ];
    this.sentTrades = [st.traders[0].trades.length, st.traders[1].trades.length];

    for (const s of [0, 1] as Seat[]) {
      this.sendTo(s, { k: 'tick', tick: snapshotFor(st, s, news, trades) });
    }
  }

  /* -------------------------------------------------------------- the payout */

  private async settle(): Promise<void> {
    const meta = this.meta;
    const st = this.match;
    if (!meta || !st || meta.phase === 'done') return;
    meta.phase = 'done';
    this.stopTimer();
    await this.save();

    const start = st.cfg.match.startingCash;
    const seed = st.seed.toString(36);

    for (const s of [0, 1] as Seat[]) {
      const player = meta.players[s];
      if (!player) continue;
      const t = st.traders[s];
      const outcome: Outcome =
        st.winner === null ? 'draw' : st.winner === s ? 'win' : 'loss';
      const well = clearedBar(t.netWorth, start);
      // Giving up pays nothing, exactly as it does against a bot — otherwise an
      // early lead could be cashed out by quitting.
      const paid =
        st.resigned === s ? { win: 0, profit: 0, total: 0, league: player.payLeague } : award(player.payLeague, outcome, well);

      this.awards[s] = paid;
      this.sendTo(s, { k: 'end', award: paid });

      try {
        await record(
          this.env,
          { id: player.id, name: player.name },
          {
            seed,
            league: player.payLeague,
            outcome,
            netWorth: Math.round(Math.max(0, t.netWorth)),
            tradedWell: well,
            stars: paid.total,
          },
        );
      } catch (err) {
        // The board is a shop window, never a condition of play: a duel that
        // could not be filed is still a duel that was won.
        console.error('duel result not recorded', err);
      }
    }

    await this.state.storage.setAlarm(Date.now() + LINGER_MS);
  }

  private sendTo(seat: Seat, msg: ServerMsg): void {
    send(this.sockets[seat], msg);
  }
}

/* ------------------------------------------------------------------ helpers */

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (!ws) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* the socket went away between the check and the send */
  }
}

function close(ws: WebSocket | null): void {
  try {
    ws?.close(1000, 'done');
  } catch {
    /* already gone */
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
