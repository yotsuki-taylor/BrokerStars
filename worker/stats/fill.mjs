/**
 * A saved report, made ready to run.
 *
 * `wrangler d1 execute` takes a statement and no parameters, so the two values
 * every report needs are written into the text: `:admin`, the developer's own
 * id, which no report counts; and `:today`, today as `dayOf` counts days, which
 * decides whether a cohort has had its day+1 yet. Both come from us, not from
 * anybody's input, and the id is checked to be the shape an id has before it is
 * quoted into anything.
 *
 * Comments are taken out and the whitespace folded because the statement then
 * travels as ONE command-line argument, and a line starting `--` is the one
 * thing in these files a shell or a quoting rule could mistake for something
 * else. None of the reports puts `--` inside a string.
 *
 * Shared by `run.mjs` and by `test/stats.test.ts`, so the numbers the test
 * checks come out of the same statement the script sends.
 */
export function fill(sql, { admin, today }) {
  if (!/^[\w:.-]*$/.test(admin)) throw new Error(`not an id: ${admin}`);
  if (!Number.isInteger(today)) throw new Error(`not a day: ${today}`);
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:admin\b/g, `'${admin}'`)
    .replace(/:today\b/g, String(today));
}
