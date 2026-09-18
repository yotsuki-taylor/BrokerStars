-- A name the player chose, instead of the one their host handed over.
--
-- Only for a database whose `players` was created before anybody could be
-- called anything. On a newer one `schema.sql` has already made these and this
-- file fails with "duplicate column name", which breaks nothing.
--
-- Run it BEFORE `npm run schema`, like the others: see
-- `migrations/001-results-token.sql` for why that order and not the reverse.
--
--   npm run migrate -- ./migrations/017-player-names.sql
--   npm run migrate:local -- ./migrations/017-player-names.sql
--
-- WHY A FLAG AND NOT A SECOND NAME COLUMN. `players.name` is already the name:
-- six queries read it and every screen that names a player is one of them. The
-- problem was never where to put a chosen name, it was that handing a match in
-- OVERWRITES the column with whatever the host calls this player
-- (`results.ts`), so a nickname lived exactly until the next whistle. `named`
-- is what stops that write; nothing that READS a name changes at all.
--
-- `name_key` IS THE NAME WITH ITS SPACES TAKEN OUT, and the UNIQUE on it is the
-- whole of "somebody has that name" — the same arrangement `corps.key` makes,
-- and for the same reason: names are stored upper case, so dropping the spaces
-- is all that is left between `MAX POWER` and `MAXPOWER`.
--
-- It is NULL for everybody who has never chosen, and SQLite allows as many
-- NULLs in a UNIQUE index as it likes. That is what keeps the rule where it
-- belongs: two players called PLAYER because Telegram said so is not a
-- collision anybody chose, and refusing the second of them would be enforcing a
-- rule against somebody who never typed anything.
--
-- `renamed_at` is 0 for everybody, which is a moment in 1970 and therefore
-- "may rename now" — the same trick `chat_shouts.last_at` plays.

ALTER TABLE players ADD COLUMN named      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN name_key   TEXT;
ALTER TABLE players ADD COLUMN renamed_at INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS players_by_name_key ON players (name_key);
