-- Broker Stars leaderboard.
--
-- Two tables on purpose. `players` is what the board reads and is a running
-- total the server itself keeps; `results` is one row per match handed in, kept
-- so that the replay check can be added later without a migration and without
-- losing the matches played in the meantime. Everything a replay would need to
-- re-run a match -- the seed, the league, what the client claimed -- is already
-- in the row; `verified` is 0 for every one of them until something checks.

CREATE TABLE IF NOT EXISTS players (
  -- Telegram user id, and only ever one Telegram has signed for
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- stars EARNED, which is what a table of players should rank on: spending
  -- them in the shop is a choice, and a choice should not cost you your place
  stars         INTEGER NOT NULL DEFAULT 0,
  matches       INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  best_net_worth INTEGER NOT NULL DEFAULT 0,
  -- highest league this player has finished a match in
  top_league    INTEGER NOT NULL DEFAULT 0,
  first_seen    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- the board is this query and nothing else
CREATE INDEX IF NOT EXISTS players_by_stars ON players (stars DESC, updated_at ASC);

CREATE TABLE IF NOT EXISTS results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES players (id),
  -- Minted by the client, once per finished match, and the whole of what makes
  -- handing one in idempotent: a submission that never got its answer can be
  -- sent again without paying twice for the same match. NULL on every row
  -- written before the column existed, which a UNIQUE index in SQLite allows
  -- as many of as it likes.
  token       TEXT,
  -- enough to replay the match: same seed, same league, same board
  seed        TEXT NOT NULL,
  league      INTEGER NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('win', 'draw', 'loss')),
  net_worth   INTEGER NOT NULL,
  traded_well INTEGER NOT NULL,
  -- what the SERVER decided to pay, not what the client asked for
  stars       INTEGER NOT NULL,
  -- 0: taken on trust. 1: re-run and agreed with. 2: re-run and disagreed.
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS results_by_token ON results (token);
CREATE INDEX IF NOT EXISTS results_by_player ON results (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS results_unverified ON results (verified, created_at);

-- What a player owns: the room behind the menu, the clothes on the trader, and
-- the ledger the star balance is read off.
--
-- Three numbers rather than one balance, because the board and the shop want
-- different things out of the same stars. `players.stars` above is what was
-- EARNED and never goes down — that is what the table ranks on. Here is what
-- was spent, and what was granted outside a match: the migration of a save made
-- before this table existed, and the developer's free purchases. In hand is
-- earned + granted - spent, and it is worked out on read, so no two columns can
-- drift apart.
--
-- `owned` and `outfit` are JSON of one rarity per slot -- {"torso":"rare"}. A
-- slot is climbed in order, so its top rung describes the whole of it; see
-- src/profile/protocol.ts, which both sides read this shape out of.
--
-- `updated_at` doubles as the row's version. Every write names the value it
-- read and is refused if the row has moved since, so two requests from the same
-- player cannot each write a whole row over the other's -- see `write` in
-- worker/src/profile.ts. It only ever goes up, even twice in one millisecond.
CREATE TABLE IF NOT EXISTS profiles (
  -- the same Telegram user id as players.id, and no foreign key on purpose:
  -- a player can open the game and dress up before ever finishing a match
  id         TEXT PRIMARY KEY,
  room       INTEGER NOT NULL DEFAULT 0,
  -- JSON array of garment ids: what has been bought, in no order. Rows written
  -- before the shop stopped being a ladder hold one rarity per slot instead,
  -- and are read either way (src/profile/protocol.ts).
  owned      TEXT NOT NULL DEFAULT '[]',
  outfit     TEXT NOT NULL DEFAULT '{}',
  -- The day's shelf: JSON of the day it was drawn for and the garment ids on
  -- it. Stored rather than worked out on demand, because buying changes what
  -- is owned and a shelf redrawn from that would restock itself mid-purchase
  -- (src/shop/protocol.ts). '{}' has no day, so the first read rolls one.
  offer      TEXT NOT NULL DEFAULT '{}',
  -- JSON array of wins per league, lowest first: the ladder. Counted here as
  -- matches are handed in, never read off what the client claims to have won.
  wins       TEXT NOT NULL DEFAULT '[]',
  -- The shelf: JSON of award id to when it was earned. Which awards exist is
  -- src/awards/catalogue.ts, shared with the game; who has earned them is
  -- worked out on this side and only ever added to (worker/src/awards.ts).
  awards     TEXT NOT NULL DEFAULT '{}',
  -- Companies met. Used to live in the browser, and is the one thing on this
  -- row the server could not have reconstructed for itself.
  seen       TEXT NOT NULL DEFAULT '[]',
  -- Counters two awards turn on, kept here rather than scanned out of
  -- `results` every time somebody opens the shelf.
  duel_wins  INTEGER NOT NULL DEFAULT 0,
  streak     INTEGER NOT NULL DEFAULT 0,
  spent      INTEGER NOT NULL DEFAULT 0,
  granted    INTEGER NOT NULL DEFAULT 0,
  -- The hard currency, paid by the daily bonus and spent at the share counter.
  -- One column and not three, unlike the stars above: nothing ranks on it, so
  -- there is no total that has to survive being spent.
  dollars    INTEGER NOT NULL DEFAULT 0,
  -- The share book: JSON of company id to {shares, cost}, where `cost` is what
  -- was paid for the shares still held. What one share is worth on a given day
  -- is NOT here and never will be -- it is worked out from the company and the
  -- day (src/market/protocol.ts), so there is no price table to keep, no job to
  -- run at midnight, and no way for the client and the server to be looking at
  -- different prices.
  portfolio  TEXT NOT NULL DEFAULT '{}',
  -- The day: JSON of {day, bonus, progress, taken}, where `day` is whole UTC
  -- days since the epoch and everything beside it is about that day and no
  -- other. Rolling over is not a job that runs -- the day simply stops
  -- matching and the rest is discarded on the next read (src/daily/protocol.ts).
  daily      TEXT NOT NULL DEFAULT '{}',
  first_seen INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- How many times the game has been opened, and when it last was.
  --
  -- Neither is progress and neither is ever sent to the client: nothing here
  -- is something a player should be told, be able to claim, or carry to
  -- another device, which is the same rule `chat_shouts` is kept under. They
  -- are written by one statement in `countOpen` and read by nobody but
  -- whoever is asking how the game is doing.
  --
  -- WHY THEY ARE HERE AND NOT IN A TABLE OF THEIR OWN. `first_seen` is already
  -- an analytics column on this row and these two are the questions it cannot
  -- answer on its own -- when somebody was last about, and whether they ever
  -- came back. One row per player either way, and beside `first_seen` they can
  -- be asked for in one scan.
  --
  -- WHAT THEY CANNOT ANSWER: which particular days somebody was about. That
  -- needs a row per player per day, and these two are deliberately not it.
  opens      INTEGER NOT NULL DEFAULT 0,
  last_open  INTEGER NOT NULL DEFAULT 0
);

-- Friends: a code that stands for one player, and a list of pairs.
--
-- `friend_codes` is one row per player and the code never changes. It is not
-- an invitation the way a duel code is -- it does not expire and is not used
-- up, so the same link can go to a whole group chat. `src/friends/protocol.ts`
-- says what that buys and what it costs.
--
-- `name` on both tables is the one bit of denormalisation in this database and
-- it earns its keep: `players` above only gets a row when somebody FINISHES a
-- match, so a friend who has been invited but has not played yet would have no
-- name to show. The live name wins whenever there is one; this is the fallback.
CREATE TABLE IF NOT EXISTS friend_codes (
  code       TEXT PRIMARY KEY,
  -- one code per player, and the UNIQUE is what makes that true
  player_id  TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per DIRECTION of a friendship, so reading a list is one indexed
-- query with no OR in it and no pair to put in a canonical order. Both rows
-- are written in one batch (worker/src/friends.ts): a friendship only one of
-- the two can see would be worse than none.
CREATE TABLE IF NOT EXISTS friends (
  player_id  TEXT NOT NULL,
  friend_id  TEXT NOT NULL,
  -- their name when the two met; see the note above
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_id)
);

CREATE INDEX IF NOT EXISTS friends_by_player ON friends (player_id, created_at DESC);

-- When the bot last called a duel out in the group chat on this player's
-- behalf. One row per player, written only after Telegram says the message
-- landed, and read only to work out whether they may ask again yet
-- (worker/src/chat.ts). Deliberately not a column on a profile: what somebody
-- has done to a room full of other people is not part of what they own.
-- Who invited whom, and whether it has been paid for. See
-- `worker/migrations/011-invites.sql` for why this is not a column on a
-- friendship.
CREATE TABLE IF NOT EXISTS invites (
  friend_id  TEXT PRIMARY KEY,
  host_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at    INTEGER
);

CREATE INDEX IF NOT EXISTS invites_by_host ON invites (host_id, paid_at);

CREATE TABLE IF NOT EXISTS chat_shouts (
  player_id TEXT PRIMARY KEY,
  last_at   INTEGER NOT NULL
);

-- The feedback cooldown, and the same shape for the same reason. One row per
-- player, one timestamp, and NOT ONE WORD anybody wrote: a report is carried
-- straight to the developer and forgotten, so there is no table of complaints
-- here to leak or to forget to delete (worker/src/feedback.ts).
CREATE TABLE IF NOT EXISTS feedback_sent (
  player_id TEXT PRIMARY KEY,
  last_at   INTEGER NOT NULL
);

-- Being called out to a duel by name, for a friend the bot cannot reach.
--
-- One row per player and the PRIMARY KEY is what makes that true: a second call
-- replaces the first, because nobody needs a queue of invitations that expire
-- in a quarter of an hour. See `worker/src/calls.ts` and migration 009; the
-- long version of why this exists is in the migration.
CREATE TABLE IF NOT EXISTS duel_calls (
  to_id      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  from_name  TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- One person, two ways in: `g:<sub>` IS this Telegram player. An alias rather
-- than a merge, so nothing moves and unlinking is deleting one row; the long
-- version of why is in migration 010, and the code is `worker/src/link.ts`.
CREATE TABLE IF NOT EXISTS identities (
  alias_id  TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL
);

-- How somebody proves both accounts are theirs: one side mints, the other
-- types it in, and the server has seen two signatures instead of one claim.
CREATE TABLE IF NOT EXISTS link_codes (
  code       TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);

-- Corporations: a list of players with a name on it.
--
-- Five tables, and the shape of them is the whole design. What each one is for
-- is under its own CREATE; what the feature is for is `src/corp/protocol.ts`
-- and the README section that argues with itself about averages and chat.

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
  -- What it wears. Both are ids into `src/corp/emblems.ts` and never content:
  -- `emblem` names one of the sixteen marks drawn for this or one of the
  -- twenty-eight the companies wear, `color` is one of ten literals. The
  -- server validates both against that catalogue before writing, so a file
  -- path, a URL or an arbitrary hex cannot reach a browser from here — the
  -- colour ends up in a style attribute on a mark thirty people are shown.
  emblem     TEXT NOT NULL DEFAULT 'arrow',
  color      TEXT NOT NULL DEFAULT '#FFC02E',
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
