-- Retention again, split by where the player first opened the game.
--
-- The same cohorts, the same newcomers and the same rule for coming back as
-- `retention.sql` -- read that one first. The host is the one on the player's
-- FIRST `app_open`: somebody who started in Telegram and came back on Android is
-- a Telegram player who came back, because the question this answers is which
-- door keeps the people who walk in through it.
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
  SELECT n.player_id, n.cohort, n.host,
         MAX(o.day = n.cohort + 1) AS d1,
         MAX(o.day = n.cohort + 7) AS d7
    FROM newcomers n
    JOIN opens o USING (player_id)
   GROUP BY n.player_id, n.cohort, n.host
)
SELECT date(cohort * 86400, 'unixepoch') AS "когорта",
       host AS "хост",
       COUNT(*) AS "игроков",
       CASE WHEN cohort + 1 < :today THEN SUM(d1) END AS "D1",
       CASE WHEN cohort + 1 < :today THEN ROUND(100.0 * SUM(d1) / COUNT(*), 1) END AS "D1 %",
       CASE WHEN cohort + 7 < :today THEN SUM(d7) END AS "D7",
       CASE WHEN cohort + 7 < :today THEN ROUND(100.0 * SUM(d7) / COUNT(*), 1) END AS "D7 %"
  FROM back
 GROUP BY cohort, host
 ORDER BY cohort, host
