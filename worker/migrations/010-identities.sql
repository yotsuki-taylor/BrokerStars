-- One person, two ways in.
--
-- A player who has been playing in Telegram and installs the Android app signs
-- in with Google and finds an empty office: the two accounts are two rows,
-- keyed on two different ids, and nothing in this database says they are the
-- same person. These two tables are what says it.
--
-- AN ALIAS RATHER THAN A MERGE, and that is the whole design. Moving a
-- player's rows from one id to another means deciding what happens when both
-- sides have a wardrobe and a wallet, and a merge that fails halfway cannot be
-- undone. Here nothing moves: `identities` says that `g:<sub>` IS the Telegram
-- player, `identify` swaps the id the moment the signature is checked, and
-- every table below that point goes on knowing exactly one id per person.
-- Unlinking is deleting one row.
--
-- The direction is deliberate and one-way: a Google id can be an alias FOR a
-- Telegram player, never the reverse. So the lookup runs only for callers whose
-- id starts `g:`, and a Telegram player pays nothing for a feature they may
-- never use.
--
-- `link_codes` is how somebody proves both accounts are theirs: the account
-- keeping its data mints a code, the account joining it types the code in, and
-- the server has seen two signatures rather than one claim. One live code per
-- player, replaced rather than queued, and short-lived -- it is a password for
-- somebody else's save file for as long as it exists.
--
--   npm run migrate -- ./migrations/010-identities.sql
--   npm run migrate:local -- ./migrations/010-identities.sql

CREATE TABLE IF NOT EXISTS identities (
  -- the joining id, always `g:<sub>` today
  alias_id  TEXT PRIMARY KEY,
  -- the account it is the same person as, and one alias each: a player with two
  -- Google accounts pointing at their save would have two ways to lose it
  player_id TEXT NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS link_codes (
  code       TEXT PRIMARY KEY,
  -- one live code per player; asking again replaces the last one
  player_id  TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
