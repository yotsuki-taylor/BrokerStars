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
 * WHAT IT PAID. The client does not get to say how many stars it earned. For a
 * match against a bot it says what happened — which league, won or lost,
 * whether the match cleared the profit bar — and the server works out the
 * payout from its own copy of the table (`results.ts`). For a duel it does not
 * even say that: the Durable Object in `duel.ts` ran the match itself and knows.
 *
 * What is deliberately NOT here: any notion of the player's local star balance.
 * The board ranks stars EARNED, which the server adds up itself, so spending
 * them in the shop cannot cost anybody their place.
 */

import { DUEL_CODE_LENGTH, normalizeCode } from '../../src/duel/protocol';
import { REWARDS, record, topLeague, type Env, type Outcome, type Row } from './results';
import { botUsername, verifyInitData } from './telegram';

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
    `SELECT id, name, stars, matches, wins, best_net_worth, top_league
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
      `SELECT id, name, stars, matches, wins, best_net_worth, top_league FROM players WHERE id = ?1`,
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
}

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

  await record(env, caller, { seed, league, outcome, netWorth, tradedWell, stars });
  return json({ ok: true, stars });
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
      outfit: body.outfit,
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

/* ---------------------------------------------------------------- routing */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/health') {
      return json({ ok: true, signedWrites: Boolean(env.BOT_TOKEN), duels: Boolean(env.DUEL) });
    }

    if (url.pathname === '/top' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
      // reading the board is public; naming yourself in it is not a claim of
      // anything, it only decides which row gets highlighted
      return top(env, limit, url.searchParams.get('me'));
    }

    if (url.pathname === '/result' && request.method === 'POST') return submit(request, env);

    if (url.pathname === '/duel/new' && request.method === 'POST') return newDuel(request, env);

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
