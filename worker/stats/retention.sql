-- Retention: of the people who first opened the game on a day, how many opened
-- it again exactly one day later (D1) and exactly seven days later (D7).
--
-- `:admin` and `:today` are filled in by `run.mjs` (and by the test that holds
-- these numbers to a hand-counted answer, `test/stats.test.ts`): the developer's
-- own id, which no report counts, and today as `dayOf` counts days.
--
-- THE COHORT is the day of a player's first `app_open`, and only for players
-- the server had not already met before it. `profiles.first_seen` is written
-- the first time anybody opens a session, so a player whose profile is older
-- than their first recorded open is somebody who was here before these events
-- were -- a veteran on launch day, or a regular whose first open has aged past
-- the ninety days. Counted as new, either would make a cohort out of people who
-- are not new at all. The day of slack is for a phone clock a little ahead of
-- ours; a player with no profile row at all is taken as new.
--
-- COMING BACK is an `app_open` on that day, and nothing else: an event queued
-- on day 0 and sent on day 1 is still dated day 0.
--
-- A cohort whose day+1 or day+7 has not finished yet shows nothing rather than
-- a zero: nobody has had the chance to come back.
WITH opens AS (
  SELECT player_id, host, day, ts, id
    FROM events
   WHERE name = 'app_open' AND player_id <> :admin
),
first AS (
  SELECT player_id, day AS cohort, host
    FROM (SELECT player_id, day, host,
                 ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY ts, id) AS n
            FROM opens)
   WHERE n = 1
),
newcomers AS (
  SELECT f.player_id, f.cohort, f.host
    FROM first f
    LEFT JOIN profiles p ON p.id = f.player_id
   WHERE p.first_seen IS NULL OR p.first_seen >= (f.cohort - 1) * 86400000
),
back AS (
  SELECT n.player_id, n.cohort,
         MAX(o.day = n.cohort + 1) AS d1,
         MAX(o.day = n.cohort + 7) AS d7
    FROM newcomers n
    JOIN opens o USING (player_id)
   GROUP BY n.player_id, n.cohort
)
SELECT date(cohort * 86400, 'unixepoch') AS "когорта",
       COUNT(*) AS "игроков",
       CASE WHEN cohort + 1 < :today THEN SUM(d1) END AS "D1",
       CASE WHEN cohort + 1 < :today THEN ROUND(100.0 * SUM(d1) / COUNT(*), 1) END AS "D1 %",
       CASE WHEN cohort + 7 < :today THEN SUM(d7) END AS "D7",
       CASE WHEN cohort + 7 < :today THEN ROUND(100.0 * SUM(d7) / COUNT(*), 1) END AS "D7 %"
  FROM back
 GROUP BY cohort
 ORDER BY cohort
