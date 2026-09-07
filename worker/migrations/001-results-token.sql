-- Idempotent result submission: one token per finished match.
--
-- `schema.sql` is written to be re-runnable over a live database, which is why
-- everything in it is CREATE ... IF NOT EXISTS. `ALTER TABLE` has no such form,
-- so a column added to a table that already exists somewhere lives here instead
-- and is run once, by hand:
--
--   npm run migrate           -- against the deployed database
--   npm run migrate:local     -- against the wrangler dev one
--
-- A database created from scratch after this already has the column: it is in
-- `schema.sql` too, on the CREATE TABLE. Running this file against such a
-- database fails on the ALTER with "duplicate column name", which is the right
-- answer and costs nothing -- the index below is IF NOT EXISTS and the schema
-- has already made it.
--
-- Rows written before today keep a NULL token. SQLite's UNIQUE index allows any
-- number of NULLs, so nothing has to be filled in and no history is lost; those
-- matches simply predate the guarantee.

ALTER TABLE results ADD COLUMN token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS results_by_token ON results (token);
