-- The duel called out in the group chat.
--
-- One row per player and one column that matters: when the bot last said their
-- name in the chat, which is the whole of the cooldown that keeps a room full
-- of people from being turned into one player's wall (worker/src/chat.ts).
--
-- A TABLE rather than a column on `profiles`, like 006 and for the same kind of
-- reason: what somebody has done to a chat is not part of what they own, and
-- the profile is a thing the client is told about. This one it is not.
--
--   npm run migrate -- ./migrations/008-chat-shouts.sql
--   npm run migrate:local -- ./migrations/008-chat-shouts.sql
--
-- `CREATE TABLE IF NOT EXISTS`, so running it twice costs nothing, and it is in
-- `schema.sql` as well -- a database that has had the schema run since this
-- landed needs nothing at all. Nothing is backfilled and nothing can be: every
-- player starts having never shouted, which is the truth.

CREATE TABLE IF NOT EXISTS chat_shouts (
  player_id TEXT PRIMARY KEY,
  last_at   INTEGER NOT NULL
);
