/**
 * The leaderboard behind the RATING tab.
 *
 * Two things the client cannot be trusted with, and the whole point of putting
 * a server here at all:
 *
 * WHO. `Telegram.WebApp.initDataUnsafe` is unsigned — src/ui/admin.ts says so
 * in as many words — but `initData` is not: it comes with an HMAC over the bot
 * token, so a Worker holding that token can tell a real Telegram user from a
 * curl. Nothing is written without one.
 *
 * WHAT IT PAID. The client does not get to say how many stars it earned. It
 * says what happened — which league, won or lost, whether the match cleared the
 * profit bar — and the server works out the payout from its own copy of the
 * table. The worst a liar can do is claim wins they did not have, which is what
 * the replay check is for later; they cannot simply post a number.
 *
 * What is deliberately NOT here: any notion of the player's local star balance.
 * The board ranks stars EARNED, which the server adds up itself, so spending
 * them in the shop cannot cost anybody their place.
 */

export interface Env {
  DB: D1Database;
  /** the bot's token, set with `wrangler secret put BOT_TOKEN` */
  BOT_TOKEN?: string;
}

/* --------------------------------------------------------------- payouts */

/**
 * The server's own copy of ui/leagues.ts. Duplicated on purpose: a payout the
 * client can edit is not a payout. If the tables in the game change, change
 * them here too — `worker/README.md` says so, and the numbers are few enough
 * that sharing a module across two builds would cost more than it saves.
 */
const REWARDS: { win: number; draw: number; profit: number }[] = [
  { win: 3, draw: 1, profit: 2 }, // bronze
  { win: 5, draw: 2, profit: 3 }, // silver
  { win: 8, draw: 3, profit: 4 }, // gold
  { win: 12, draw: 4, profit: 6 }, // global
  { win: 18, draw: 6, profit: 9 }, // crown
];

/** A loss pays nothing, and a surrender never reaches us: the client sends none. */
function payout(league: number, outcome: string, tradedWell: boolean): number {
  const table = REWARDS[league];
  if (!table) return 0;
  const base = outcome === 'win' ? table.win : outcome === 'draw' ? table.draw : 0;
  return base + (tradedWell ? table.profit : 0);
}

/**
 * Nothing can be handed in faster than a match can be played. A match is 80
 * seconds; 45 leaves room for a slow clock without leaving room for a script.
 */
const MIN_SECONDS_BETWEEN_RESULTS = 45;

/** initData older than this is not a live session. Telegram's own advice is a day. */
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

/* ----------------------------------------------------- who is calling */

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant time, because comparing a signature with === leaks it a byte at a time. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Caller {
  id: string;
  name: string;
}

/**
 * Telegram's check, exactly as documented: every field except `hash`, sorted by
 * key, joined with newlines, HMAC'd under a key which is itself an HMAC of the
 * bot token under the literal string "WebAppData".
 */
export async function verifyInitData(initData: string, botToken: string): Promise<Caller | null> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get('hash');
  if (!hash) return null;

  const pairs: string[] = [];
  for (const [k, v] of [...params].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (k !== 'hash') pairs.push(`${k}=${v}`);
  }

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const mine = hex(await hmac(secret, pairs.join('\n')));
  if (!sameSignature(mine, hash)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || user.id == null) return null;
    // `||`, not `??`: Telegram sends an empty first_name rather than omitting
    // it, and `??` only falls through on null, so the username was never reached
    const name = String(user.first_name || user.username || '').trim();
    return { id: String(user.id), name: name.slice(0, 24) || 'PLAYER' };
  } catch {
    return null;
  }
}

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

interface Row {
  id: string;
  name: string;
  stars: number;
  matches: number;
  wins: number;
  best_net_worth: number;
  top_league: number;
}

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
  const outcome = String(body.outcome);
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
  const existing = await env.DB.prepare(`SELECT * FROM players WHERE id = ?1`)
    .bind(caller.id)
    .first<Row & { updated_at: number }>();

  if (existing && now - existing.updated_at < MIN_SECONDS_BETWEEN_RESULTS * 1000) {
    return bad(429, 'too soon');
  }

  const stars = payout(league, outcome, tradedWell);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO players (id, name, stars, matches, wins, best_net_worth, top_league,
                            first_seen, updated_at)
            VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT (id) DO UPDATE SET
            name           = ?2,
            stars          = stars + ?3,
            matches        = matches + 1,
            wins           = wins + ?4,
            best_net_worth = MAX(best_net_worth, ?5),
            top_league     = MAX(top_league, ?6),
            updated_at     = ?7`,
    ).bind(caller.id, caller.name, stars, outcome === 'win' ? 1 : 0, netWorth, league, now),
    env.DB.prepare(
      `INSERT INTO results (player_id, seed, league, outcome, net_worth, traded_well, stars,
                            verified, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`,
    ).bind(caller.id, seed, league, outcome, netWorth, tradedWell ? 1 : 0, stars, now),
  ]);

  return json({ ok: true, stars });
}

/* ---------------------------------------------------------------- routing */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/health') {
      return json({ ok: true, signedWrites: Boolean(env.BOT_TOKEN) });
    }

    if (url.pathname === '/top' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
      // reading the board is public; naming yourself in it is not a claim of
      // anything, it only decides which row gets highlighted
      return top(env, limit, url.searchParams.get('me'));
    }

    if (url.pathname === '/result' && request.method === 'POST') return submit(request, env);

    return bad(404, 'no such route');
  },
};
