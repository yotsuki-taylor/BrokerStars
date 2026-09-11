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
  owned      TEXT NOT NULL DEFAULT '{}',
  outfit     TEXT NOT NULL DEFAULT '{}',
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
  updated_at INTEGER NOT NULL
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
CREATE TABLE IF NOT EXISTS chat_shouts (
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
