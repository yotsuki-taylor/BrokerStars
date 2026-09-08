-- The friends menu.
--
-- Unlike every other file in here this one adds TABLES rather than columns, so
-- it is `CREATE TABLE IF NOT EXISTS` and running it twice costs nothing. It is
-- also already in `schema.sql`, which means a database that has had the schema
-- run since this landed needs nothing at all -- this file is only here so the
-- order stays the one the others document, and so a deployment can be brought
-- forward with the migrations alone.
--
--   npm run migrate -- ./migrations/006-friends.sql
--   npm run migrate:local -- ./migrations/006-friends.sql
--
-- Nothing is backfilled and nothing can be: who knows whom is not derivable
-- from anything already stored. Every existing player starts with no friends
-- and no code, and the code is minted the first time they open the menu.

CREATE TABLE IF NOT EXISTS friend_codes (
  code       TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  player_id  TEXT NOT NULL,
  friend_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_id)
);

CREATE INDEX IF NOT EXISTS friends_by_player ON friends (player_id, created_at DESC);
