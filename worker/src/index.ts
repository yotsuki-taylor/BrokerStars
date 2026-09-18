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
import { NAME_MAX, seasonOf, type Metric } from '../../src/corp/protocol';
import { DUEL_CODE_LENGTH, DUEL_TTL_MS, normalizeCode } from '../../src/duel/protocol';
import { cleanCode } from '../../src/friends/protocol';
import { cleanLinkCode } from '../../src/link/protocol';
import { HISTORY_DAYS, marketFor } from '../../src/market/protocol';
import { SCAN_LIMIT, priceTable, rankByWorth, type Holder } from './board';
import {
  RENAME_EVERY_MS,
  cleanClaim,
  cleanNick,
  cleanOutfit,
  cleanSeen,
  nickKey,
  type NickError,
} from '../../src/profile/protocol';
import { RARITIES, SLOTS, type Rarity, type Slot } from '../../src/ui/wardrobe';
import { answerUpdate, chatShout, duelPush } from './bot';
import { chatAvailable, markShout, mayShout, waitLeft } from './chat';
import { cleanFeedback } from '../../src/feedback/protocol';
import {
  cleanAbout,
  deliver,
  feedbackAvailable,
  markWrite,
  mayWrite,
  waitLeft as feedbackWaitLeft,
} from './feedback';
import * as calls from './calls';
import * as corps from './corps';
import * as friends from './friends';
import * as link from './link';
import * as profiles from './profile';
import * as invites from './invites';
import {
  REWARDS,
  alreadyPaid,
  record,
  topLeague,
  type Env,
  type Outcome,
  type Row,
} from './results';
import {
  botUsername,
  sendMessage,
  type Caller,
  sameSecret,
  webhookSecret,
} from './telegram';
import { identify, isGuest, mintGuest, mintSession, verifyGoogleIdToken } from './auth';

export { Duel } from './duel';
export { verifyInitData } from './telegram';
export { identify, mintGuest, mintSession, readSession, verifyGoogleIdToken } from './auth';
export type { Env } from './results';

/**
 * Can this deployment tell anybody from anybody? Telegram needs the bot token,
 * an Android session needs the key it was signed with, and a deployment with
 * neither has no way to know who is asking — so it accepts nothing, which is
 * the same fail-closed answer the bot token alone used to give.
 */
const canAuth = (env: Env): boolean => Boolean(env.BOT_TOKEN || env.SESSION_SECRET);

/**
 * The oldest Android package this server will still talk to, by `versionCode`.
 * Announced on `/health`; a package below it puts up a wall and sends the
 * player to Play (`src/ui/update.ts`).
 *
 * NOT "the latest build". The latest build is published every time anything
 * ships, and a game that demanded an update on every routine release would
 * teach people to tap through the demand. This is the floor: the number below
 * which a package is not merely old but WRONG — it talks to a route that no
 * longer exists, or holds a bug bad enough that playing on it is worse than not
 * playing. Raising it is a decision about a specific broken build, not
 * housekeeping.
 *
 * ZERO MEANS NOBODY IS BLOCKED, and that is the resting state. It is also the
 * way back: this is a wall with no door in it for the player, so a number set
 * higher than what Play is actually serving locks out everybody who obeys it
 * until a deploy fixes the number. That deploy is about forty seconds from a
 * push, which is the only reason a hard wall is defensible here at all.
 *
 * ONLY ANDROID CAN BE STALE. The mini app and the browser fetch the bundle from
 * Pages at every launch, so there is no old copy of them to find. The client
 * checks the platform before it checks this number.
 *
 * THIS CANNOT RESCUE A PACKAGE THAT CANNOT REACH US. The number travels over
 * the network; a build that has no route to this Worker never asks and never
 * hears. 1.1.1 shipped pointing at a developer's own machine and was exactly
 * that case. The wall is for builds that are old, not for builds that are
 * broken — `.env.android` is what stops the second kind.
 */
const MIN_BUILD = 25;

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
  if (!canAuth(env)) {
    // Fail closed. With neither key nothing can be told from anything, and a
    // board that accepts unsigned scores is worse than no board.
    return bad(503, 'no auth configured');
  }

  let body: Submission;
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  // `authToken` and `token` below are two different things sharing a word: one
  // says who is handing a match in, the other names the match so it can be
  // handed in twice without being paid for twice.
  const authToken = typeof body.initData === 'string' ? body.initData : '';
  const caller = await identify(authToken, env);
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
  // `top_league` comes along for the ride: `record` below raises it to whatever
  // this match was played in, so the value read here is the last moment
  // anything can tell that this league is a new one for this player. That is
  // the whole of what a corporation's feed is told about a league.
  const existing = await env.DB.prepare(
    `SELECT updated_at, top_league FROM players WHERE id = ?1`,
  )
    .bind(caller.id)
    .first<{ updated_at: number; top_league: number }>();

  if (existing && now - existing.updated_at < MIN_SECONDS_BETWEEN_RESULTS * 1000) {
    return bad(429, 'too soon');
  }

  const table = REWARDS[league];
  const base = outcome === 'win' ? table.win : outcome === 'draw' ? table.draw : 0;
  const stars = base + (tradedWell ? table.profit : 0);

  try {
    await record(env, caller, { seed, league, outcome, netWorth, tradedWell, stars, token });
    // The welcome present, after the match is safely banked rather than before.
    await profiles.giftFirstHat(env, caller);
    // And the pair of fifties, if this is the match that earns them. Here
    // rather than where the code was redeemed: `invites.settle` says why.
    await invites.settle(env, caller);
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
    const applied = await profiles.settle(env, caller, {
      league,
      facts: { outcome, netWorth, tradedWell, bankrupt, trades, duel: false },
      companies,
    });

    // And the corporation, if this player is in one. All of it is fire and
    // forget — `corps` swallows its own failures, because a match that was
    // played and paid must not fail over a line in somebody's feed.
    //
    // The coins are the ones the SERVER just decided to pay, not a number that
    // came off the wire, which is the same rule the board is kept under.
    await corps.credit(env, caller.id, { coins: stars });
    // A league nobody in this corporation has seen this player reach before.
    // Off `players.top_league`, which only ever goes up, so it cannot be
    // announced twice — and only from a match against a bot, because the
    // ladder is deliberately climbed against bots (`profiles.settle`).
    if (league > (existing?.top_league ?? 0)) {
      await corps.note(env, caller, 'league', String(league));
    }
    for (const id of applied.gained ?? []) await corps.note(env, caller, 'award', id);
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
 * A session for somebody who has not said who they are.
 *
 * The only route here that asks for nothing, because asking is the thing it
 * exists to avoid: a browser tab and a fresh install are both nobody, and a
 * player who is nobody cannot join a duel, be added as a friend, or be written
 * down anywhere. See `mintGuest`.
 *
 * Nothing is stored, so this cannot be used to fill a database. What it can do
 * is hand out identities to anybody who asks, which is the deal: an anonymous
 * account is worth what it costs to make.
 */
async function guestSignIn(_request: Request, env: Env) {
  if (!env.SESSION_SECRET) return bad(503, 'no session secret configured');
  const { token, caller } = await mintGuest(env.SESSION_SECRET);
  return json({ ok: true, token, id: caller.id, name: caller.name });
}

/**
 * Sign in with Google, once, and leave with a session.
 *
 * The only route in the Worker that accepts a Google token, and it accepts it
 * exactly once per sign-in: what goes back is a token of ours (`auth.ts`),
 * which is what every subsequent request carries. A client that kept sending
 * Google's would put Google's key server in the path of every trade and would
 * have to re-authenticate every hour.
 *
 * Two ways to be unconfigured and they mean different things. No
 * `SESSION_SECRET` and there is nothing to sign a session with; no
 * `GOOGLE_CLIENT_ID` and there is no way to tell a token minted for this game
 * from one minted for any other application, which is the whole check. Either
 * way the honest answer is that this deployment does not do Google sign-in.
 */
async function googleSignIn(request: Request, env: Env) {
  if (!env.SESSION_SECRET) return bad(503, 'no session secret configured');
  if (!env.GOOGLE_CLIENT_ID) return bad(503, 'no google client configured');

  let body: { idToken?: unknown; guest?: unknown };
  try {
    body = (await request.json()) as { idToken?: unknown; guest?: unknown };
  } catch {
    return bad(400, 'not json');
  }

  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const caller = idToken ? await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID) : null;
  if (!caller) return bad(401, 'bad token');

  /**
   * Was this player a guest a moment ago?
   *
   * If the same client still holds a guest session, whoever is holding both
   * tokens is both accounts — which is the same proof the typed code provides,
   * by a shorter route. So the Google account becomes a second door into the
   * guest's save rather than an empty room beside it, and a player who spent an
   * evening as a guest does not lose it by signing in.
   *
   * Best effort, and the sign-in stands either way. `adopt` refuses when the
   * Google account already has a game of its own, and that refusal is worth
   * reporting rather than acting on: nobody's save is lost, but one of the two
   * is not where the player is about to be looking. `adopted` says which
   * happened so the screen can.
   */
  const guest = typeof body.guest === 'string' ? body.guest : '';
  let adopted = false;
  if (guest) {
    const was = await identify(guest, env);
    if (was && isGuest(was.id)) adopted = (await link.adopt(env, caller, was.id)) === null;
  }

  return json({
    ok: true,
    token: await mintSession(caller, env.SESSION_SECRET),
    id: caller.id,
    name: caller.name,
    adopted,
  });
}

/* ---------------------------------------------------- one person, two ways in */

/**
 * Whether this player is linked to a second way in. What the settings screen
 * asks before it draws anything.
 */
async function linkState(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  return json({ ok: true, linked: await link.isLinked(env, asked.caller) });
}

/**
 * Mint a code for the account keeping its save, which is the Telegram one.
 *
 * Refused to an account that is already linked rather than quietly minting a
 * code that `redeem` would then refuse: the player asked a question, and "you
 * already are" is the answer to it.
 */
async function linkCode(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller } = asked;
  if (await link.isLinked(env, caller)) return json({ ok: false, error: 'already', linked: true });
  const minted = await link.mint(env, caller);
  return json({ ok: true, linked: false, ...minted });
}

/**
 * Spend a code. The caller is the account doing the joining — the Google one.
 *
 * Every way this can fail is a different sentence to the player, so the error
 * travels rather than a status: see `LinkError` in src/link/protocol.ts.
 */
async function linkRedeem(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  const code = cleanLinkCode(body.code);
  if (!code) return json({ ok: false, error: 'nosuch' });
  const error = await link.redeem(env, caller, code);
  return json({ ok: !error, error, linked: !error });
}

/** Undo it, from either end. The save is untouched; only the second door goes. */
async function linkUndo(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  await link.unlink(env, asked.caller);
  return json({ ok: true, linked: false });
}

/**
 * Is anybody calling this player out to a duel?
 *
 * Its own route rather than a field on something bigger because the game asks
 * this on a timer while the player sits in the menu, and asking for a whole
 * profile thirty seconds at a time to find out that nobody is waiting would be
 * a rude thing to do to a phone. `/profile` and `/friends` carry a call too,
 * for the two moments the game was going to ask anyway.
 *
 * Reading takes it: see `calls.take`.
 */
async function duelCall(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  return json({ ok: true, call: await calls.take(env, asked.caller) });
}

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
  if (!canAuth(env)) return bad(503, 'no auth configured');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad(400, 'not json');
  }
  const token = typeof body.initData === 'string' ? body.initData : '';
  const caller = await identify(token, env);
  if (!caller) return bad(401, 'bad signature');
  return { caller, body };
}

/** The whole profile, every time: the client's job is to draw what comes back. */
/**
 * The whole profile, every time, and whoever is calling this player out to a
 * duel if anybody is. `call` is absent on every route but `/profile` — see
 * `openProfile` — and null there whenever nobody is waiting.
 */
const sent = (a: profiles.Applied, call: calls.DuelCall | null = null) =>
  json({
    ok: !a.error,
    error: a.error,
    profile: profiles.view(a.held, a.earned, a.at),
    ...(call ? { call } : {}),
  });

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
  // Opening a session is the one profile route that also collects a waiting
  // duel call: it is what the game asks for first, and the answer it is
  // already waiting on. The buy and wear routes deliberately do not — a banner
  // that appeared because somebody bought a hat would be a surprise.
  const [applied, call] = await Promise.all([
    profiles.open(env, caller, claim),
    calls.take(env, caller),
  ]);
  // An open is a handshake WITH A CLAIM, and that is not a detail. This route
  // is asked twice over in a session: once when the game starts, carrying the
  // browser's own save as `claim` (`openProfile` in src/ui/api.ts), and again
  // after every match handed in and every duel paid out, carrying nothing
  // (`refreshProfile`). Counting the route would count matches; counting the
  // claim counts arrivals, which is the question being asked.
  //
  // Afterwards rather than alongside: `profiles.open` is what creates the row
  // on somebody's first ever open, and a counter racing it would miss exactly
  // the open worth having. It cannot fail the handshake -- see `countOpen`.
  if (claim) await profiles.countOpen(env, caller.id, Date.now());
  return sent(applied, call);
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
  const applied = await profiles.change(env, caller, (held) =>
    claim === 'bonus'
      ? profiles.claimBonus(held, now, env.MARKET_SALT ?? '')
      : profiles.claimQuest(held, claim, now),
  );

  /**
   * The bonus, and only the bonus, counts towards a corporation's season.
   *
   * WHY THE DOLLAR TABLE IS SAFE TO HAVE AT ALL. Dollars are going to be sold
   * for Telegram Stars one day, and a table ranking dollar balances would be a
   * table ranking what people spent. So nothing here reads a balance: what is
   * credited is the payout the server just made, at the moment it makes it, and
   * a dollar that arrives any other way — bought or granted — never passes
   * through this line. The other thing that does count is the profit on a sale
   * at the share counter, credited where that profit is worked out
   * (`tradeShares`). See `corps.credit`.
   *
   * A QUEST PAYS NOTHING HERE either, for the reason `claimQuest` keeps its
   * coins off the player board: two players with identical match records should
   * not be separated by which of them remembered to tap a button.
   *
   * THE DIVIDENDS GO IN WITH IT, which is why this credits what was paid rather
   * than the constant it used to name. They are dollars the game handed over,
   * on the day it handed them over, which is the whole of the rule this line
   * has always followed. What it costs is worth being honest about: a dividend
   * is paid for owning rather than for doing, so a member with a large book
   * contributes every day without playing, and a season is that much less a
   * measure of this month. The season already answers most of that by taking
   * the average rather than the sum — thirty quiet members cannot be carried by
   * one rich one — and the rest is a deliberate choice that shares are part of
   * how this game is played.
   *
   * Only when the claim actually succeeded — a refused bonus is a bonus that
   * was already taken today, and paying a season for it would pay twice.
   */
  if (!applied.error && applied.dollars) {
    await corps.credit(env, caller.id, { dollars: applied.dollars }, now);
  }
  return sent(applied);
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

/**
 * A name of the player's own, instead of the one their host handed over.
 *
 * DECIDED HERE, ALL OF IT. Whether the name is one this game will show a
 * stranger, whether somebody already has it, and whether this player may change
 * it yet: a client that asked nicely for any of those would be a client that
 * could answer for itself. The rules are the shared ones (`cleanNick` in
 * `src/profile/protocol.ts`), so the box greys its button on exactly the
 * condition this would have refused it on.
 *
 * TAKEN IS THE DATABASE'S ANSWER, not a query of its own. Asking first and
 * writing second leaves a gap two players can both walk through; the UNIQUE on
 * `name_key` cannot be raced, so the write is attempted and the refusal is
 * read off the failure. The same arrangement founding a corporation makes.
 */
async function nickname(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  const nick = cleanNick(body.nick);
  if (!nick) return json({ ok: false, error: 'badname' satisfies NickError });

  const now = Date.now();
  const row = await env.DB.prepare(`SELECT renamed_at, named FROM players WHERE id = ?1`)
    .bind(caller.id)
    .first<{ renamed_at: number; named: number }>();

  // A player who has never finished a match has no row yet, and that is not a
  // refusal: the row is made here instead, with the name already chosen.
  const renamedAt = row?.renamed_at ?? 0;
  const until = renamedAt + RENAME_EVERY_MS;
  if (row?.named === 1 && now < until) {
    return json({ ok: false, error: 'renamed' satisfies NickError, until });
  }

  try {
    if (row) {
      await env.DB.prepare(
        `UPDATE players
            SET name = ?2, name_key = ?3, named = 1, renamed_at = ?4, updated_at = ?4
          WHERE id = ?1`,
      )
        .bind(caller.id, nick, nickKey(nick), now)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO players (id, name, named, name_key, renamed_at, first_seen, updated_at)
              VALUES (?1, ?2, 1, ?3, ?4, ?4, ?4)`,
      )
        .bind(caller.id, nick, nickKey(nick), now)
        .run();
    }
  } catch {
    // The UNIQUE on `name_key`, which is the only constraint this write can
    // break: somebody has that name, spaces notwithstanding.
    return json({ ok: false, error: 'taken' satisfies NickError });
  }

  return json({ ok: true, nick });
}

/**
 * Delete everything this player is, and mean it.
 *
 * Google Play requires an app that signs people in to let them sign out
 * permanently — in the app, not by writing to somebody — and this is that
 * route. It is not Android-only: a Telegram player has exactly the same right
 * to it, and `whoIsAsking` already treats both the same.
 *
 * Every table keyed on a player id, in one batch so that a half-deleted player
 * cannot exist: the board row, the matches behind it, the profile with the
 * room and the wardrobe and the portfolio, the friend code, both directions of
 * every friendship, and the group-chat cooldown.
 *
 * `results` goes first for the foreign key it holds on `players`. Friendships
 * are deleted from both ends — a list with a dead name on it is what deleting
 * only one direction would leave behind.
 *
 * What is deliberately NOT here is anything that survives outside the database:
 * a duel this player is sitting in runs to the whistle in the object that owns
 * it, and messages the bot has already delivered are in somebody else's chat.
 * Both are gone within minutes; neither is the player's to recall.
 */
async function deleteAccount(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  // Typed out rather than tapped: a route that empties an account should not be
  // reachable by a mis-sent request, and the client asks for the word first.
  if (String(body.confirm ?? '') !== 'delete') return bad(400, 'not confirmed');

  const id = caller.id;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM results WHERE player_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM players WHERE id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM profiles WHERE id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM friend_codes WHERE player_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM friends WHERE player_id = ?1 OR friend_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM chat_shouts WHERE player_id = ?1`).bind(id),
    // The feedback cooldown. It holds an id and a timestamp and not one word
    // anybody wrote (`feedback.ts`), but "deleted" has to mean the row is gone
    // rather than mostly gone -- and a stale cooldown would otherwise be the
    // one thing a deleted account left behind to be counted against the next.
    env.DB.prepare(`DELETE FROM feedback_sent WHERE player_id = ?1`).bind(id),
    // The corporation: their membership, their season, anything they asked
    // for, and every line of every feed with their name on it. `forgetting`
    // hands back statements rather than running them, so this route keeps its
    // one promise — one batch, all of it or none (`worker/src/corps.ts`).
    ...corps.forgetting(env, id),
  ]);

  // The session the request arrived on still verifies — it is signed, not
  // stored — so the client is told to throw it away. The next thing it sends
  // will simply open a new and empty account, which is what a deleted one is.
  return json({ ok: true, signOut: true });
}

/**
 * The dollar board: who is richest at the share counter.
 *
 * It ranks cash PLUS shares at today's prices, not the balance — see
 * `board.ts` for why a table of bare balances would rank people for refusing
 * to play. The sort key is therefore not something SQL can produce: a
 * portfolio is JSON and a price is a four-hundred-day fold, so the rows are
 * read and valued here.
 *
 * The join to `players` is what supplies the name — `profiles` has no such
 * column — which means a player who has taken bonuses but never finished a
 * match does not appear. That is the schema talking rather than a rule: there
 * is nothing to call them yet.
 */
async function dollarTop(env: Env, limit: number, me: string | null) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, pl.name, p.dollars, p.portfolio
       FROM profiles p
       JOIN players pl ON pl.id = p.id
      WHERE p.dollars > 0 OR p.portfolio <> '{}'
      ORDER BY p.updated_at DESC
      LIMIT ?1`,
  )
    .bind(SCAN_LIMIT)
    .all<Holder>();

  const prices = priceTable(dayOf(Date.now()), env.MARKET_SALT ?? '');
  return json(rankByWorth(results ?? [], prices, limit, me));
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
  const applied = await profiles.change(env, caller, (held) =>
    profiles.trade(held, id, shares, sell, env.MARKET_SALT ?? '', now),
  );

  /**
   * A sale that came out ahead counts towards the corporation's season.
   *
   * WHAT IS CREDITED IS THE PROFIT, NOT THE PROCEEDS, and that is the whole
   * care in this line. Sell what was bought a minute ago and the proceeds are
   * the player's own dollars coming back; crediting those would let anybody
   * mint a season out of one purchase and one sale, for ever. `sellShares`
   * works out what those particular shares cost and hands back the difference.
   *
   * A loss counts as nothing rather than as a subtraction — a decision about
   * the game, written down in `profiles.trade` where the number is decided.
   *
   * Only when the change actually landed: a refused trade is a trade that did
   * not happen, and `change` answers with the profile either way.
   */
  if (!applied.error && applied.dollars) {
    await corps.credit(env, caller.id, { dollars: applied.dollars }, now);
  }
  return sent(applied);
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

/**
 * The invitation as an ordinary web address.
 *
 * The other link — `t.me/<bot>?start=…` — is the right one to hand somebody
 * inside Telegram and the wrong one everywhere else: a phone with the Android
 * app and no Telegram on it cannot open it at all. This is the one that works
 * for anybody. It lands on the game's own page, which reads `?d=` and `?f=`
 * exactly as it always has (src/ui/duel.ts, src/ui/friends.ts), so a recipient
 * with no app plays in the browser rather than being told to go and install
 * something.
 *
 * Deliberately not `brokerstars://`. A custom scheme opens the app and nothing
 * else: paste one into a chat and most apps will not even make it tappable,
 * and a recipient without the app gets a dead link with no explanation. The
 * scheme is for waking the app once something else has decided to hand over —
 * not for sending to people.
 *
 * Null when this deployment does not know where the game is served from, which
 * is the same condition that already leaves the bot unable to build a button.
 */
export function webInvite(env: Env, key: 'd' | 'f', code: string): string | null {
  if (!env.WEBAPP_URL) return null;
  // The fragment goes and the query stays. A `#` and everything after it never
  // reaches a server or a query string, so a code appended past one would make
  // a link that looks right and does nothing; a query, on the other hand, is
  // somebody's deliberate configuration and is not ours to drop.
  const base = env.WEBAPP_URL.replace(/#.*$/, '');
  const join = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&';
  return `${base}${join}${key}=${encodeURIComponent(code)}`;
}

const duelStub = (env: Env, code: string) => env.DUEL.get(env.DUEL.idFromName(`duel:${code}`));

async function newDuel(request: Request, env: Env) {
  if (!canAuth(env)) return bad(503, 'no auth configured');

  let body: { initData?: unknown; outfit?: unknown; league?: unknown; invite?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  const token = typeof body.initData === 'string' ? body.initData : '';
  const caller = await identify(token, env);
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
  //
  // No bot token, no link: a deployment that only serves the Android build has
  // no bot to route anybody through, and `link` being null is a case the duel
  // screen has always had to draw anyway.
  const bot = env.BOT_TOKEN ? await botUsername(env.BOT_TOKEN) : null;
  const link = bot ? `https://t.me/${bot}?start=duel_${code}` : null;

  // Called somebody out by name from the friends list? Then the invitation is
  // pushed into their Telegram rather than handed over by the player, and
  // `sent` says whether it landed — a friend who has blocked the bot cannot be
  // written to, and the screen falls back to the link it already has.
  //
  // Being on the list is the permission: the bot can message anybody who ever
  // started it, so without this check the route would be a way to have it
  // message a stranger.
  const invite = String(body.invite ?? '').slice(0, 32);
  let sent = false;
  if (invite && (await friends.areFriends(env, caller.id, invite))) {
    // The bot reaches whoever it can address, which is a friend playing in
    // Telegram: their id IS their chat there. It is worth more than the note
    // below because it lights up a phone that is not looking at the game.
    if (env.BOT_TOKEN && env.WEBAPP_URL) {
      sent = await sendMessage(env.BOT_TOKEN, invite, duelPush(env.WEBAPP_URL, code, caller.name));
    }
    // And the call waits for everybody, including the friend the bot has no
    // way to write to at all — which is every player signed in with Google,
    // and is why this exists (worker/src/calls.ts).
    await calls.place(env, invite, caller, code, expiresAt);
  }

  // A ladder position the guest has not climbed is not a payout — see
  // `topLeague`. Telling the host now is friendlier than at the whistle.
  //
  // `chat` is whether this deployment has a group to call the duel out in. The
  // screen asks for it here rather than at its own route because it is asking
  // whether to draw a button, and this is the answer it is already waiting on.
  return json({
    ok: true,
    code,
    link,
    webLink: webInvite(env, 'd', code),
    expiresAt,
    sent,
    // Both halves of the same question: has this deployment a chat at all, and
    // may THIS caller write into it. The screen is asking whether to draw a
    // button, and a button that is only ever refused is worse than none.
    chat: chatAvailable(env) && mayShout(caller.id),
    // ...and when the answer is no, whether signing in would change it. There
    // is a chat here and this player simply has no name yet, which is a
    // different thing from a deployment that has no chat at all -- the first
    // is worth telling somebody about, the second is nobody's business.
    chatNeedsAccount: chatAvailable(env) && !mayShout(caller.id),
    yourLeague: await topLeague(env, caller.id),
  });
}

/**
 * Call this duel out in the game's group chat.
 *
 * The button behind it is for the player who has nobody: no friends on the
 * list, nobody to hand a link to, and a fifteen-minute invitation going stale
 * in their hand. The bot says their name in the chat and puts the seat up for
 * whoever taps first.
 *
 * Signed, because it makes the bot speak in a room full of people and the one
 * thing that must not be possible is doing it as somebody else. Rate limited
 * for the same reason, in `chat.ts` — and the cooldown is charged only once
 * Telegram has said the message landed, so a chat that is unreachable never
 * costs the player their turn.
 *
 * The code is not checked against the duel it names. It is sixty bits minted a
 * moment ago and known to one phone, so a wrong one is a player shouting a
 * dead link into a chat under their own name, once every ten minutes — which
 * is a thing nobody wants to do rather than a thing to defend against.
 */
async function shoutDuel(request: Request, env: Env) {
  if (!env.BOT_TOKEN) return bad(503, 'no bot token configured');
  if (!chatAvailable(env)) return json({ ok: false, reason: 'nochat' });

  let body: { initData?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  const token = typeof body.initData === 'string' ? body.initData : '';
  const caller = await identify(token, env);
  if (!caller) return bad(401, 'bad signature');

  const code = normalizeCode(String(body.code ?? ''));
  if (!code) return bad(400, 'no such duel');

  // Refused before the cooldown is even read: a guest has no turn to wait for.
  // The button is not drawn for them either (`/duel/new` below), so reaching
  // here means a client that has not been reloaded since this shipped.
  if (!mayShout(caller.id)) return json({ ok: false, reason: 'guest' });

  const now = Date.now();
  const wait = await waitLeft(env, caller.id, now);
  if (wait > 0) return json({ ok: false, reason: 'wait', wait });

  const bot = await botUsername(env.BOT_TOKEN);
  if (!bot) return json({ ok: false, reason: 'nolink' });

  const sent = await sendMessage(
    env.BOT_TOKEN,
    String(env.CHAT_ID),
    chatShout(bot, code, caller.name),
  );
  if (!sent) return json({ ok: false, reason: 'failed' });

  await markShout(env, caller.id, now);
  return json({ ok: true });
}

/**
 * Something a player wanted to say.
 *
 * Signed like everything else that writes, and that costs nobody a sign-in
 * screen: a Telegram player arrives with `initData` and everybody else with a
 * guest session the client mints on its own (`src/ui/guest.ts`). So the box is
 * open to whoever is playing, which is the point -- see `mayWrite` for why this
 * does NOT copy the chat's rule of refusing guests.
 *
 * Nothing is written down but the cooldown. The text goes into a Telegram
 * message and out of memory; if delivery fails the player is told so while
 * their words are still in the box, rather than having them queued into a
 * table of everybody's complaints.
 */
async function feedback(request: Request, env: Env) {
  if (!feedbackAvailable(env)) return json({ ok: false, reason: 'noserver' });

  let body: { initData?: unknown; text?: unknown; replyTo?: unknown; about?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad(400, 'not json');
  }

  const token = typeof body.initData === 'string' ? body.initData : '';
  const caller = await identify(token, env);
  if (!caller) return bad(401, 'bad signature');
  if (!mayWrite()) return json({ ok: false, reason: 'refused' });

  const cleaned = cleanFeedback(body.text, body.replyTo);
  if (!cleaned.ok) return json({ ok: false, reason: cleaned.reason });

  const now = Date.now();
  const wait = await feedbackWaitLeft(env, caller.id, now);
  if (wait > 0) return json({ ok: false, reason: 'wait', wait });

  const sent = await deliver(env, caller, cleaned.text, cleaned.replyTo, cleanAbout(body.about));
  if (!sent) return json({ ok: false, reason: 'failed' });

  await markWrite(env, caller.id, now);
  return json({ ok: true });
}

/* --------------------------------------------------------------- friends */

/**
 * The friends menu, both halves of it: the caller's own invitation link, and
 * the list of everybody who has ever tapped one of theirs or had one tapped.
 *
 * Signed like the profile routes and for the same reason — a list of who
 * somebody knows is not the leaderboard, and there is nobody it is public
 * reading for. The code is minted here the first time it is asked for, so
 * nothing has to happen when a player is created.
 */
async function myFriends(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller } = asked;
  return json(await friendList(env, caller));
}

/**
 * Adding one. The body carries a code and nothing else that is believed: who
 * it belongs to, whether it is the caller's own, and whether either side is
 * full are all worked out on this side (`friends.befriend`).
 *
 * A refusal answers 200 with the list in it, exactly like a refused purchase
 * does — the cure for a client whose picture of the world is out of date is
 * the up to date one rather than an error code. The screen shows the sentence
 * and the list underneath is already right.
 */
async function addFriend(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  const code = cleanCode(body.code);
  const error = code ? await friends.befriend(env, caller, code) : 'nosuch';
  return json({ ...(await friendList(env, caller)), ok: !error, error });
}

/** The whole answer, every time: the client's job is to draw what comes back. */
async function friendList(env: Env, caller: Caller) {
  const [code, list, bot, call, invite] = await Promise.all([
    friends.codeFor(env, caller),
    friends.list(env, caller.id),
    // The link goes through the bot rather than straight at the game, for the
    // reason a duel's does: the friend it lands on may never have opened the
    // mini app, and `?start=` is the one door Telegram opens for somebody who
    // has not.
    env.BOT_TOKEN ? botUsername(env.BOT_TOKEN) : null,
    // The friends screen is the other place a call belongs: it is the screen
    // the caller used, and the one their friend is most likely to be looking
    // at when the invitation lands.
    calls.take(env, caller),
    // What the invitation card on that screen draws itself from.
    invites.standing(env, caller),
  ]);
  return {
    ok: true,
    code,
    link: bot ? `https://t.me/${bot}?start=friend_${code}` : null,
    webLink: webInvite(env, 'f', code),
    friends: list,
    invite,
    ...(call ? { call } : {}),
  };
}

/* ------------------------------------------------------- the corporations */

/**
 * Every corporation route answers the same way: what the caller asked for, if
 * anything, and then the corporation as it stands afterwards.
 *
 * It is the habit the profile and friends routes already have, and it is worth
 * the extra read here more than it is there. Everything a corporation does is
 * done to a shared thing — thirty people can be changing it at once — so a
 * client that acted on what it was looking at a second ago has to be told what
 * is actually true, and the only useful answer to "that did not work" is the
 * state in which it did not.
 *
 * A refusal is therefore 200 with `error` in it, exactly like a refused
 * purchase, and the screen draws the sentence with the right list underneath.
 */
const corpSent = async (env: Env, caller: Caller, out: corps.Founded = {}) =>
  json({
    ok: !out.error,
    error: out.error,
    wait: out.wait,
    corp: await corps.mine(env, caller, Date.now()),
  });

/** What the caller is in, if anything. The screen's first question. */
async function myCorp(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  return corpSent(env, asked.caller);
}

/**
 * Just the feed, which is what the open screen asks for every ten seconds.
 *
 * Its own route for the reason `/duel/call` is its own route: this one runs on
 * a timer, and fetching a whole corporation — thirty members, their season, two
 * ranking queries — to find out that nothing has happened would be a rude thing
 * to do to a phone.
 */
async function corpFeed(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const corpId = await corps.corpIdOf(env, asked.caller.id);
  if (!corpId) return json({ ok: true, feed: [] });
  return json({ ok: true, feed: await corps.feedOf(env, corpId, Date.now()) });
}

/** The list a player with no corporation reads, and the search box over it. */
async function corpList(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const query = String(asked.body.query ?? '').slice(0, NAME_MAX);
  const limit = Math.min(50, Math.max(1, Math.floor(Number(asked.body.limit) || 25)));
  return json({ ok: true, corps: await corps.browse(env, query, limit, Date.now()) });
}

async function corpNew(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  return corpSent(env, caller, await corps.create(env, caller, body as never));
}

async function corpJoin(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  return corpSent(env, caller, await corps.join(env, caller, body));
}

async function corpLeave(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  return corpSent(env, asked.caller, await corps.leave(env, asked.caller));
}

/**
 * Everything the owner can do, behind one route with a word in the body.
 *
 * One route rather than five because they want the same signature check, the
 * same "you are not the owner" refusal and the same answer — and the thing they
 * differ in is which line of `corps.ts` decides. The same arrangement
 * `/profile/daily` makes of the bonus and the quests.
 */
async function corpOwner(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;
  const who = String(body.player ?? '').slice(0, 32);

  switch (String(body.does ?? '')) {
    case 'edit':
      return corpSent(env, caller, await corps.edit(env, caller, body));
    case 'kick':
      return corpSent(env, caller, await corps.kick(env, caller, who));
    case 'transfer':
      return corpSent(env, caller, await corps.transfer(env, caller, who));
    case 'accept':
      return corpSent(env, caller, await corps.answer(env, caller, who, true));
    case 'refuse':
      return corpSent(env, caller, await corps.answer(env, caller, who, false));
    case 'disband':
      // Typed out rather than tapped, like deleting an account: a route that
      // ends something thirty people are in should not be reachable by a
      // mis-sent request.
      if (String(body.confirm ?? '') !== 'disband') return bad(400, 'not confirmed');
      return corpSent(env, caller, await corps.disband(env, caller));
    default:
      return bad(400, 'no such change');
  }
}

/**
 * Leaving an invitation to a duel in the feed, and taking one that is there.
 *
 * The invitation itself is minted by `/duel/new` exactly as it always was —
 * this only writes the card that points at it, which is why the code arrives
 * from the client rather than being made here. See `corps.callOut` for why a
 * code is not checked against the duel it names.
 */
async function corpDuel(request: Request, env: Env) {
  const asked = await whoIsAsking(request, env);
  if (asked instanceof Response) return asked;
  const { caller, body } = asked;

  const take = Math.floor(Number(body.take));
  if (Number.isFinite(take) && take > 0) {
    const out = await corps.takeDuel(env, caller, take);
    return typeof out === 'string'
      ? json({ ok: false, error: out, corp: await corps.mine(env, caller, Date.now()) })
      : json({ ok: true, code: out.code });
  }

  const code = normalizeCode(body.code);
  const expiresAt = Math.floor(Number(body.expiresAt));
  if (!code || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return bad(400, 'no such invitation');
  }
  // Never longer than an invitation actually lives, whatever the body says: a
  // card that outlives its seat is a card that sends people at a dead lobby.
  const dies = Math.min(expiresAt, Date.now() + DUEL_TTL_MS);
  const error = await corps.callOut(env, caller, code, dies);
  return json({ ok: !error, error });
}

/**
 * The table of corporations, under the same public reading the two player
 * boards get: it is the same answer for everybody, it carries nobody's
 * identity, and naming your own corporation only decides which row is
 * highlighted.
 */
function corpTop(env: Env, url: URL) {
  const metric: Metric = url.searchParams.get('metric') === 'dollars' ? 'dollars' : 'coins';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
  return corps
    .table(env, metric, limit, url.searchParams.get('me'), Date.now())
    .then((t) => json({ ...t, metric, season: seasonOf(Date.now()) }));
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

  // The name is needed only for a group, where the buttons have to be links
  // rather than mini-app launches — see `answerUpdate`. Cached for the life of
  // the isolate, so this is one call on the first update and none after it.
  const answer = answerUpdate(update, env.WEBAPP_URL, await botUsername(env.BOT_TOKEN));
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
        signedWrites: canAuth(env),
        duels: Boolean(env.DUEL),
        bot: Boolean(env.BOT_TOKEN && env.WEBAPP_URL),
        chat: chatAvailable(env),
        // which doors this deployment actually opens, so a build that cannot
        // sign anybody in finds out from the server rather than from a 401
        telegram: Boolean(env.BOT_TOKEN),
        google: Boolean(env.SESSION_SECRET && env.GOOGLE_CLIENT_ID),
        // and what it expects OF a client, which is the other half of the same
        // question this route already answers — see MIN_BUILD
        minBuild: MIN_BUILD,
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

    // The same public reading the coin board is, and highlighted the same way:
    // naming yourself decides which row is yours and claims nothing.
    if (url.pathname === '/top/dollars' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
      return dollarTop(env, limit, url.searchParams.get('me'));
    }

    if (request.method === 'POST') {
      if (url.pathname === '/auth/guest') return guestSignIn(request, env);
      if (url.pathname === '/auth/google') return googleSignIn(request, env);
      if (url.pathname === '/profile') return openProfile(request, env);
      if (url.pathname === '/profile/buy') return buy(request, env);
      if (url.pathname === '/profile/wear') return wear(request, env);
      if (url.pathname === '/profile/daily') return daily(request, env);
      if (url.pathname === '/profile/trade') return tradeShares(request, env);
      if (url.pathname === '/profile/refund') return refund(request, env);
      if (url.pathname === '/profile/nick') return nickname(request, env);
      if (url.pathname === '/profile/delete') return deleteAccount(request, env);
      if (url.pathname === '/link') return linkState(request, env);
      if (url.pathname === '/link/code') return linkCode(request, env);
      if (url.pathname === '/link/redeem') return linkRedeem(request, env);
      if (url.pathname === '/link/undo') return linkUndo(request, env);
      if (url.pathname === '/duel/call') return duelCall(request, env);
      if (url.pathname === '/friends') return myFriends(request, env);
      if (url.pathname === '/friends/add') return addFriend(request, env);
      if (url.pathname === '/corp') return myCorp(request, env);
      if (url.pathname === '/corp/feed') return corpFeed(request, env);
      if (url.pathname === '/corp/list') return corpList(request, env);
      if (url.pathname === '/corp/new') return corpNew(request, env);
      if (url.pathname === '/corp/join') return corpJoin(request, env);
      if (url.pathname === '/corp/leave') return corpLeave(request, env);
      if (url.pathname === '/corp/owner') return corpOwner(request, env);
      if (url.pathname === '/corp/duel') return corpDuel(request, env);
    }

    // Public reading, like both player boards and for the same reason: it is
    // the same table for everybody and naming your own corporation claims
    // nothing, it only decides which row is highlighted.
    if (url.pathname === '/corp/top' && request.method === 'GET') return corpTop(env, url);

    if (url.pathname === '/duel/new' && request.method === 'POST') return newDuel(request, env);

    if (url.pathname === '/duel/shout' && request.method === 'POST') return shoutDuel(request, env);
    if (url.pathname === '/feedback' && request.method === 'POST') return feedback(request, env);

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
