-- The hard currency and the day it is paid out by.
--
-- Only for a database whose `profiles` was created before either existed. On a
-- newer one `schema.sql` has already made both columns and this file fails on
-- the first ALTER with "duplicate column name", which breaks nothing.
--
-- Run it BEFORE `npm run schema`, like the others: see
-- `migrations/001-results-token.sql` for why that order and not the reverse.
--
--   npm run migrate -- ./migrations/004-profiles-daily.sql
--   npm run migrate:local -- ./migrations/004-profiles-daily.sql
--
-- Nothing is backfilled and nothing needs to be. Every existing player starts
-- with no dollars, which is what everybody has today, and with an empty day —
-- which names no day at all, so the first read rolls it over to today and the
-- bonus is there waiting. The default '{}' is deliberately not a valid day
-- rather than a made-up one: `cleanDaily` reads it as day NO_DAY and rolls it,
-- so nobody's first bonus is quietly marked as already taken.

ALTER TABLE profiles ADD COLUMN dollars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN daily TEXT NOT NULL DEFAULT '{}';
