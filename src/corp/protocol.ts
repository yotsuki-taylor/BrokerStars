/**
 * What a corporation is, on both sides of the wire.
 *
 * The client reads this from `src/ui/CorpScreen.tsx` and the Worker from
 * `worker/src/corps.ts`, so the shape is written once and a change to it breaks
 * the build on both ends rather than in production — the same bargain
 * `src/duel/protocol.ts`, `src/daily/protocol.ts` and `src/friends/protocol.ts`
 * strike.
 *
 * A corporation is a list of players with a name on it. It is deliberately not
 * a guild in the usual sense: there is no bank, no war, no chest, no officers,
 * and nothing anybody can spend. What it buys is two things — a table to be in
 * together, and a place where an invitation to a duel can be left for thirty
 * people instead of one.
 *
 * TWO RULES THE REST OF THE FILE IS ABOUT.
 *
 * ONE PLAYER, ONE CORPORATION. Not a policy so much as a primary key: a
 * membership row is keyed on the player, so there is no state in which somebody
 * belongs to two and no query that has to decide which one counts.
 *
 * THE SEASON IS A CALENDAR MONTH, UTC, AND NOTHING RUNS AT MIDNIGHT. A
 * contribution row carries the season it is about, exactly the way a day's
 * quests carry the day they are about (`src/daily/protocol.ts`): when the key
 * stops matching, the numbers under it simply stop counting and are overwritten
 * by the next thing written. There is no job that rolls everybody over on the
 * first of the month, because a job like that is a job that fails on the one
 * night of the year anybody is watching.
 */

import { cleanColor, cleanEmblem } from './emblems';

/* ------------------------------------------------------------- the numbers */

/**
 * The ceiling. Thirty is about the size of a room where a name still means
 * something — past that the member list is a phone book and the feed is a
 * stream nobody reads. It is also small enough that the average below is an
 * average over people who actually play rather than over a crowd.
 *
 * Enforced on the SERVER and atomically (`worker/src/corps.ts`): two people
 * taking the last seat in the same second is exactly the case that happens.
 */
export const MAX_MEMBERS = 30;

/**
 * How many members a corporation needs before it is in the table at all.
 *
 * Without a floor the top of a table of averages is a corporation of one very
 * good player, which is a leaderboard of individuals wearing a hat. Three is
 * the smallest number that cannot be one person and a rounding error.
 */
export const MIN_RANKED = 3;

/** Name, tag and motto, in characters. See `cleanName` for why they are tight. */
export const NAME_MIN = 3;
export const NAME_MAX = 20;
export const TAG_MIN = 2;
export const TAG_MAX = 4;
export const MOTTO_MAX = 60;

/**
 * Renaming, no oftener than this.
 *
 * A name is what everybody else knows a corporation by — it is in the table, in
 * thirty feeds and in whatever anybody has screenshotted. A name that can be
 * changed on a whim is a name that can be a different joke every afternoon, and
 * there is nobody here to moderate the afternoons.
 */
export const RENAME_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * And leaving, no oftener than this.
 *
 * The table is an average over a season, so without a cooldown the last day of
 * every month is a stampede into whoever is winning: a contribution does not
 * travel, but a body does, and thirty bodies arriving on the 30th would move an
 * average by arithmetic alone. A day is long enough to make that not worth
 * planning and short enough that leaving a corporation you dislike is not a
 * punishment.
 */
export const SWITCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * How much of the feed is kept: the last sixty events, and nothing older than a
 * week, whichever bites first.
 *
 * Both, rather than either. A quiet corporation would keep three months of its
 * own history under a count alone, and a loud one would lose an afternoon under
 * a deadline alone. Neither is a feed anybody wants to scroll.
 */
export const FEED_KEEP = 60;
export const FEED_DAYS = 7;

/** An invitation code is this long. Base32 without vowels, like every other. */
export const CORP_CODE_LENGTH = 8;

/**
 * How often the screen asks for the feed while it is open.
 *
 * Ten seconds, and a socket was considered and rejected. Duels have one because
 * a duel ticks twice a second and both ends have to agree about when an ability
 * went off; a feed is a list that changes when somebody does something, which
 * is a few times an hour in a busy corporation. A socket for that is a
 * connection held open all evening to carry nothing, on a phone.
 *
 * The polling stops when the screen is hidden (`visibilitychange`), so a game
 * left open in a background tab costs nothing at all.
 */
export const FEED_POLL_MS = 10_000;

/* ------------------------------------------------------------- the shapes */

/**
 * How somebody gets in.
 *
 * `open` — tap and you are in. `closed` — tap and the owner is asked. The
 * invitation code works either way and is the third door: it is a standing code
 * like a friend code rather than a minted one like a duel's, because it is
 * handed to people you already know and nobody is standing at the other end of
 * it waiting.
 */
export type Policy = 'open' | 'closed';

/** Which table. The two are ranked on different things — see `averageOf`. */
export type Metric = 'coins' | 'dollars';

/**
 * What the game can put in a feed, and the whole of it: there is no free text
 * anywhere in this feature.
 *
 * WHY NOT A CHAT. A box that strangers can type into is a moderation duty, and
 * a moderation duty is not something a game can decide to have on Tuesdays. It
 * cannot be turned off once it exists, it cannot be staffed by one developer,
 * and the first thing it would carry is the thing that gets an app taken off a
 * store. Telegram is one tap away and is very good at chat; this is not the
 * place to build a worse one.
 *
 * What is left is worth more than it sounds. A feed only the game writes is a
 * feed with no noise in it: every line is something that actually happened.
 */
export type FeedKind =
  /** somebody left an invitation to a duel, and it is live until it is not */
  | 'duel'
  | 'joined'
  | 'left'
  /** a member finished a match in a league they had never reached before */
  | 'league'
  /** a member put something new on their shelf (`src/awards/catalogue.ts`) */
  | 'award';

/** One line of the feed. `detail` means something different for each kind. */
export interface FeedItem {
  /** the row's own id, which is also its order: bigger is newer */
  id: number;
  kind: FeedKind;
  /** whose event it is, by name */
  who: string;
  /** and by id, so the screen can tell the player's own events from the rest */
  whoId: string;
  /**
   * `duel`: the invitation code. `league`: the league index, as a string.
   * `award`: the award id. `joined` and `left`: empty.
   */
  detail: string;
  at: number;
  /** a duel invitation's own deadline; null on everything else */
  expiresAt: number | null;
  /** who took the duel, by name, or null while the seat is still free */
  takenBy: string | null;
}

/** One member, and what they have put in this season. */
export interface CorpMember {
  id: string;
  name: string;
  /** coins earned in matches THIS SEASON while in THIS corporation */
  coins: number;
  /** dollars earned the same way — see `averageOf` for what earned means */
  dollars: number;
  joinedAt: number;
  owner: boolean;
  /** the caller themselves */
  you: boolean;
}

/** A corporation as the list and the table draw one. */
export interface CorpSummary {
  id: string;
  name: string;
  tag: string;
  motto: string;
  /** an id from `src/corp/emblems.ts`; never a file path off the wire */
  emblem: string;
  /** one of the ten in `COLORS`, and never anything else — see `cleanColor` */
  color: string;
  members: number;
  policy: Policy;
  /** place in the table this row was read out of, or null when unranked */
  rank: number | null;
  /** the season average this place was worked out from */
  average: number;
  /**
   * Both season averages, whichever table the row came out of.
   *
   * `average` above is context: it belongs to the table being looked at, and
   * on the corporations screen that is whichever tab is open. These two are
   * not context, and they are here so that tapping a row can open a card
   * about that corporation without asking the server a second time — the
   * bargain the friends list already makes with a room and an outfit, and for
   * the same reason: nobody should watch a spinner to read six numbers that
   * were a query away when the list was built.
   *
   * Averages rather than a treasury, because a corporation has no treasury
   * and is not going to grow one (`README`, «Корпорации»). What it has is two
   * places in two tables and the numbers they were worked out from.
   */
  coinAverage: number;
  dollarAverage: number;
}

/** Somebody waiting at the door of a closed corporation. */
export interface CorpRequest {
  id: string;
  name: string;
  at: number;
}

/** The whole of the corporation the caller is in. */
export interface Corp {
  id: string;
  name: string;
  tag: string;
  motto: string;
  emblem: string;
  color: string;
  policy: Policy;
  ownerId: string;
  /** the standing invitation code, which any member may hand out */
  code: string;
  members: CorpMember[];
  feed: FeedItem[];
  /** only ever non-empty for the owner of a closed corporation */
  requests: CorpRequest[];
  /** place in each table, or null when the corporation is not in one */
  coinRank: number | null;
  dollarRank: number | null;
  /** what the two places were worked out from: the season's averages */
  coinAverage: number;
  dollarAverage: number;
  /** when the owner may rename it again; 0 when they may now */
  renameAt: number;
  /** the season these numbers are about, as `seasonOf` spells one */
  season: string;
}

/** Everything that can go wrong, in the one word the screen looks up. */
export type CorpError =
  /** no corporation by that id or code */
  | 'nosuch'
  /** thirty already */
  | 'full'
  /** the caller is already in one */
  | 'already'
  /** ...and is in none */
  | 'notmember'
  /** the caller is not the owner, and this is the owner's to do */
  | 'notowner'
  /** the name or tag is not something this game will show a stranger */
  | 'badname'
  /** somebody has that name */
  | 'taken'
  /** renamed too recently */
  | 'renamed'
  /** left a corporation too recently */
  | 'cooldown'
  /** closed, so the answer is a request rather than a seat */
  | 'closed'
  /** the request is already in */
  | 'pending'
  /** somebody else took that duel first */
  | 'gone'
  /** the row moved under a write four times over — see `worker/src/profile.ts` */
  | 'busy'
  /** no server, or nothing to sign with */
  | 'noserver';

/* ------------------------------------------------ what a stranger may read */

/**
 * The alphabet a corporation may be named in: capitals, digits and the space.
 *
 * NO UNICODE AT ALL, and that is the whole point rather than an oversight. A
 * name and a motto are shown to people who did not choose to see them and there
 * is nobody here to moderate what they say — so the defence is the alphabet
 * itself. Ruling out everything but these thirty-seven characters rules out
 * every homoglyph (РАУРАL is not PAYPAL once `Р` cannot be typed), every
 * invisible character, every right-to-left override, and every emoji that would
 * turn a member list into somebody's flag.
 *
 * It costs the game nothing, because this is already its typography: companies
 * are tickers, leagues are shouted, and every button in the interface is
 * capitals. A corporation called ГАЗПРОМ would be the odd one out on its own
 * screen.
 */
/**
 * Exported because a player's nickname holds the same line (`profile/protocol`).
 * A name typed by somebody and shown to strangers is the same problem whether
 * it is over a corporation or over a person, and two copies of the alphabet
 * would be two places to widen it and one place to forget.
 */
export const ALLOWED = /^[A-Z0-9А-ЯЁ'&._ -]+$/;

/**
 * ...and a name may not be made ENTIRELY of the punctuation above. `---` and
 * `. . .` pass the alphabet and are not names; one letter or digit anywhere is
 * the whole of the rule.
 */
const HAS_SUBSTANCE = /[A-Z0-9А-ЯЁ]/;

/**
 * The same alphabet, applied to what somebody is typing rather than to what
 * they have typed.
 *
 * Both forms in this game use it — the corporation's founding form and the
 * nickname box — and they use THIS one rather than each keeping a copy, which
 * is how the box and the check stay the same rule. A character a name cannot
 * have simply does not appear, and nothing has to be explained afterwards.
 */
export const keepAllowed = (raw: string, max: number): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ'&._ -]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);

/**
 * Words a corporation may not be called.
 *
 * Deliberately short, deliberately here rather than in a database, and
 * deliberately not a filter anybody should be proud of. It stops the laziest
 * five per cent and nothing else; the alphabet above does the real work by
 * making anything clever unspellable. A REPORT button is what will do the rest
 * — it is not in this version, and the schema has a place for it.
 */
export const BANNED: string[] = [
  'FUCK',
  'SHIT',
  'CUNT',
  'NIGGER',
  'NAZI',
  'HITLER',
  'RAPE',
  'PEDO',
  'ADMIN',
  'MODERATOR',
  'BROKERSTARS',
  // The same three again, in the alphabet that was opened up beside them. The
  // list is not a profanity filter and was never going to be one; what it is
  // for is somebody trying to look like this game speaking, and that works in
  // either script.
  'АДМИН',
  'МОДЕРАТОР',
  'БРОКЕРСТАРС',
];

/** Tidy first: one run of spaces, none at either end, capitals throughout. */
export const squash = (raw: unknown): string =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Is there a banned word in here?
 *
 * Checked against the text AND against the text with its spaces taken out, so
 * `F U C K` is the same word as `FUCK`. That is the one evasion cheap enough to
 * be worth closing; the rest are not worth pretending about.
 */
export function banned(text: string): boolean {
  const flat = text.replace(/ /g, '');
  return BANNED.some((word) => text.includes(word) || flat.includes(word));
}

/**
 * A name as it can be stored, or null.
 *
 * Null rather than a tidied-up version of something unusable: somebody who
 * typed a name in Cyrillic should be told so by the button staying dark, not
 * find that the game has quietly called them `12`.
 */
export function cleanName(raw: unknown): string | null {
  const s = squash(raw);
  if (s.length < NAME_MIN || s.length > NAME_MAX) return null;
  if (!ALLOWED.test(s) || !HAS_SUBSTANCE.test(s)) return null;
  if (banned(s)) return null;
  return s;
}

/** The same rules, shorter, and no spaces: a tag is one word by definition. */
export function cleanTag(raw: unknown): string | null {
  const s = squash(raw).replace(/ /g, '');
  if (s.length < TAG_MIN || s.length > TAG_MAX) return null;
  if (!ALLOWED.test(s) || !HAS_SUBSTANCE.test(s)) return null;
  if (banned(s)) return null;
  return s;
}

/**
 * A motto, or the empty string.
 *
 * The odd one out: a motto is optional, so something unusable is dropped rather
 * than refused. Nobody should be unable to found a corporation because of the
 * exclamation mark at the end of a sentence they could have left out.
 */
export function cleanMotto(raw: unknown): string {
  const s = squash(raw).slice(0, MOTTO_MAX);
  if (!s) return '';
  if (!ALLOWED.test(s) || banned(s)) return '';
  return s;
}

/**
 * The name reduced to what uniqueness is decided on: capitals, no spaces.
 *
 * So `BULL RUN`, `BULLRUN` and `bull run` are one name and the second of them
 * cannot be founded. Without this the table fills with corporations whose names
 * differ by a space, which is not a naming scheme — it is a way of taking
 * somebody else's name while being able to say you did not.
 */
export const keyOf = (name: string): string => name.replace(/ /g, '');

/* ---------------------------------------------------------- the season */

/**
 * Which season it is: the calendar month, UTC, as `YYYY-MM`.
 *
 * A string rather than a number because it is read by a person looking at the
 * database as often as it is compared by a machine, and because the comparison
 * it is used for is equality and never ordering.
 *
 * UTC for the reason the day is UTC (`src/daily/protocol.ts`): a season that
 * ended at local midnight would end twenty-six times.
 */
export function seasonOf(now: number): string {
  const d = new Date(now);
  const month = d.getUTCMonth() + 1;
  return `${d.getUTCFullYear()}-${month < 10 ? '0' : ''}${month}`;
}

/** When the current one ends, for the screen that counts down to it. */
export function nextSeasonAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * What a corporation is ranked on: the AVERAGE over its members, not the sum.
 *
 * This is the most important decision in the feature and it is one line. A sum
 * is a ranking of size: a corporation of fifty beats a corporation of five
 * however the five play, so the table becomes a recruiting contest and the only
 * strategy in it is to admit everybody. An average asks the question the table
 * is supposed to ask — how well do the people in here play — and it makes a
 * seat worth something, because a member who plays nothing costs the
 * corporation a place.
 *
 * What it costs, spelled out because it is real: an average can be defended by
 * throwing people out, and a quiet member is a liability rather than a friend.
 * `MIN_RANKED` and the thirty-seat ceiling bound how much of a game that can
 * be, and nothing is paid for placing in this version, so the pressure is pride
 * rather than money. If it ever pays, this is the number to look at again.
 *
 * Rounded, because a place decided in the third decimal is a place nobody can
 * read off the screen.
 */
export const averageOf = (total: number, members: number): number =>
  members > 0 ? Math.round(total / members) : 0;

/** Big enough to be in the table at all. */
export const ranked = (members: number): boolean => members >= MIN_RANKED;

/** Is there a seat? Asked by the screen to grey a button; decided by the server. */
export const full = (members: number): boolean => members >= MAX_MEMBERS;

/* -------------------------------------------------- nothing is believed */

const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

const num = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const policyOf = (v: unknown): Policy => (v === 'closed' ? 'closed' : 'open');

const rankOf = (v: unknown): number | null => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const KINDS: FeedKind[] = ['duel', 'joined', 'left', 'league', 'award'];

/** One summary off the wire, or null when what came back was not one. */
export function cleanSummary(raw: unknown): CorpSummary | null {
  const r = raw as Record<string, unknown> | null;
  const id = str(r?.id, 32);
  const name = str(r?.name, NAME_MAX);
  if (!id || !name) return null;
  return {
    id,
    name,
    tag: str(r?.tag, TAG_MAX),
    motto: str(r?.motto, MOTTO_MAX),
    // Through the catalogue, both of them: an emblem this build has never
    // heard of and a colour that is not one of the ten both come back as the
    // default. The colour matters most — it is written into a style attribute
    // on a mark drawn for everybody else in the corporation.
    emblem: cleanEmblem(r?.emblem),
    color: cleanColor(r?.color),
    members: Math.min(MAX_MEMBERS, num(r?.members)),
    policy: policyOf(r?.policy),
    rank: rankOf(r?.rank),
    average: num(r?.average),
    coinAverage: num(r?.coinAverage),
    dollarAverage: num(r?.dollarAverage),
  };
}

export function cleanSummaries(raw: unknown): CorpSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: CorpSummary[] = [];
  for (const item of raw.slice(0, 200)) {
    const one = cleanSummary(item);
    if (one) out.push(one);
  }
  return out;
}

function cleanFeed(raw: unknown, now: number): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const item of raw.slice(0, FEED_KEEP)) {
    const r = item as Record<string, unknown>;
    const kind = String(r?.kind ?? '') as FeedKind;
    if (!KINDS.includes(kind)) continue;
    const expiresAt = num(r?.expiresAt) || null;
    // An invitation that died while the answer was in flight is not a card
    // worth drawing — the same check `cleanCall` makes for the same reason.
    if (kind === 'duel' && (!expiresAt || expiresAt <= now)) continue;
    out.push({
      id: num(r?.id),
      kind,
      who: str(r?.who, 24) || 'PLAYER',
      whoId: str(r?.whoId, 32),
      detail: str(r?.detail, 32),
      at: num(r?.at),
      expiresAt,
      takenBy: r?.takenBy ? str(r.takenBy, 24) : null,
    });
  }
  return out;
}

function cleanMembers(raw: unknown): CorpMember[] {
  if (!Array.isArray(raw)) return [];
  const out: CorpMember[] = [];
  for (const item of raw.slice(0, MAX_MEMBERS)) {
    const r = item as Record<string, unknown>;
    const id = str(r?.id, 32);
    if (!id) continue;
    out.push({
      id,
      name: str(r?.name, 24) || 'PLAYER',
      coins: num(r?.coins),
      dollars: num(r?.dollars),
      joinedAt: num(r?.joinedAt),
      owner: r?.owner === true,
      you: r?.you === true,
    });
  }
  return out;
}

function cleanRequests(raw: unknown): CorpRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: CorpRequest[] = [];
  for (const item of raw.slice(0, MAX_MEMBERS)) {
    const r = item as Record<string, unknown>;
    const id = str(r?.id, 32);
    if (!id) continue;
    out.push({ id, name: str(r?.name, 24) || 'PLAYER', at: num(r?.at) });
  }
  return out;
}

/** The whole corporation off the wire, or null when the caller is in none. */
export function cleanCorp(raw: unknown, now: number = Date.now()): Corp | null {
  const r = raw as Record<string, unknown> | null;
  const id = str(r?.id, 32);
  const name = str(r?.name, NAME_MAX);
  if (!id || !name) return null;
  return {
    id,
    name,
    tag: str(r?.tag, TAG_MAX),
    motto: str(r?.motto, MOTTO_MAX),
    emblem: cleanEmblem(r?.emblem),
    color: cleanColor(r?.color),
    policy: policyOf(r?.policy),
    ownerId: str(r?.ownerId, 32),
    code: str(r?.code, 32),
    members: cleanMembers(r?.members),
    feed: cleanFeed(r?.feed, now),
    requests: cleanRequests(r?.requests),
    coinRank: rankOf(r?.coinRank),
    dollarRank: rankOf(r?.dollarRank),
    coinAverage: num(r?.coinAverage),
    dollarAverage: num(r?.dollarAverage),
    renameAt: num(r?.renameAt),
    season: str(r?.season, 7) || seasonOf(now),
  };
}

/** Just the feed, which is what the poll while the screen is open asks for. */
export const cleanFeedOnly = (raw: unknown, now: number = Date.now()): FeedItem[] =>
  cleanFeed((raw as Record<string, unknown> | null)?.feed, now);
