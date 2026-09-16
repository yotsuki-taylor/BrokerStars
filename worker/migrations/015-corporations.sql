-- Corporations: a list of players with a name on it.
--
-- Five tables, and the shape of them is the whole design. What each one is for
-- is under its own CREATE; what the feature is for is `src/corp/protocol.ts`
-- and the README section that argues with itself about averages and chat.
--
--   npm run migrate -- ./migrations/015-corporations.sql
--   npm run migrate:local -- ./migrations/015-corporations.sql
--
-- Every statement is IF NOT EXISTS, so running it twice costs nothing, and all
-- of it is in `schema.sql` as well. Nothing is backfilled: everybody starts in
-- no corporation, which is the truth.

-- The corporation itself.
--
-- `key` is the name with its spaces taken out, and the UNIQUE on it is the
-- whole of name uniqueness: BULL RUN, BULLRUN and bull run are one name, and
-- the second person to want it is told so. Without that the table fills with
-- names that differ by a space, which is not a naming scheme but a way of
-- taking somebody's name while being able to say you did not.
--
-- `members` is a COUNTED COLUMN and not a view of `corp_members`, and it is the
-- only denormalisation here. It earns its keep by being the thing the thirty
-- seat ceiling is enforced on: `UPDATE ... SET members = members + 1 WHERE
-- members < 30` is one statement that either takes the last seat or does not,
-- and two people racing for it cannot both win. A COUNT(*) read and then acted
-- on is exactly the race that loses. It is checked against the truth whenever
-- the corporation is read in full (`worker/src/corps.ts`).
--
-- `updated_at` doubles as the row's version, for the reason `profiles` does:
-- every write that decides something names the value it read and is refused if
-- the row has moved since. It only ever goes up, even twice in one millisecond.
--
-- `code` is a STANDING invitation, like a friend code and unlike a duel's: it
-- does not expire and is not used up, so it can go in a group chat. What that
-- buys and what it costs is the same trade `src/friends/protocol.ts` spells
-- out.
CREATE TABLE IF NOT EXISTS corps (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- the name with spaces removed: what uniqueness is decided on
  key        TEXT NOT NULL UNIQUE,
  tag        TEXT NOT NULL,
  motto      TEXT NOT NULL DEFAULT '',
  -- 'open': tap and you are in. 'closed': tap and the owner is asked.
  policy     TEXT NOT NULL DEFAULT 'open' CHECK (policy IN ('open', 'closed')),
  -- exactly one, always: a corporation without an owner must not exist for a
  -- second, so leaving hands it to the oldest member rather than clearing it
  owner_id   TEXT NOT NULL,
  code       TEXT NOT NULL,
  members    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  -- when the name was last changed, against which the week's cooldown is read
  renamed_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS corps_by_members ON corps (members DESC);

-- Who is in which, and what they have put in this season.
--
-- `player_id` is the PRIMARY KEY, and that IS the rule "one player, one
-- corporation" — not a check somebody has to remember to make, but a shape in
-- which the bad state cannot be written down.
--
-- THE CONTRIBUTION IS A DELTA, NOT A TOTAL, and it belongs to the PAIR. A
-- season's coins are the coins earned while in THIS corporation, so leaving
-- deletes them with the row and joining another starts at nothing. Ranking on
-- anybody's lifetime total would make an old corporation unmovable and a new
-- one pointless.
--
-- `season` is what makes the rollover free. It names the month the two numbers
-- under it are about; when it stops matching, `credit` overwrites rather than
-- adds and the table reads the row as zero. Nothing runs on the first of the
-- month — the same trick `profiles.daily` plays with the day, and for the same
-- reason: a scheduled job is a thing that breaks on the one night anybody is
-- watching.
CREATE TABLE IF NOT EXISTS corp_members (
  player_id TEXT PRIMARY KEY,
  corp_id   TEXT NOT NULL,
  -- their name when they joined, refreshed as they play. Denormalised for the
  -- reason `friends.name` is: `players` only gets a row when somebody FINISHES
  -- a match, and a member who has not yet would otherwise have no name to show.
  name      TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  -- the season the two numbers below are about, as 'YYYY-MM' UTC
  season    TEXT NOT NULL DEFAULT '',
  coins     INTEGER NOT NULL DEFAULT 0,
  dollars   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS corp_members_by_corp ON corp_members (corp_id, joined_at);

-- The feed, which is a chat with the typing taken out.
--
-- NOBODY CAN WRITE A WORD INTO THIS TABLE. Every row is the game reporting
-- something that happened: an invitation to a duel, somebody arriving, somebody
-- leaving, a league taken, an award earned. There is no text column anybody
-- fills in, which is why there is no moderation duty attached to this feature
-- and no report queue behind it. The argument is in `src/corp/protocol.ts`.
--
-- `detail` is the one free-shaped field and it is never prose: a duel code, a
-- league index, an award id. What it means depends on `kind`.
--
-- `expires_at` is set on duel rows and nothing else. A duel invitation lives
-- fifteen minutes (`DUEL_TTL_MS`), and a card for one that has died is swept
-- on the next write rather than by anything scheduled.
--
-- `taken_by` is what makes a duel first-come: the seat is claimed by a compare
-- and set on this column being null, so exactly one person can take it and
-- everybody else's card goes dark saying who did.
CREATE TABLE IF NOT EXISTS corp_feed (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  corp_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('duel', 'joined', 'left', 'league', 'award')),
  actor_id   TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  expires_at INTEGER,
  taken_by   TEXT,
  taken_name TEXT,
  created_at INTEGER NOT NULL
);

-- The feed is read newest first and trimmed by the same order, so one index
-- serves both.
CREATE INDEX IF NOT EXISTS corp_feed_by_corp ON corp_feed (corp_id, id DESC);

-- Knocking at a closed door.
--
-- One row per player per corporation, and the composite primary key is what
-- makes asking twice a no-op. A request is not a promise of anything: the owner
-- may leave it there for ever, and it goes when they answer it, when the player
-- joins somewhere else, or when the corporation does.
CREATE TABLE IF NOT EXISTS corp_requests (
  corp_id    TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (corp_id, player_id)
);

CREATE INDEX IF NOT EXISTS corp_requests_by_corp ON corp_requests (corp_id, created_at);

-- When somebody last walked out of one.
--
-- A table of its own rather than a column on the membership, because the fact
-- it records is about a player who has NO membership: the cooldown exists
-- precisely for the window between leaving one corporation and joining the
-- next. On a membership row it would be deleted by the event it is meant to
-- time. The same reasoning `chat_shouts` and `feedback_sent` are kept under —
-- one id, one timestamp, and nothing anybody owns.
CREATE TABLE IF NOT EXISTS corp_moves (
  player_id TEXT PRIMARY KEY,
  left_at   INTEGER NOT NULL
);
