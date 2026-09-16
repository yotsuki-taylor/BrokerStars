/**
 * Corporations: founding one, getting into one, and what a season is worth.
 *
 * The shape of the thing and the arguments behind it are in
 * `src/corp/protocol.ts`, which both sides read. This file is the database
 * work, and it has four jobs that are worth naming before the code starts.
 *
 * THE LAST SEAT. Thirty is a ceiling two people will try to take in the same
 * second, and a COUNT read and then acted on is exactly the race that loses. So
 * `corps.members` is a counted column and the seat is taken by one statement —
 * `UPDATE ... SET members = members + 1 WHERE members < 30` — which either
 * changes a row or does not. Everything else about joining hangs off whether
 * that statement won.
 *
 * ONE PLAYER, ONE CORPORATION. Enforced by `corp_members.player_id` being the
 * primary key rather than by anything here remembering to check. The bad state
 * cannot be written down.
 *
 * THE SEASON ROLLS ITSELF. A contribution row carries the month it is about;
 * when the month stops matching, `credit` overwrites instead of adding and the
 * table reads the row as zero. Nothing runs on the first — the same trick the
 * day plays in `src/daily/protocol.ts`, and for the same reason.
 *
 * THE TABLE RANKS AVERAGES. Not sums. `averageOf` says why at length; the SQL
 * below is where it actually happens, and the `HAVING` is the floor under it.
 *
 * Nothing in here is ever allowed to fail a match. `credit` and `note` run
 * beside a result being banked and swallow everything: a corporation that did
 * not hear about a win is a smaller loss than a win that was not paid.
 */

import {
  FEED_DAYS,
  FEED_KEEP,
  MAX_MEMBERS,
  MIN_RANKED,
  RENAME_EVERY_MS,
  SWITCH_COOLDOWN_MS,
  CORP_CODE_LENGTH,
  averageOf,
  cleanMotto,
  cleanName,
  cleanTag,
  keyOf,
  seasonOf,
  type Corp,
  type CorpError,
  type CorpMember,
  type CorpRequest,
  type CorpSummary,
  type FeedItem,
  type FeedKind,
  type Metric,
  type Policy,
} from '../../src/corp/protocol';
import { cleanColor, cleanEmblem } from '../../src/corp/emblems';
import type { Env } from './results';
import type { Caller } from './telegram';

/** The duel alphabet, for the reasons `mintCode` in index.ts gives. */
const ALPHABET = '0123456789bcdfghjklmnpqrstvwxyz';

function mint(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * How many corporations the table is worked out over.
 *
 * The same kind of bound `SCAN_LIMIT` puts on the dollar board and for the same
 * reason: an ORDER BY over a GROUP BY is not free, and nobody is reading past
 * the first screen of it. A corporation outside this many is simply unranked,
 * which is the same answer a corporation of two gets.
 */
const RANK_SCAN = 300;

/** How many times a change may be worked out again after losing the race. */
const ATTEMPTS = 4;

/* ------------------------------------------------------------------- rows */

interface CorpRow {
  id: string;
  name: string;
  tag: string;
  motto: string;
  emblem: string;
  color: string;
  policy: Policy;
  owner_id: string;
  code: string;
  members: number;
  created_at: number;
  renamed_at: number;
  updated_at: number;
}

interface MemberRow {
  player_id: string;
  name: string;
  joined_at: number;
  season: string;
  coins: number;
  dollars: number;
}

interface FeedRow {
  id: number;
  kind: FeedKind;
  actor_id: string;
  actor_name: string;
  detail: string;
  expires_at: number | null;
  taken_name: string | null;
  created_at: number;
}

const CORP_COLUMNS = `id, name, tag, motto, emblem, color, policy, owner_id, code,
                      members, created_at, renamed_at, updated_at`;

/* -------------------------------------------------------------- the reads */

/** Which corporation this player is in, or null. One indexed lookup. */
export async function corpIdOf(env: Env, playerId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT corp_id FROM corp_members WHERE player_id = ?1`)
    .bind(playerId)
    .first<{ corp_id: string }>();
  return row?.corp_id ?? null;
}

const corpById = (env: Env, id: string) =>
  env.DB.prepare(`SELECT ${CORP_COLUMNS} FROM corps WHERE id = ?1`).bind(id).first<CorpRow>();

async function membersOf(env: Env, corpId: string): Promise<MemberRow[]> {
  const { results } = await env.DB.prepare(
    // The live name from `players` wins when there is one, exactly as it does
    // in the friends list: somebody who renamed themselves in Telegram last
    // week should not be introduced under the old one. The stored name is the
    // fallback for a member who has never finished a match.
    `SELECT m.player_id, COALESCE(p.name, m.name) AS name, m.joined_at,
            m.season, m.coins, m.dollars
       FROM corp_members m
       LEFT JOIN players p ON p.id = m.player_id
      WHERE m.corp_id = ?1
      ORDER BY m.joined_at ASC
      LIMIT ?2`,
  )
    .bind(corpId, MAX_MEMBERS)
    .all<MemberRow>();
  return results ?? [];
}

/**
 * The feed, newest first, with dead invitations left out.
 *
 * Expired duel cards are filtered on read as well as swept on write, because
 * the sweep only happens when somebody writes: a corporation that has been
 * quiet for an hour would otherwise still be offering a duel that closed forty
 * minutes ago.
 */
export async function feedOf(env: Env, corpId: string, now: number): Promise<FeedItem[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, actor_id, actor_name, detail, expires_at, taken_name, created_at
       FROM corp_feed
      WHERE corp_id = ?1 AND (expires_at IS NULL OR expires_at > ?2)
      ORDER BY id DESC
      LIMIT ?3`,
  )
    .bind(corpId, now, FEED_KEEP)
    .all<FeedRow>();

  return (results ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    who: r.actor_name,
    whoId: r.actor_id,
    detail: r.detail,
    at: r.created_at,
    expiresAt: r.expires_at ?? null,
    takenBy: r.taken_name ?? null,
  }));
}

async function requestsOf(env: Env, corpId: string): Promise<CorpRequest[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.player_id AS id, COALESCE(p.name, r.name) AS name, r.created_at AS at
       FROM corp_requests r
       LEFT JOIN players p ON p.id = r.player_id
      WHERE r.corp_id = ?1
      ORDER BY r.created_at ASC
      LIMIT ?2`,
  )
    .bind(corpId, MAX_MEMBERS)
    .all<CorpRequest>();
  return results ?? [];
}

/* ------------------------------------------------------------- the table */

interface RankRow {
  id: string;
  members: number;
  total: number;
}

/**
 * Every ranked corporation, best average first, as a map from id to place.
 *
 * One query serves three callers — the table screen, the place in the header of
 * a corporation, and the place beside a row in the browse list — so the
 * arithmetic that decides an order exists once.
 *
 * THE ORDER IS ON THE EXACT AVERAGE, and the number shown beside it is that
 * average rounded (`averageOf`). Two corporations can therefore show the same
 * figure and hold different places, which is the right way round: the rounding
 * is for the eye, and a place decided in the third decimal is still a place.
 *
 * The metric is a column name pasted into the SQL, which is safe for exactly
 * one reason: it is chosen here from a closed set of two literals and never
 * from anything that came off the wire.
 */
async function rankRows(env: Env, metric: Metric, season: string): Promise<RankRow[]> {
  const column = metric === 'dollars' ? 'm.dollars' : 'm.coins';
  const { results } = await env.DB.prepare(
    `SELECT c.id AS id,
            COUNT(m.player_id) AS members,
            SUM(CASE WHEN m.season = ?1 THEN ${column} ELSE 0 END) AS total
       FROM corps c
       JOIN corp_members m ON m.corp_id = c.id
      GROUP BY c.id
     HAVING COUNT(m.player_id) >= ?2
      ORDER BY (SUM(CASE WHEN m.season = ?1 THEN ${column} ELSE 0 END) * 1.0)
               / COUNT(m.player_id) DESC,
               -- Level on the average: the older corporation is ahead, and the
               -- id settles the two founded in the same millisecond. The last
               -- key is there to make the order TOTAL rather than to be fair —
               -- without it two tied rows can come back in either order, and a
               -- table that reshuffles between two reads of the same season is
               -- a table nobody believes.
               c.created_at ASC, c.id ASC
      LIMIT ?3`,
  )
    .bind(season, MIN_RANKED, RANK_SCAN)
    .all<RankRow>();
  return results ?? [];
}

interface Placed {
  rank: number;
  average: number;
  members: number;
}

const placings = (rows: RankRow[]): Map<string, Placed> => {
  const out = new Map<string, Placed>();
  rows.forEach((r, i) => {
    out.set(r.id, { rank: i + 1, average: averageOf(r.total, r.members), members: r.members });
  });
  return out;
};

/**
 * One page of the table, and the caller's own corporation under it when it
 * placed outside the page — the same shape and the same courtesy the player
 * boards extend (`top` in index.ts).
 */
export async function table(
  env: Env,
  metric: Metric,
  limit: number,
  mine: string | null,
  now: number,
): Promise<{ top: CorpSummary[]; me: CorpSummary | null }> {
  const rows = await rankRows(env, metric, seasonOf(now));
  const placed = placings(rows);
  const ids = rows.slice(0, limit).map((r) => r.id);
  const wanted = new Set(ids);
  if (mine && placed.has(mine)) wanted.add(mine);
  if (wanted.size === 0) return { top: [], me: null };

  const marks = [...wanted].map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await env.DB.prepare(
    `SELECT ${CORP_COLUMNS} FROM corps WHERE id IN (${marks})`,
  )
    .bind(...wanted)
    .all<CorpRow>();

  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const summary = (id: string): CorpSummary | null => {
    const row = byId.get(id);
    const at = placed.get(id);
    if (!row || !at) return null;
    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      motto: row.motto,
      emblem: row.emblem,
      color: row.color,
      // the count the table was worked out over, not the counted column: the
      // two agree, and this one cannot be the stale half of a disagreement
      members: at.members,
      policy: row.policy,
      rank: at.rank,
      average: at.average,
    };
  };

  const top = ids.map(summary).filter((x): x is CorpSummary => x !== null);
  const me = mine && !ids.includes(mine) ? summary(mine) : null;
  return { top, me };
}

/* ------------------------------------------------------- the whole of one */

/**
 * The corporation the caller is in, with everything its screen draws.
 *
 * Also the one place the counted column is checked against the truth. It cannot
 * drift under ordinary use — every path that changes membership moves both —
 * but a column that the ceiling is enforced on is a column worth making
 * self-healing, and the count is already being read here for the member list.
 * Written without touching `updated_at`, so a correction cannot make an edit in
 * flight lose a race it had already won (the same rule `countOpen` follows).
 */
export async function mine(env: Env, caller: Caller, now: number): Promise<Corp | null> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return null;
  const row = await corpById(env, corpId);
  if (!row) return null;

  const season = seasonOf(now);
  const [rows, feed, requests, coins, dollars] = await Promise.all([
    membersOf(env, corpId),
    feedOf(env, corpId, now),
    // Nobody but the owner has any business seeing who knocked.
    row.owner_id === caller.id ? requestsOf(env, corpId) : Promise.resolve([]),
    rankRows(env, 'coins', season),
    rankRows(env, 'dollars', season),
  ]);

  if (rows.length !== row.members) {
    await env.DB.prepare(`UPDATE corps SET members = ?2 WHERE id = ?1`)
      .bind(corpId, rows.length)
      .run()
      .catch(() => {
        /* a count that did not heal is not a reason to fail a read */
      });
  }

  /**
   * And the other thing that can rot: an owner who is not a member.
   *
   * Every ordinary path hands ownership on — leaving does it, and there is no
   * way to be thrown out of your own corporation. The one that does not is an
   * account being deleted, which empties every table keyed on that player in
   * one batch and is deliberately not allowed to go and rearrange a
   * corporation on the way past (`forgetting`). So the correction is here, on
   * the first read afterwards, and it is the same rule leaving follows: the
   * oldest member takes it. A corporation without an owner must not last
   * longer than it takes somebody to open it.
   */
  if (rows.length && !rows.some((m) => m.player_id === row.owner_id)) {
    row.owner_id = rows[0].player_id;
    await env.DB.prepare(
      `UPDATE corps SET owner_id = ?2, updated_at = MAX(updated_at + 1, ?3) WHERE id = ?1`,
    )
      .bind(corpId, row.owner_id, now)
      .run()
      .catch(() => {
        /* the next read will try again */
      });
  }

  const members: CorpMember[] = rows.map((m) => ({
    id: m.player_id,
    name: m.name,
    // A row left over from last month reads as zero rather than being rewritten
    // here: the write happens when something is actually credited (`credit`),
    // and a read has no business changing anybody's contribution.
    coins: m.season === season ? m.coins : 0,
    dollars: m.season === season ? m.dollars : 0,
    joinedAt: m.joined_at,
    owner: m.player_id === row.owner_id,
    you: m.player_id === caller.id,
  }));

  const coinsAt = placings(coins).get(corpId) ?? null;
  const dollarsAt = placings(dollars).get(corpId) ?? null;

  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    motto: row.motto,
    emblem: row.emblem,
    color: row.color,
    policy: row.policy,
    ownerId: row.owner_id,
    code: row.code,
    members,
    feed,
    requests,
    coinRank: coinsAt?.rank ?? null,
    dollarRank: dollarsAt?.rank ?? null,
    coinAverage: coinsAt?.average ?? averageOf(
      members.reduce((sum, m) => sum + m.coins, 0),
      members.length,
    ),
    dollarAverage: dollarsAt?.average ?? averageOf(
      members.reduce((sum, m) => sum + m.dollars, 0),
      members.length,
    ),
    renameAt: row.renamed_at ? row.renamed_at + RENAME_EVERY_MS : 0,
    season,
  };
}

/**
 * The list somebody with no corporation reads: everybody, or everybody whose
 * name or tag contains what was typed.
 *
 * A full corporation is still in the list — with its count saying so, and the
 * screen draws no way in. Hiding it would mean a player cannot see the
 * corporation their friends are in, which is exactly the one they were looking
 * for.
 *
 * Ordered by members and then by place: a corporation somebody can actually
 * join and talk to is worth more to a newcomer than an empty one with a good
 * average, and the good averages have a table of their own.
 */
export async function browse(
  env: Env,
  query: string,
  limit: number,
  now: number,
): Promise<CorpSummary[]> {
  /**
   * What is actually searched for: the query reduced to the alphabet a name can
   * be written in (`src/corp/protocol.ts`), which is the same thing the box on
   * the screen allows.
   *
   * It takes the LIKE wildcards out along with everything else, so `%` cannot
   * change what the pattern means — and a search made of nothing but wildcards
   * comes out empty and is treated as no search at all, which is the listing
   * everybody gets anyway. There is nothing to protect here beyond that: this
   * is a public list of public names.
   */
  const wanted = query.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  const like = `%${wanted}%`;
  // Two statements, and the LIMIT is `?1` in one and `?2` in the other because
  // the numbers have to match what is actually bound. Getting that wrong is not
  // a wrong answer — D1 refuses the query outright — but it is invisible until
  // somebody opens the screen with an empty search box, which is everybody.
  const { results } = await env.DB.prepare(
    wanted
      ? `SELECT ${CORP_COLUMNS} FROM corps
          WHERE name LIKE ?1 OR tag LIKE ?1
          ORDER BY members DESC, created_at ASC LIMIT ?2`
      : `SELECT ${CORP_COLUMNS} FROM corps ORDER BY members DESC, created_at ASC LIMIT ?1`,
  )
    .bind(...(wanted ? [like, limit] : [limit]))
    .all<CorpRow>();

  const placed = placings(await rankRows(env, 'coins', seasonOf(now)));
  return (results ?? []).map((row) => {
    const at = placed.get(row.id);
    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      motto: row.motto,
      emblem: row.emblem,
      color: row.color,
      members: row.members,
      policy: row.policy,
      rank: at?.rank ?? null,
      average: at?.average ?? 0,
    };
  });
}

/* ------------------------------------------------------------- the feed */

/**
 * Put a line in a corporation's feed, and sweep the old ones on the way past.
 *
 * The sweep rides along with the write rather than running on a schedule: a
 * feed only grows when somebody does something, so the moment something is done
 * is exactly the moment to throw away what has aged out. Nothing here is
 * scheduled and nothing has to be.
 */
async function push(
  env: Env,
  corpId: string,
  actor: Caller,
  kind: FeedKind,
  detail: string,
  expiresAt: number | null,
  now: number,
): Promise<number | null> {
  const written = await env.DB.prepare(
    `INSERT INTO corp_feed (corp_id, kind, actor_id, actor_name, detail, expires_at, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(corpId, kind, actor.id, actor.name || 'PLAYER', detail.slice(0, 32), expiresAt, now)
    .run();

  await env.DB.prepare(
    `DELETE FROM corp_feed
      WHERE corp_id = ?1
        AND (created_at < ?2
             OR (expires_at IS NOT NULL AND expires_at < ?3)
             OR id NOT IN (SELECT id FROM corp_feed WHERE corp_id = ?1
                            ORDER BY id DESC LIMIT ?4))`,
  )
    .bind(corpId, now - FEED_DAYS * 86_400_000, now, FEED_KEEP)
    .run();

  const id = written.meta?.last_row_id;
  return typeof id === 'number' ? id : null;
}

/**
 * The same, for a player whose corporation nobody has looked up yet — which is
 * every caller of this from the match-banking paths.
 *
 * NEVER THROWS. It runs beside a result being recorded, and a match that was
 * played must be banked whether or not a line about it reached thirty people.
 * One indexed lookup that finds nothing for everybody who is in no corporation,
 * which is most people.
 */
export async function note(
  env: Env,
  actor: Caller,
  kind: FeedKind,
  detail: string,
  now: number = Date.now(),
): Promise<void> {
  try {
    const corpId = await corpIdOf(env, actor.id);
    if (!corpId) return;
    await push(env, corpId, actor, kind, detail, null, now);
  } catch {
    /* the match is banked either way */
  }
}

/**
 * An invitation to a duel, left where thirty people can see it.
 *
 * The code is not checked against the duel it names, for the reason
 * `shoutDuel` does not check the one it shouts: it is sixty bits minted a
 * moment ago by this same server for this same caller, and a wrong one is a
 * player offering their corporation a dead link under their own name. That is a
 * thing nobody wants to do rather than a thing to defend against.
 *
 * The card dies when the invitation does — fifteen minutes — because that is
 * how long the seat behind it exists.
 */
export async function callOut(
  env: Env,
  caller: Caller,
  code: string,
  expiresAt: number,
  now: number = Date.now(),
): Promise<CorpError | null> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return 'notmember';
  await push(env, corpId, caller, 'duel', code, expiresAt, now);
  return null;
}

/**
 * Take the duel on a card. First tap wins.
 *
 * The compare-and-set on `taken_by IS NULL` is the whole of it: exactly one
 * caller changes a row, and everybody else is told who beat them. It is
 * advisory rather than the lock on the seat itself — the object running the
 * duel is what actually decides who sits down (`worker/src/duel.ts`) — but it
 * is what makes thirty cards go dark together instead of twenty-nine people
 * tapping into a full lobby.
 *
 * The player who left the card can always have it back: they are the host, and
 * this is how they return to a duel they walked away from.
 */
export async function takeDuel(
  env: Env,
  caller: Caller,
  feedId: number,
  now: number = Date.now(),
): Promise<{ code: string } | CorpError> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return 'notmember';

  const row = await env.DB.prepare(
    `SELECT detail, actor_id, taken_by, expires_at FROM corp_feed
      WHERE id = ?1 AND corp_id = ?2 AND kind = 'duel'`,
  )
    .bind(feedId, corpId)
    .first<{ detail: string; actor_id: string; taken_by: string | null; expires_at: number }>();

  if (!row || row.expires_at <= now) return 'nosuch';
  if (row.actor_id === caller.id) return { code: row.detail };
  if (row.taken_by && row.taken_by !== caller.id) return 'gone';

  const claimed = await env.DB.prepare(
    `UPDATE corp_feed SET taken_by = ?2, taken_name = ?3
      WHERE id = ?1 AND taken_by IS NULL`,
  )
    .bind(feedId, caller.id, caller.name || 'PLAYER')
    .run();

  // Zero changes and it was not already ours: somebody tapped a tenth of a
  // second sooner. The card the client redraws will say who.
  if (!(claimed.meta?.changes ?? 0) && row.taken_by !== caller.id) return 'gone';
  return { code: row.detail };
}

/* --------------------------------------------------------- the season's pay */

/**
 * What this player has just earned, added to their season.
 *
 * ONE STATEMENT, NO READ. `season` is rewritten on the way past, and the CASE
 * is what makes the rollover free: a row from last month is overwritten rather
 * than added to, so nothing has to run on the first of the month and two
 * matches landing together cannot both write the same number.
 *
 * WHAT COUNTS, and it is the whole of the honesty of the dollar table. Coins
 * come from matches — the same payouts `players.stars` ranks on, worked out by
 * the server from its own table. Dollars come from the daily bonus, which is
 * what turning up pays. Neither can be bought.
 *
 * WHAT DOES NOT COUNT, deliberately: quest rewards, which are `granted` and
 * kept off the player board for the same reason; and anything that will one day
 * be sold for Telegram Stars. A dollar somebody paid real money for must never
 * reach this function — a table that ranks purchases is a table of who spent
 * the most, and nobody wants to be in that one or to lose to it.
 *
 * Never throws: it runs beside a match being banked.
 */
export async function credit(
  env: Env,
  playerId: string,
  gained: { coins?: number; dollars?: number },
  now: number = Date.now(),
): Promise<void> {
  const coins = Math.max(0, Math.floor(gained.coins ?? 0));
  const dollars = Math.max(0, Math.floor(gained.dollars ?? 0));
  if (!coins && !dollars) return;
  try {
    await env.DB.prepare(
      `UPDATE corp_members
          SET coins   = CASE WHEN season = ?2 THEN coins   ELSE 0 END + ?3,
              dollars = CASE WHEN season = ?2 THEN dollars ELSE 0 END + ?4,
              season  = ?2
        WHERE player_id = ?1`,
    )
      .bind(playerId, seasonOf(now), coins, dollars)
      .run();
  } catch {
    /* the coins are paid either way */
  }
}

/* --------------------------------------------------------------- founding */

/** Nothing is founded, joined or left inside this many milliseconds of leaving. */
const cooldownLeft = async (env: Env, playerId: string, now: number): Promise<number> => {
  const row = await env.DB.prepare(`SELECT left_at FROM corp_moves WHERE player_id = ?1`)
    .bind(playerId)
    .first<{ left_at: number }>();
  if (!row) return 0;
  return Math.max(0, row.left_at + SWITCH_COOLDOWN_MS - now);
};

export interface Founded {
  error?: CorpError;
  /** how much of the cooldown is left, when that is what refused it */
  wait?: number;
}

/**
 * Found one. Free — no coins, no dollars, nothing.
 *
 * Charging for it was considered and dropped: a price on founding is a price on
 * the one thing this feature needs, which is corporations existing at all. The
 * cost of a bad one is a name in a list, and the name rules are what that is
 * defended with.
 *
 * The founder is the owner and the first member, written in one batch with the
 * corporation itself — a corporation with no members would be a row nothing can
 * ever delete, since deleting one is what the last member leaving does.
 */
export async function create(
  env: Env,
  caller: Caller,
  raw: {
    name: unknown;
    tag: unknown;
    motto: unknown;
    policy: unknown;
    emblem?: unknown;
    color?: unknown;
  },
  now: number = Date.now(),
): Promise<Founded> {
  if (await corpIdOf(env, caller.id)) return { error: 'already' };

  const name = cleanName(raw.name);
  const tag = cleanTag(raw.tag);
  if (!name || !tag) return { error: 'badname' };
  const motto = cleanMotto(raw.motto);
  const policy: Policy = raw.policy === 'closed' ? 'closed' : 'open';
  // Through the catalogue, so anything that is not one of the fourteen marks,
  // the twenty-eight company marks or the ten colours becomes the default
  // rather than reaching a column. Unlike the name, a mark nobody recognises
  // is not worth refusing a founding over: there is nothing for the player to
  // correct, since they can only have got here by sending it by hand.
  const emblem = cleanEmblem(raw.emblem);
  const color = cleanColor(raw.color);

  const wait = await cooldownLeft(env, caller.id, now);
  if (wait > 0) return { error: 'cooldown', wait };

  const id = mint(12);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO corps (id, name, key, tag, motto, emblem, color, policy, owner_id,
                            code, members, created_at, renamed_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, 0, ?11)`,
      ).bind(
        id, name, keyOf(name), tag, motto, emblem, color, policy, caller.id,
        mint(CORP_CODE_LENGTH), now,
      ),
      env.DB.prepare(
        `INSERT INTO corp_members (player_id, corp_id, name, joined_at, season, coins, dollars)
              VALUES (?1, ?2, ?3, ?4, '', 0, 0)`,
      ).bind(caller.id, id, caller.name || 'PLAYER', now),
    ]);
  } catch {
    // The UNIQUE on `key` is the likely one and the only one worth a word of
    // its own: somebody has that name, spaces and case notwithstanding. The
    // other way to land here is this player joining something in the same
    // instant, which the primary key refused — and `already` is then the truth
    // as well, so the check is which of the two it was.
    return { error: (await corpIdOf(env, caller.id)) ? 'already' : 'taken' };
  }

  await push(env, id, caller, 'joined', '', null, now);
  return {};
}

/* ---------------------------------------------------------------- joining */

/**
 * Get in, by id or by code.
 *
 * The seat is taken by one conditional UPDATE and everything else hangs off
 * whether it won. The membership row goes in afterwards rather than in a batch
 * with it, because the two can each fail for a different reason and the loser
 * of either has to give the seat back — which is a branch, and a branch is the
 * one thing a batch cannot hold. The compensation is the `members - 1` below,
 * and it is why that statement exists at all.
 *
 * A closed corporation answers `closed` and leaves a request at the door,
 * unless the caller came with the code: the code IS the owner's permission,
 * handed over in advance.
 */
export async function join(
  env: Env,
  caller: Caller,
  by: { id?: unknown; code?: unknown },
  now: number = Date.now(),
): Promise<Founded> {
  if (await corpIdOf(env, caller.id)) return { error: 'already' };

  const code = String(by.code ?? '').trim().toLowerCase().slice(0, 32);
  const id = String(by.id ?? '').trim().slice(0, 32);
  const row = code
    ? await env.DB.prepare(`SELECT ${CORP_COLUMNS} FROM corps WHERE code = ?1`)
        .bind(code)
        .first<CorpRow>()
    : id
      ? await corpById(env, id)
      : null;
  if (!row) return { error: 'nosuch' };

  const wait = await cooldownLeft(env, caller.id, now);
  if (wait > 0) return { error: 'cooldown', wait };

  // A code is an invitation the owner handed out, so it opens a closed door.
  // Tapping a closed corporation in the list does not; it knocks.
  if (row.policy === 'closed' && !code) {
    if (row.members >= MAX_MEMBERS) return { error: 'full' };
    const asked = await env.DB.prepare(
      `INSERT OR IGNORE INTO corp_requests (corp_id, player_id, name, created_at)
            VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(row.id, caller.id, caller.name || 'PLAYER', now)
      .run();
    return { error: (asked.meta?.changes ?? 0) ? 'closed' : 'pending' };
  }

  return seat(env, caller, row.id, now);
}

/**
 * Take a seat in a corporation that has already agreed to have this player.
 *
 * Shared by joining, by a code, and by an owner saying yes to a request, so the
 * one statement the ceiling is enforced on has one caller's worth of code
 * around it.
 */
async function seat(env: Env, caller: Caller, corpId: string, now: number): Promise<Founded> {
  const took = await env.DB.prepare(
    `UPDATE corps SET members = members + 1, updated_at = MAX(updated_at + 1, ?2)
      WHERE id = ?1 AND members < ?3`,
  )
    .bind(corpId, now, MAX_MEMBERS)
    .run();
  if (!(took.meta?.changes ?? 0)) return { error: 'full' };

  const joined = await env.DB.prepare(
    `INSERT OR IGNORE INTO corp_members (player_id, corp_id, name, joined_at, season, coins, dollars)
          VALUES (?1, ?2, ?3, ?4, '', 0, 0)`,
  )
    .bind(caller.id, corpId, caller.name || 'PLAYER', now)
    .run();

  if (!(joined.meta?.changes ?? 0)) {
    // Somebody else's request, or this player's own second tap, got there
    // first. Give the seat back — it is the only thing this path took.
    await env.DB.prepare(`UPDATE corps SET members = members - 1 WHERE id = ?1 AND members > 0`)
      .bind(corpId)
      .run();
    return { error: 'already' };
  }

  await env.DB.batch([
    // Whatever else this player was waiting on, they are not waiting any more.
    env.DB.prepare(`DELETE FROM corp_requests WHERE player_id = ?1`).bind(caller.id),
    // And the cooldown is spent: it is about the gap between two corporations,
    // and the gap is over.
    env.DB.prepare(`DELETE FROM corp_moves WHERE player_id = ?1`).bind(caller.id),
  ]);

  await push(env, corpId, caller, 'joined', '', null, now);
  return {};
}

/** The owner saying yes or no to somebody at the door. */
export async function answer(
  env: Env,
  caller: Caller,
  playerId: string,
  yes: boolean,
  now: number = Date.now(),
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };
  const row = await corpById(env, corpId);
  if (!row) return { error: 'nosuch' };
  if (row.owner_id !== caller.id) return { error: 'notowner' };

  const waiting = await env.DB.prepare(
    `SELECT name FROM corp_requests WHERE corp_id = ?1 AND player_id = ?2`,
  )
    .bind(corpId, playerId)
    .first<{ name: string }>();
  if (!waiting) return { error: 'nosuch' };

  await env.DB.prepare(`DELETE FROM corp_requests WHERE corp_id = ?1 AND player_id = ?2`)
    .bind(corpId, playerId)
    .run();
  if (!yes) return {};

  // Seated as themselves, not as the owner: the feed line and the membership
  // row both have to say who actually arrived.
  return seat(env, { id: playerId, name: waiting.name }, corpId, now);
}

/* ---------------------------------------------------------------- leaving */

/**
 * Walk out.
 *
 * Three things have to be true when this returns, and the order below is what
 * makes them true even if the process dies halfway.
 *
 * A CORPORATION IS NEVER WITHOUT AN OWNER. Not for a moment: if the owner
 * leaves and anybody is left, it passes to whoever has been there longest. Not
 * to the best player, deliberately — seniority is a fact nobody can farm, and
 * the alternative is a title that changes hands because somebody had a good
 * Tuesday.
 *
 * AN EMPTY CORPORATION DOES NOT EXIST. The last member out deletes it, its
 * feed, and everybody's requests to join it. The name goes back into the pool,
 * which is the whole reason names are unique on a live table rather than
 * forever.
 *
 * LEAVING COSTS THE SEASON. The contribution belongs to the pair, so it goes
 * with the membership row. Coming back to the same corporation an hour later
 * starts at nothing, which is the same answer joining a different one gives.
 */
export async function leave(
  env: Env,
  caller: Caller,
  now: number = Date.now(),
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };
  const row = await corpById(env, corpId);
  if (!row) return { error: 'nosuch' };

  return part(env, corpId, { id: caller.id, name: caller.name }, row.owner_id, true, now);
}

/** The owner showing somebody the door. */
export async function kick(
  env: Env,
  caller: Caller,
  playerId: string,
  now: number = Date.now(),
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };
  const row = await corpById(env, corpId);
  if (!row) return { error: 'nosuch' };
  if (row.owner_id !== caller.id) return { error: 'notowner' };
  // The owner cannot throw themselves out; that is what leaving is, and it has
  // a handover in it.
  if (playerId === caller.id) return { error: 'notowner' };

  const member = await env.DB.prepare(
    `SELECT name FROM corp_members WHERE player_id = ?1 AND corp_id = ?2`,
  )
    .bind(playerId, corpId)
    .first<{ name: string }>();
  if (!member) return { error: 'nosuch' };

  // No cooldown for somebody who did not choose to go. Being thrown out is not
  // a move anybody made, and charging for it would be charging for somebody
  // else's decision.
  return part(env, corpId, { id: playerId, name: member.name }, row.owner_id, false, now);
}

async function part(
  env: Env,
  corpId: string,
  who: Caller,
  ownerId: string,
  theirChoice: boolean,
  now: number,
): Promise<Founded> {
  const gone = await env.DB.prepare(
    `DELETE FROM corp_members WHERE player_id = ?1 AND corp_id = ?2`,
  )
    .bind(who.id, corpId)
    .run();
  if (!(gone.meta?.changes ?? 0)) return { error: 'notmember' };

  await env.DB.prepare(
    `UPDATE corps SET members = members - 1, updated_at = MAX(updated_at + 1, ?2)
      WHERE id = ?1 AND members > 0`,
  )
    .bind(corpId, now)
    .run();

  // Who is left, in the order they arrived: the first of them is the heir.
  const next = await env.DB.prepare(
    `SELECT player_id, name FROM corp_members WHERE corp_id = ?1
      ORDER BY joined_at ASC, player_id ASC LIMIT 1`,
  )
    .bind(corpId)
    .first<{ player_id: string; name: string }>();

  if (!next) {
    await disbandRows(env, corpId);
  } else {
    if (ownerId === who.id) {
      await env.DB.prepare(
        `UPDATE corps SET owner_id = ?2, updated_at = MAX(updated_at + 1, ?3) WHERE id = ?1`,
      )
        .bind(corpId, next.player_id, now)
        .run();
    }
    await push(env, corpId, who, 'left', '', null, now);
  }

  if (theirChoice) {
    await env.DB.prepare(
      `INSERT INTO corp_moves (player_id, left_at) VALUES (?1, ?2)
       ON CONFLICT (player_id) DO UPDATE SET left_at = excluded.left_at`,
    )
      .bind(who.id, now)
      .run();
  }
  return {};
}

/** Everything that hangs off a corporation, deleted with it. */
const disbandRows = (env: Env, corpId: string) =>
  env.DB.batch([
    env.DB.prepare(`DELETE FROM corp_members WHERE corp_id = ?1`).bind(corpId),
    env.DB.prepare(`DELETE FROM corp_feed WHERE corp_id = ?1`).bind(corpId),
    env.DB.prepare(`DELETE FROM corp_requests WHERE corp_id = ?1`).bind(corpId),
    env.DB.prepare(`DELETE FROM corps WHERE id = ?1`).bind(corpId),
  ]);

/**
 * The owner closing it down, with everybody still inside.
 *
 * The cooldown is charged to the owner and to nobody else: they made the
 * decision, the other twenty-nine had it made for them.
 */
export async function disband(
  env: Env,
  caller: Caller,
  now: number = Date.now(),
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };
  const row = await corpById(env, corpId);
  if (!row) return { error: 'nosuch' };
  if (row.owner_id !== caller.id) return { error: 'notowner' };

  await disbandRows(env, corpId);
  await env.DB.prepare(
    `INSERT INTO corp_moves (player_id, left_at) VALUES (?1, ?2)
     ON CONFLICT (player_id) DO UPDATE SET left_at = excluded.left_at`,
  )
    .bind(caller.id, now)
    .run();
  return {};
}

/** Handing it on, on purpose rather than by walking out. */
export async function transfer(
  env: Env,
  caller: Caller,
  playerId: string,
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };
  const row = await corpById(env, corpId);
  if (!row) return { error: 'nosuch' };
  if (row.owner_id !== caller.id) return { error: 'notowner' };
  if (playerId === caller.id) return {};

  const member = await env.DB.prepare(
    `SELECT player_id FROM corp_members WHERE player_id = ?1 AND corp_id = ?2`,
  )
    .bind(playerId, corpId)
    .first<{ player_id: string }>();
  if (!member) return { error: 'nosuch' };

  const done = await env.DB.prepare(
    `UPDATE corps SET owner_id = ?2, updated_at = MAX(updated_at + 1, ?3)
      WHERE id = ?1 AND owner_id = ?4 AND updated_at = ?5`,
  )
    .bind(corpId, playerId, Date.now(), caller.id, row.updated_at)
    .run();
  // The row moved between the read and the write, which here means somebody
  // else was made owner in the meantime. Not retried: the caller may no longer
  // be the owner at all, and a second attempt would be a decision made about a
  // corporation that has changed hands.
  return (done.meta?.changes ?? 0) ? {} : { error: 'busy' };
}

/* --------------------------------------------------------------- editing */

/**
 * The name, the motto and the door, changed by the owner.
 *
 * Read, decide, write — and the write names the version it read
 * (`updated_at`), so two changes made a moment apart cannot each put the
 * other's back. The same compare-and-set `worker/src/profile.ts` uses on a
 * profile, and the same four attempts before it gives up and says so.
 *
 * The rename cooldown is charged only when the name actually changes. Turning
 * the door from open to closed is not a rename and must not cost a week of
 * them.
 */
export async function edit(
  env: Env,
  caller: Caller,
  raw: { name?: unknown; motto?: unknown; policy?: unknown; emblem?: unknown; color?: unknown },
  now: number = Date.now(),
): Promise<Founded> {
  const corpId = await corpIdOf(env, caller.id);
  if (!corpId) return { error: 'notmember' };

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const row = await corpById(env, corpId);
    if (!row) return { error: 'nosuch' };
    if (row.owner_id !== caller.id) return { error: 'notowner' };

    let name = row.name;
    let renamedAt = row.renamed_at;
    if (raw.name !== undefined) {
      const wanted = cleanName(raw.name);
      if (!wanted) return { error: 'badname' };
      if (wanted !== row.name) {
        const wait = row.renamed_at + RENAME_EVERY_MS - now;
        if (row.renamed_at && wait > 0) return { error: 'renamed', wait };
        name = wanted;
        renamedAt = now;
      }
    }

    const motto = raw.motto === undefined ? row.motto : cleanMotto(raw.motto);
    const policy: Policy =
      raw.policy === undefined ? row.policy : raw.policy === 'closed' ? 'closed' : 'open';

    /**
     * The mark and the colour, and NO COOLDOWN on either.
     *
     * A rename waits a week because a name is what everybody else knows this
     * corporation by and can be made to say something new every afternoon. A
     * mark cannot say anything: it is one of fourteen drawings and one of ten
     * colours, and no arrangement of those is a joke somebody has to be
     * protected from. So the thing the cooldown defends against does not exist
     * here, and charging a week for changing a colour would only be a rule.
     */
    const emblem = raw.emblem === undefined ? row.emblem : cleanEmblem(raw.emblem);
    const color = raw.color === undefined ? row.color : cleanColor(raw.color);

    let done;
    try {
      done = await env.DB.prepare(
        `UPDATE corps
            SET name = ?2, key = ?3, motto = ?4, emblem = ?5, color = ?6,
                policy = ?7, renamed_at = ?8,
                updated_at = MAX(updated_at + 1, ?9)
          WHERE id = ?1 AND updated_at = ?10`,
      )
        .bind(
          corpId, name, keyOf(name), motto, emblem, color, policy, renamedAt, now,
          row.updated_at,
        )
        .run();
    } catch {
      // The UNIQUE on `key`: somebody founded that name while this one was
      // being typed.
      return { error: 'taken' };
    }
    if (done.meta?.changes ?? 0) {
      // A closed door means the requests at it are still worth keeping; an
      // opened one means nobody has to wait any more, so let them all in
      // rather than leaving a queue nobody will ever answer.
      if (policy === 'open') {
        await env.DB.prepare(`DELETE FROM corp_requests WHERE corp_id = ?1`).bind(corpId).run();
      }
      return {};
    }
  }
  return { error: 'busy' };
}

/**
 * Everything this player leaves behind when their account is deleted.
 *
 * Exported as statements rather than run here, so the delete route keeps doing
 * what it does today: one batch, all of it or none. Leaving the corporation
 * properly — the handover, the empty-corporation sweep — is deliberately NOT
 * done: a deleted account is a row that has to vanish, and the tidying is
 * `mine`'s self-healing count and the next member to leave.
 */
export const forgetting = (env: Env, id: string) => [
  // First, while the membership row is still there to be read: give the seat
  // back. A statement per fact, in an order where each can see what the one
  // before it left.
  env.DB.prepare(
    `UPDATE corps SET members = members - 1
      WHERE members > 0
        AND id = (SELECT corp_id FROM corp_members WHERE player_id = ?1)`,
  ).bind(id),
  env.DB.prepare(`DELETE FROM corp_members WHERE player_id = ?1`).bind(id),
  env.DB.prepare(`DELETE FROM corp_requests WHERE player_id = ?1`).bind(id),
  env.DB.prepare(`DELETE FROM corp_moves WHERE player_id = ?1`).bind(id),
  // Their events go with them. A feed line naming somebody who no longer
  // exists is a name the game has kept after being told to forget it.
  env.DB.prepare(`DELETE FROM corp_feed WHERE actor_id = ?1`).bind(id),
  // And a corporation whose last member was this player is now empty, which is
  // a state a corporation is not allowed to be in. Its feed went with the row
  // above — every line in it was theirs, because they were the only one there.
  // The count alone is not trusted for a deletion: a corporation is removed
  // only when it truly has nobody in it.
  env.DB.prepare(
    `DELETE FROM corps WHERE members <= 0 AND id NOT IN (SELECT corp_id FROM corp_members)`,
  ),
  env.DB.prepare(`DELETE FROM corp_requests WHERE corp_id NOT IN (SELECT id FROM corps)`),
];
