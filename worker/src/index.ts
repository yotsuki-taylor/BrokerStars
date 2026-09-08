/**
 * The leaderboard behind the RATING tab, and the object behind a duel.
 *
 * Two things the client cannot be trusted with, and the whole point of putting
 * a server here at all:
 *
 * WHO. `Telegram.WebApp.initDataUnsafe` is unsigned — src/ui/admin.ts says so
 * in as many words — but `initData` is not: it comes with an HMAC over the bot
 * token, so a Worker holding that token can tell a real Telegram user from a
 * curl. Nothing is written without one. That check is `telegram.ts`.
 *
 * WHAT IT PAID. The client does not get to say how many coins it earned. For a
 * match against a bot it says what happened — which league, won or lost,
 * whether the match cleared the profit bar — and the server works out the
 * payout from its own copy of the table (`results.ts`). For a duel it does not
 * even say that: the Durable Object in `duel.ts` ran the match itself and knows.
 *
 * WHAT IS OWNED. The room behind the menu and the clothes on the trader used to
 * live in one browser's `localStorage` and nowhere else, so a cleared cache or
 * a new phone was the end of them. They live here now (`profile.ts`), which is
 * what makes them survive both — and, not incidentally, what lets a duel dress
 * each side out of this database rather than out of what their browser claims
 * to be wearing.
 *
 * The board still ranks coins EARNED, which the server adds up itself. What a
 * player has in hand is that minus what they have spent, worked out on read, so
 * buying a hat still cannot cost anybody their place in the table.
 *
 * The bot lives here too, on `/tg` (see `bot.ts`). It has two jobs, both of
 * them one message long, and this is where the token already is — so there is
 * no process to keep alive anywhere.
 */

import { dayOf } from '../../src/daily/protocol';
import { DUEL_CODE_LENGTH, normalizeCode } from '../../src/duel/protocol';
import { HISTORY_DAYS, marketFor } from '../../src/market/protocol';
import { cleanClaim, cleanOutfit, cleanSeen } from '../../src/profile/protocol';
import { RARITIES, SLOTS, type Rarity, type Slot } from '../../src/ui/wardrobe';
import { answerUpdate } from './bot';
import * as profiles from './profile';
import {
  REWARDS,
  alreadyPaid,
  record,
  topLeague,
  type Env,
  type Outcome,
  type Row,
} from './results';
import { botUsername, type Caller, sameSecret, verifyInitData, webhookSecret } from './telegram';

export { Duel } from './duel';
export { verifyInitData } from './telegram';
export type { Env } from './results';

/**
 * Nothing can be handed in faster than a match can be played. A match is 80
 * seconds; 45 leaves room for a slow clock without leaving room for a script.
 *
 * A duel does not pass this way at all — the object that ran it writes the
 * result itself, and a server that watched the match has nothing to rate-limit.
 */
const MIN_SECONDS_BETWEEN_RESULTS = 45;

/* ------------------------------------------------------------- plumbing */

const CORS = {
  // The game is served from somewhere else entirely (GitHub Pages today), and
  // the board is public reading anyway. Nothing here is a cookie or a session,
  // so there is no cross-site request to forge: every write carries its own
  // Telegram signature in the body.
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

const bad = (status: number, error: string) => json({ error }, status);

/* ------------------------------------------------------------ the board */

async function top(env: Env, limit: number, me: string | null) {
  const { results } = await env.DB.prepare(
    // `stars` twice: once under the column's own name and once under the one
    // the game calls it now. A browser holding a bundle from before the rename
    // reads the first, an updated one reads the second, and neither cares which
    // side was deployed first. The alias goes when the old bundles are gone.
    `SELECT id, name, stars, stars AS coins, matches, wins, best_net_worth, top_league
       FROM players
      WHERE matches > 0
      ORDER BY stars DESC, updated_at ASC
      LIMIT ?1`,
  )
    .bind(limit)
    .all<Row>();

  const rows = (results ?? []).map((r, i) => ({ rank: i + 1, ...r, you: r.id === me }));

  // Somebody outside the top slice still wants to know where they stand, and
  // COUNT of everyone ahead is that answer in one query rather than a scan.
  let mine = null;
  if (me && !rows.some((r) => r.you)) {
    const row = await env.DB.prepare(
      `SELECT id, name, stars, stars AS coins, matches, wins, best_net_worth, top_league
         FROM players WHERE id = ?1`,
    )
      .bind(me)
      .first<Row>();
    if (row) {
      const ahead = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM players WHERE matches > 0 AND stars > ?1`,
      )
        .bind(row.stars)
        .first<{ n: number }>();
      mine = { rank: (ahead?.n ?? 0) + 1, ...row, you: true };
    }
  }

  return json({ top: rows, me: mine });
}

/* ---------------------------------------------------------- handing one in */

interface Submission {
  initData?: unknown;
  seed?: unknown;
  league?: unknown;
  outcome?: unknown;
  netWorth?: unknown;
  tradedWell?: unknown;
  /** the client's name for this match — see `alreadyPaid` in results.ts */
  token?: unknown;
  /** for the shelf: went broke, how many trades, which companies were up */
  bankrupt?: unknown;
  trades?: unknown;
  companies?: unknown;
}

/**
 * A submission is repeatable, and this is the length of the name it repeats
 * under. The client mints a UUID; anything longer than this is not one, and is
 * cut rather than refused.
 */
const MAX_TOKEN = 64;

async function submit(request: Request, env: Env) {
  if (!env.BOT_TOKEN) {
    // Fail closed. Without the token nothing can be told from anything, and a
    // board that accepts unsigned scores is worse than no board.
    return bad(503, 'no bot token configured');
  }

  let body: Submission;
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  const initData = typeof body.initData === 'string' ? body.initData : '';
  const caller = initData ? await verifyInitData(initData, env.BOT_TOKEN) : null;
  if (!caller) return bad(401, 'bad signature');

  const league = Number(body.league);
  const outcome = String(body.outcome) as Outcome;
  const netWorth = Math.round(Number(body.netWorth));
  const seed = String(body.seed ?? '').slice(0, 32);
  const tradedWell = body.tradedWell === true;
  const token = String(body.token ?? '').slice(0, MAX_TOKEN);
  // What the shelf needs and the board does not. All three are the client's
  // word, and all three are worth about as much as its word for the outcome —
  // which the replay check in `results` is there to settle one day.
  const bankrupt = body.bankrupt === true;
  const trades = Math.max(0, Math.floor(Number(body.trades) || 0));
  const companies = cleanSeen(body.companies);

  if (!token) return bad(400, 'no token');

  /**
   * Handed in already? Then this is the same match arriving twice, which is a
   * thing the client is *encouraged* to do: a submission whose answer was lost
   * to a dropped connection is queued and sent again, because the alternative
   * is a player who played a match and was not paid for it.
   *
   * The answer is the answer the first attempt earned, so a retry looks like a
   * success to everything downstream and nothing is added to anybody's total.
   */
  const paid = await alreadyPaid(env, token);
  if (paid !== null) return json({ ok: true, stars: paid, already: true });

  if (!Number.isInteger(league) || league < 0 || league >= REWARDS.length) {
    return bad(400, 'no such league');
  }
  if (outcome !== 'win' && outcome !== 'draw' && outcome !== 'loss') return bad(400, 'bad outcome');
  // A book cannot be worth less than nothing or more than the game can produce;
  // both ends are guards against a fat finger as much as against a liar.
  if (!Number.isFinite(netWorth) || netWorth < 0 || netWorth > 10_000_000) {
    return bad(400, 'net worth out of range');
  }

  const now = Date.now();
  const existing = await env.DB.prepare(`SELECT updated_at FROM players WHERE id = ?1`)
    .bind(caller.id)
    .first<{ updated_at: number }>();

  if (existing && now - existing.updated_at < MIN_SECONDS_BETWEEN_RESULTS * 1000) {
    return bad(429, 'too soon');
  }

  const table = REWARDS[league];
  const base = outcome === 'win' ? table.win : outcome === 'draw' ? table.draw : 0;
  const stars = base + (tradedWell ? table.profit : 0);

  try {
    await record(env, caller, { seed, league, outcome, netWorth, tradedWell, stars, token });
  } catch (err) {
    // Two retries in flight at once both got past the check above, and the
    // UNIQUE index caught the loser. The batch rolled back, so nothing was paid
    // twice — and from the caller's side this is a success, because the match
    // it was asking about is in fact recorded.
    const already = await alreadyPaid(env, token);
    if (already === null) throw err;
    return json({ ok: true, stars: already, already: true });
  }

  // Recorded for the first time, so the ladder and the shelf hear about it
  // once. Both are the server's arithmetic for the reason the payout is: a
  // league that opens, or an award that lands, because a browser said so is
  // not one anybody earned. A surrender arrives here as a loss and banks
  // nothing; a duel never arrives at all, it is settled where it was played.
  try {
    await profiles.settle(env, caller, {
      league,
      facts: { outcome, netWorth, tradedWell, bankrupt, trades, duel: false },
      companies,
    });
  } catch (err) {
    // The match is recorded and paid either way, and none of this is worth
    // failing the whole submission over — which would only have the client
    // send it to us a second time.
    console.error('match not settled', err);
  }

  return json({ ok: true, stars });
}

/* -------------------------------------------------------------- the profile */

/**
 * Every profile route starts the same way: a body, a signature, and the row
 * that signature belongs to. Nothing is read here without one either — a
 * wardrobe is not the leaderboard, and there is nobody it is public reading
 * for.
 */
async function whoIsAsking(
  request: Request,
  env: Env,
): Promise<{ caller: Caller; body: Record<string, unknown> } | Response> {
  if (!env.BOT_TOKEN) return bad(503, 'no bot token configured');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad(400, 'not json');
  }
  const initData = typeof body.initData === 'string' ? body.initData : '';
  const caller = initData ? await verifyInitData(initData, env.BOT_TOKEN) : null;
  if (!caller) return bad(401, 'bad signature');
  return { caller, body };
}

/** The whole profile, every time: the client's job is to draw what comes back. */
const sent = (a: profiles.Applied) =>
  json({ ok: !a.error, error: a.error, profile: profiles.view(a.held, a.earned, a.at) });

/**
 * Where a session starts. The body may carry `claim` — what this browser had in
 * `localStorage` before any of it was kept here — and `profile.ts` decides
 * whether that is still worth believing.
 */
async function openProfile(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  const claim = body.claim == null ? null : cleanClaim(body.claim, profiles.LEAGUES);
  return sent(await profiles.open(env, caller, claim));
}

/** Which slot and rung a message is about, or nothing if it is about neither. */
function itemIn(body: Record<string, unknown>): { slot: Slot; rarity: Rarity } | null {
  const slot = String(body.slot ?? '');
  const rarity = String(body.rarity ?? '');
  if (!(SLOTS as readonly string[]).includes(slot)) return null;
  if (!(RARITIES as readonly string[]).includes(rarity)) return null;
  return { slot: slot as Slot, rarity: rarity as Rarity };
}

/**
 * Buying, and the reason a refusal still answers 200 with the profile in it: a
 * client that thought it could afford something and could not is a client whose
 * picture of the world is out of date, and the cure for that is the up to date
 * one rather than an error code. It redraws, the coins snap back to what they
 * really are, and the button says NEED N MORE.
 */
async function buy(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  // free mode is the dev panel's, and the server honours it for one signed id
  const free = body.free === true && profiles.isAdmin(env, caller.id);
  const room = body.room === true;
  const item = room ? null : itemIn(body);
  if (!room && !item) return bad(400, 'no such item');

  return sent(
    await profiles.change(env, caller, (held, earned) =>
      item
        ? profiles.buyItem(held, earned, item.slot, item.rarity, free)
        : profiles.buyRoom(held, earned, free),
    ),
  );
}

/** Changing clothes costs nothing and can only ever put on what is owned. */
async function wear(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  const outfit = cleanOutfit(body.outfit);
  return sent(
    await profiles.change(env, caller, (held) => ({
      ok: true,
      held: profiles.wear(held, outfit),
    })),
  );
}

/**
 * Collecting something the day owes: the bonus, or one finished quest.
 *
 * One route with a `claim` in the body rather than one per thing to collect —
 * they want the same signature check, the same compare-and-set and the same
 * "here is the whole profile afterwards" answer, and the only difference
 * between them is which pure function decides.
 *
 * Nothing is read out of the body but the name. Which quests today has, whether
 * that one is finished and what it pays are all worked out on this side, from
 * the day and the row — a client that names a quest it was never dealt, or one
 * it has not finished, gets a refusal and the truth (`claimQuest`).
 *
 * The clock is read here and handed down, so the whole of the decision stays a
 * pure function of a row and a moment, which is what makes it testable without
 * a database.
 */
async function daily(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  const claim = typeof body.claim === 'string' ? body.claim : '';
  if (!claim) return bad(400, 'no such claim');
  const now = Date.now();
  return sent(
    await profiles.change(env, caller, (held) =>
      claim === 'bonus'
        ? profiles.claimBonus(held, now)
        : profiles.claimQuest(held, claim, now),
    ),
  );
}

/** The dev panel's undo, checked against a signature rather than against a bundle. */
async function refund(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  if (!profiles.isAdmin(env, caller.id)) return bad(403, 'not the developer');

  const room = body.room === true;
  const item = room ? null : itemIn(body);
  if (!room && !item) return bad(400, 'no such item');

  return sent(
    await profiles.change(env, caller, (held) =>
      item ? profiles.refundItem(held, item.slot, item.rarity) : profiles.refundRoom(held),
    ),
  );
}

/* ----------------------------------------------------------- the market */

/**
 * The last fortnight of every company's price, which is the whole of what the
 * archive needs to draw a row, a chart and a change since yesterday.
 *
 * Public and unsigned, because it carries nobody's identity: it is the same
 * answer for every player alive, which is exactly why it can be cached. What it
 * is NOT is a formula — the walk behind it is seeded with `MARKET_SALT`, so
 * sending prices out is not the same as letting anybody work out tomorrow's.
 * That is the entire reason this route exists rather than the browser computing
 * its own (`src/market/protocol.ts` says so at more length).
 *
 * Five minutes of caching. A price only changes at midnight UTC, so this could
 * be held far longer — but a stale answer either side of the roll is the one
 * moment it would be wrong, and the client is told which day it is looking at
 * anyway.
 */
function market(env: Env) {
  const day = dayOf(Date.now());
  return new Response(
    JSON.stringify({ day, prices: marketFor(day, HISTORY_DAYS, env.MARKET_SALT ?? '') }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        ...CORS,
      },
    },
  );
}

/**
 * Buying or selling shares. The body names a company, a size and a direction,
 * and nothing else is believed: the price, the day, how many orders are left
 * and whether this player has ever met the company are all worked out on this
 * side (`profiles.trade`).
 *
 * A refusal answers 200 with the profile in it, for the reason a refused
 * purchase does — the cure for a client whose picture of the world is out of
 * date is the up to date one, not an error code.
 */
async function tradeShares(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  const id = String(body.company ?? '');
  const shares = Math.floor(Number(body.shares));
  const sell = body.sell === true;
  if (!id) return bad(400, 'no such company');
  // A size that is not a number, or is absurd, is refused before it reaches a
  // rule that would only refuse it for being unaffordable.
  if (!Number.isFinite(shares) || shares <= 0 || shares > 1_000_000) {
    return bad(400, 'bad size');
  }

  const now = Date.now();
  return sent(
    await profiles.change(env, caller, (held) =>
      profiles.trade(held, id, shares, sell, env.MARKET_SALT ?? '', now),
    ),
  );
}

/* ----------------------------------------------------------------- duels */

/**
 * The code in an invitation link. Base32 without vowels, so no code can spell
 * anything and none of the pairs a phone keyboard confuses are both in the
 * alphabet. Sixty bits of `crypto.getRandomValues` at ten characters: this is
 * the only thing standing between a stranger and somebody else's duel, and it
 * has fifteen minutes to be guessed in.
 */
const ALPHABET = '0123456789bcdfghjklmnpqrstvwxyz';

function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(DUEL_CODE_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const duelStub = (env: Env, code: string) => env.DUEL.get(env.DUEL.idFromName(`duel:${code}`));

async function newDuel(request: Request, env: Env) {
  if (!env.BOT_TOKEN) return bad(503, 'no bot token configured');

  let body: { initData?: unknown; outfit?: unknown; league?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  const initData = typeof body.initData === 'string' ? body.initData : '';
  const caller = initData ? await verifyInitData(initData, env.BOT_TOKEN) : null;
  if (!caller) return bad(401, 'bad signature');

  const code = mintCode();
  const res = await duelStub(env, code).fetch('https://duel/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: caller.id,
      name: caller.name,
      // What the host is wearing, out of the wardrobe the server keeps rather
      // than out of the message — clothes are perks, and a duel is played
      // against somebody who can open a console. Their own word for it is taken
      // only when there is no row at all, which means a client that has never
      // synced (see `profile.ts`).
      outfit: (await profiles.outfitOf(env, caller.id)) ?? body.outfit,
      league: body.league,
    }),
  });
  if (!res.ok) return bad(500, 'could not open a duel');
  const { expiresAt } = (await res.json()) as { expiresAt: number };

  // The link goes through the bot rather than straight at the game: the friend
  // it lands on may never have opened the mini app, and `?start=` is the one
  // door Telegram opens for somebody who has not.
  const bot = await botUsername(env.BOT_TOKEN);
  const link = bot ? `https://t.me/${bot}?start=duel_${code}` : null;

  // A ladder position the guest has not climbed is not a payout — see
  // `topLeague`. Telling the host now is friendlier than at the whistle.
  return json({ ok: true, code, link, expiresAt, yourLeague: await topLeague(env, caller.id) });
}

/* -------------------------------------------------------------- the bot */

/**
 * An update from Telegram, if it really is from Telegram.
 *
 * The only thing standing between this route and anybody who guessed its path
 * is the header, which carries the `secret_token` that `setWebhook` was given.
 * That token is derived from the bot's own token (see `webhookSecret`), so
 * there is no second secret to set anywhere and nothing to fall out of step.
 *
 * The answer is a method call in the body: Telegram performs whatever the
 * webhook responds with, so a reply costs no second call to the API. And the
 * status is 200 whatever happens — an update this route refuses to think about
 * is one Telegram would otherwise retry all day.
 */
async function telegramUpdate(request: Request, env: Env) {
  if (!env.BOT_TOKEN || !env.WEBAPP_URL) return new Response('ok');

  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!sameSecret(given, await webhookSecret(env.BOT_TOKEN))) {
    return new Response('no', { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }

  const answer = answerUpdate(update, env.WEBAPP_URL);
  return answer
    ? new Response(JSON.stringify(answer), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    : new Response('ok');
}

/* ---------------------------------------------------------------- routing */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/health') {
      return json({
        ok: true,
        signedWrites: Boolean(env.BOT_TOKEN),
        duels: Boolean(env.DUEL),
        bot: Boolean(env.BOT_TOKEN && env.WEBAPP_URL),
      });
    }

    if (url.pathname === '/top' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
      // reading the board is public; naming yourself in it is not a claim of
      // anything, it only decides which row gets highlighted
      return top(env, limit, url.searchParams.get('me'));
    }

    if (url.pathname === '/result' && request.method === 'POST') return submit(request, env);

    // The same prices for everybody, so no signature and no identity — see
    // `market` above for why sending them out is not the same as publishing
    // the walk that made them.
    if (url.pathname === '/market' && request.method === 'GET') return market(env);

    if (request.method === 'POST') {
      if (url.pathname === '/profile') return openProfile(request, env);
      if (url.pathname === '/profile/buy') return buy(request, env);
      if (url.pathname === '/profile/wear') return wear(request, env);
      if (url.pathname === '/profile/daily') return daily(request, env);
      if (url.pathname === '/profile/trade') return tradeShares(request, env);
      if (url.pathname === '/profile/refund') return refund(request, env);
    }

    if (url.pathname === '/duel/new' && request.method === 'POST') return newDuel(request, env);

    if (url.pathname === '/tg' && request.method === 'POST') return telegramUpdate(request, env);

    // The socket carries no identity of its own: the first thing over it is a
    // `hello` with the signed initData in the body, which is why the code in
    // the path is all this route needs. A token in a URL is a token in a log.
    const ws = /^\/duel\/([^/]+)\/ws$/.exec(url.pathname);
    if (ws) {
      const code = normalizeCode(ws[1]);
      if (!code) return bad(404, 'no such duel');
      return duelStub(env, code).fetch('https://duel/ws', request);
    }

    return bad(404, 'no such route');
  },
};
