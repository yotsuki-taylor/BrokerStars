-- The ladder joins the profile.
--
-- Only needed on a database where `profiles` was created before this column
-- existed — that is, one where `npm run schema` was run between the profile
-- change and this one. On any other database `schema.sql` already made the
-- column and this file fails with "duplicate column name", which is the right
-- answer and breaks nothing.
--
-- See `migrations/001-results-token.sql` for why `ALTER TABLE` lives out here
-- instead of in the re-runnable schema.

ALTER TABLE profiles ADD COLUMN wins TEXT NOT NULL DEFAULT '[]';
