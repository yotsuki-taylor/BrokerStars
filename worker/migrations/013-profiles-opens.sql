-- How often the game gets opened, and when it last was.
--
-- Only for a database whose `profiles` was created before anybody wanted to
-- know. On a newer one `schema.sql` has already made the columns and this file
-- fails with "duplicate column name", which breaks nothing.
--
-- Run it BEFORE `npm run schema`, like the others: see
-- `migrations/001-results-token.sql` for why that order and not the reverse.
--
--   npm run migrate -- ./migrations/013-profiles-opens.sql
--   npm run migrate:local -- ./migrations/013-profiles-opens.sql
--
-- NOTHING IS BACKFILLED, AND HERE THAT COSTS SOMETHING. Everybody already
-- playing starts at zero opens with no last open, which is indistinguishable
-- from a player who has never once opened the game -- so any query over this
-- has to start after the day it was deployed, or it will report a week of
-- dead accounts that were in fact perfectly alive. `first_seen` is the column
-- to lean on for anything about the past; these two only know about the
-- future.
--
-- 0 rather than NULL for `last_open` is the same trick `chat_shouts.last_at`
-- plays: zero is a moment in 1970, so "never opened" and "opened a very long
-- time ago" answer the same way and neither is a special case.

ALTER TABLE profiles ADD COLUMN opens     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN last_open INTEGER NOT NULL DEFAULT 0;
