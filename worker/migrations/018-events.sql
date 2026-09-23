-- The game's own analytics: one row per thing that happened.
--
-- A new table and nothing else, so it is all `IF NOT EXISTS` and repeats
-- without consequence, like 006 and 008. A database `schema.sql` has already
-- been run over does not need it at all; the same DDL is there, with the long
-- version of why each column is what it is.
--
--   npm run migrate -- ./migrations/018-events.sql
--   npm run migrate:local -- ./migrations/018-events.sql
--
-- WHY OUR OWN TABLE AND NOT SOMEBODY'S SDK. The privacy policy names everyone
-- this game's data goes to -- Cloudflare, Telegram, Google for sign-in only,
-- GitHub -- and says there is no third-party analytics. Rows here stay in the
-- one database that promise already covers. The catalogue of what may be
-- written is `src/analytics/protocol.ts`, and the Worker refuses the rest.
--
-- Nothing to backfill: what people did before this existed was never recorded.

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  eid       TEXT NOT NULL,
  player_id TEXT NOT NULL,
  host      TEXT NOT NULL CHECK (host IN ('telegram', 'android', 'web')),
  build     TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL,
  props     TEXT NOT NULL DEFAULT '{}',
  day       INTEGER NOT NULL,
  ts        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS events_by_name ON events (name, day);
CREATE INDEX IF NOT EXISTS events_by_player ON events (player_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS events_by_eid ON events (eid);
