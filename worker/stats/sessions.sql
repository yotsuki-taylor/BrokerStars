-- Sessions: one player's events with no gap longer than thirty minutes between
-- them. Every player, new or not -- how long a sitting lasts is a question
-- about the game, not about its newcomers.
--
-- A session's length is its last event minus its first, so a sitting that
-- produced one event is zero minutes long. That undercounts every session by
-- however long the player looked at the last screen, and it does so the same
-- way every day, which is what a number watched for movement needs.
--
-- A match is either kind: `match_start` against a bot, `duel_start` against a
-- person.
WITH e AS (
  SELECT player_id, name, ts, id FROM events WHERE player_id <> :admin
),
marked AS (
  SELECT player_id, name, ts, id,
         CASE WHEN LAG(ts) OVER w IS NULL OR ts - LAG(ts) OVER w > 1800000 THEN 1 ELSE 0 END
           AS opens_one
    FROM e
  WINDOW w AS (PARTITION BY player_id ORDER BY ts, id)
),
numbered AS (
  SELECT player_id, name, ts,
         SUM(opens_one) OVER (PARTITION BY player_id ORDER BY ts, id
                              ROWS UNBOUNDED PRECEDING) AS session
    FROM marked
),
sessions AS (
  SELECT MAX(ts) - MIN(ts) AS len,
         SUM(name IN ('match_start', 'duel_start')) AS matches
    FROM numbered
   GROUP BY player_id, session
),
by_len AS (
  SELECT len, ROW_NUMBER() OVER (ORDER BY len) AS r, COUNT(*) OVER () AS c FROM sessions
),
by_matches AS (
  SELECT matches, ROW_NUMBER() OVER (ORDER BY matches) AS r, COUNT(*) OVER () AS c
    FROM sessions
)
SELECT (SELECT COUNT(*) FROM sessions) AS "сессий",
       (SELECT ROUND(AVG(len) / 60000.0, 1) FROM by_len WHERE r IN ((c + 1) / 2, (c + 2) / 2))
         AS "медиана, мин",
       (SELECT ROUND(AVG(len) / 60000.0, 1) FROM sessions) AS "среднее, мин",
       (SELECT AVG(matches) FROM by_matches WHERE r IN ((c + 1) / 2, (c + 2) / 2))
         AS "матчей, медиана",
       (SELECT ROUND(AVG(matches), 2) FROM sessions) AS "матчей, среднее"
