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
  -- The hard currency, paid by the daily bonus and spent by nothing yet. One
  -- column and not three, unlike the stars above: nothing ranks on it, so
  -- there is no total that has to survive being spent.
  dollars    INTEGER NOT NULL DEFAULT 0,
  -- The day: JSON of {day, bonus, progress, taken}, where `day` is whole UTC
  -- days since the epoch and everything beside it is about that day and no
  -- other. Rolling over is not a job that runs -- the day simply stops
  -- matching and the rest is discarded on the next read (src/daily/protocol.ts).
  daily      TEXT NOT NULL DEFAULT '{}',
  first_seen INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
