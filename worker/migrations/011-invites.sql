-- Paying for an invitation that was taken up.
--
-- `friends` says who knows whom and nothing about how they met: it is two rows,
-- one per direction, written in one batch and deliberately symmetric. Who
-- INVITED whom is a different fact with a different lifetime -- it is settled
-- once, it is paid for once, and it is the thing a cap has to count. So it goes
-- here rather than as a column on a friendship.
--
-- `friend_id` is the primary key, which is the whole anti-abuse story in one
-- line: a person can be somebody's invited friend exactly once, ever. Redeeming
-- a second code, or the same one twice, adds nothing to pay out.
--
-- Safe to run twice, and in `schema.sql` too, on the CREATE TABLE.
CREATE TABLE IF NOT EXISTS invites (
  -- who came in on somebody's code
  friend_id  TEXT PRIMARY KEY,
  -- whose code it was
  host_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- null until the friend has played enough for the pair to be paid
  paid_at    INTEGER
);

-- The cap is "how many has this host been paid for", so that is the query.
CREATE INDEX IF NOT EXISTS invites_by_host ON invites (host_id, paid_at);
