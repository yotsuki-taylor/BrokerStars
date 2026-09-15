-- When a player last sent feedback, and nothing else.
--
-- The message itself is NOT stored anywhere and this table is the whole of what
-- the channel writes down: one row per player, one timestamp, no word anybody
-- typed (worker/src/feedback.ts). It is the cooldown and only the cooldown.
--
-- A TABLE rather than a column on `profiles`, like 006 and 008 and for the same
-- reason: what somebody has done to a support channel is not part of what they
-- own, and the profile is a thing the client is told about. This one it is not.
--
--   npm run migrate -- ./migrations/014-feedback-sent.sql
--   npm run migrate:local -- ./migrations/014-feedback-sent.sql
--
-- `CREATE TABLE IF NOT EXISTS`, so running it twice costs nothing, and it is in
-- `schema.sql` as well -- a database that has had the schema run since this
-- landed needs nothing at all. Nothing is backfilled and nothing can be: every
-- player starts having never written, which is the truth.

CREATE TABLE IF NOT EXISTS feedback_sent (
  player_id TEXT PRIMARY KEY,
  last_at   INTEGER NOT NULL
);
