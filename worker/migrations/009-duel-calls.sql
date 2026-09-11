-- Being called out to a duel by name, for a friend the bot cannot reach.
--
-- The invitation used to be delivered and nothing else: the bot put it in the
-- friend's Telegram, and a friend's id IS their chat there. A player signed in
-- with Google has no chat and no id the bot understands, so calling them by
-- name did nothing at all -- the link was minted and went nowhere.
--
-- So the server holds the call instead of sending it, and the game collects it
-- the next time it asks anything (worker/src/calls.ts). An invitation lives
-- fifteen minutes either way, which means it only ever mattered while the
-- friend was around; a message they read an hour later was already dead.
--
-- ONE ROW PER PLAYER, and the PRIMARY KEY is what makes that true: a second
-- call replaces the first. Nobody needs a queue of invitations that expire in
-- a quarter of an hour, and the newest one is the only one still worth taking.
--
-- `from_name` is copied rather than joined, like `friends.name` in 006 and for
-- the same reason: the caller may have no row in `players` yet, and a banner
-- that cannot say who is calling is not worth drawing.
--
--   npm run migrate -- ./migrations/009-duel-calls.sql
--   npm run migrate:local -- ./migrations/009-duel-calls.sql
--
-- `CREATE TABLE IF NOT EXISTS`, so running it twice costs nothing, and it is in
-- `schema.sql` as well. Nothing is backfilled: every player starts with nobody
-- calling them, which is the truth.

CREATE TABLE IF NOT EXISTS duel_calls (
  -- who is being called; one live call each
  to_id      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  from_name  TEXT NOT NULL,
  -- the invitation's own deadline, copied so that reading a call never has to
  -- ask the Durable Object holding the duel whether it is still open
  expires_at INTEGER NOT NULL
);
