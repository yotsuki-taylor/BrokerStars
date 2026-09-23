-- The way in: of the new players, how many got how far.
--
-- The same newcomers as `retention.sql` (read it for why veterans are left
-- out: the tour is for people seeing the menu for the first time, and a player
-- who was here before these events were never walked through it).
--
-- Each step counts the people who EVER did it, not only those who also did
-- every step above. The tour can be skipped and the game played anyway, so a
-- strict funnel would count everybody who skipped it as lost at step two and
-- say nothing about the rest. What the two percentages show instead: the share
-- of everybody who opened the game, and the share of the step above -- a step
-- that holds more people than the one before it is a step players reach by
-- another road.
WITH e AS (
  SELECT * FROM events WHERE player_id <> :admin
),
first AS (
  SELECT player_id, day AS cohort
    FROM (SELECT player_id, day,
                 ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY ts, id) AS n
            FROM e WHERE name = 'app_open')
   WHERE n = 1
),
newcomers AS (
  SELECT f.player_id
    FROM first f
    LEFT JOIN profiles p ON p.id = f.player_id
   WHERE p.first_seen IS NULL OR p.first_seen >= (f.cohort - 1) * 86400000
),
per AS (
  SELECT n.player_id,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 0) AS t0,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 1) AS t1,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 2) AS t2,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 3) AS t3,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 4) AS t4,
         MAX(e.name = 'tour_step' AND json_extract(e.props, '$.step') = 5) AS t5,
         SUM(e.name = 'match_start') AS starts,
         MAX(e.name = 'match_end') AS ended,
         MAX(e.name = 'signin') AS signed,
         MAX(e.name = 'duel_start') AS duelled
    FROM newcomers n
    JOIN e USING (player_id)
   GROUP BY n.player_id
),
-- One row of totals, then turned on its side. Not twelve SELECTs glued with
-- UNION ALL: D1 caps how many terms a compound SELECT may have, well below
-- twelve, and the SQLite the tests run on does not -- which is how the first
-- version of this passed its test and failed on the real database.
tot AS (
  SELECT COUNT(*) AS opened,
         SUM(t0) AS t0, SUM(t1) AS t1, SUM(t2) AS t2,
         SUM(t3) AS t3, SUM(t4) AS t4, SUM(t5) AS t5,
         SUM(starts >= 1) AS first_start, SUM(ended) AS first_end,
         SUM(starts >= 2) AS second_start, SUM(signed) AS signed, SUM(duelled) AS duelled
    FROM per
),
numbers(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < 12
),
steps AS (
  SELECT n,
         CASE n WHEN 1 THEN 'открыли игру'
                WHEN 2 THEN 'тур: шаг 1' WHEN 3 THEN 'тур: шаг 2' WHEN 4 THEN 'тур: шаг 3'
                WHEN 5 THEN 'тур: шаг 4' WHEN 6 THEN 'тур: шаг 5' WHEN 7 THEN 'тур: шаг 6'
                WHEN 8 THEN 'начали первый матч' WHEN 9 THEN 'доиграли первый матч'
                WHEN 10 THEN 'начали второй матч' WHEN 11 THEN 'вошли или связали'
                ELSE 'сыграли дуэль' END AS step,
         CASE n WHEN 1 THEN opened
                WHEN 2 THEN t0 WHEN 3 THEN t1 WHEN 4 THEN t2
                WHEN 5 THEN t3 WHEN 6 THEN t4 WHEN 7 THEN t5
                WHEN 8 THEN first_start WHEN 9 THEN first_end
                WHEN 10 THEN second_start WHEN 11 THEN signed
                ELSE duelled END AS people
    FROM numbers, tot
)
SELECT step AS "шаг",
       COALESCE(people, 0) AS "дошло",
       ROUND(100.0 * COALESCE(people, 0) / NULLIF(FIRST_VALUE(people) OVER (ORDER BY n), 0), 1)
         AS "% от открывших",
       ROUND(100.0 * COALESCE(people, 0) / NULLIF(LAG(people) OVER (ORDER BY n), 0), 1)
         AS "% от шага выше"
  FROM steps
 ORDER BY n
