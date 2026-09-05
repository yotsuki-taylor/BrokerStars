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

CREATE INDEX IF NOT EXISTS results_by_player ON results (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS results_unverified ON results (verified, created_at);
