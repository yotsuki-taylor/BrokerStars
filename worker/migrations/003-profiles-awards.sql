-- Awards, the archive, and the two counters they need.
--
-- Only for a database whose `profiles` was created before any of this existed.
-- On a newer one `schema.sql` has already made all four columns and this file
-- fails on the first ALTER with "duplicate column name", which breaks nothing.
--
-- Run it BEFORE `npm run schema`, like the others: see
-- `migrations/001-results-token.sql` for why that order and not the reverse.
--
-- Nothing is backfilled. The shelf is judged from `players` and `profiles` on
-- the next match anybody plays, so awards that were already true — the money
-- ones, the leagues — land by themselves the first time the judge is asked.
-- The archive is the exception, and rides in on the browser's claim.

ALTER TABLE profiles ADD COLUMN awards TEXT NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN seen TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN duel_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
