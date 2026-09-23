/**
 * `npm run stats`: the three reports, straight out of D1, as tables.
 *
 * No dashboard and no service behind it on purpose — the saved statements in
 * this folder ARE the reports, `wrangler d1 execute` runs them with the same
 * login that deploys the Worker, and nothing about a player leaves Cloudflare
 * except onto the screen of whoever typed the command.
 *
 *   npm run stats              the live database
 *   npm run stats -- --local   the one `wrangler dev` keeps on this machine
 *
 * The developer's own account is left out of every report. Its id is the
 * `ADMIN_ID` in wrangler.toml — the same one the dev buttons are shown for —
 * and a Google account linked to it has its events under that id already.
 *
 * Wrangler is started through Node rather than through `npx`, and that is not
 * taste: on Windows `npx` is a batch file, a batch file needs a shell, and a
 * shell takes the SQL apart at its quotes. Node hands the statement over as
 * one argument on every platform.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fill } from './fill.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, '..');
const WRANGLER = join(WORKER, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DATABASE = 'broker-stars';

const REPORTS = [
  ['retention.sql', 'Удержание по когортам (день первого app_open)'],
  ['retention-by-host.sql', 'Удержание по когортам и хостам'],
  ['funnel.sql', 'Воронка онбординга (новые игроки)'],
  ['sessions.sql', 'Сессии (перерыв больше 30 минут — новая сессия)'],
];

const local = process.argv.includes('--local');

function adminId() {
  const toml = readFileSync(join(WORKER, 'wrangler.toml'), 'utf8');
  return /^\s*ADMIN_ID\s*=\s*"([^"]*)"/m.exec(toml)?.[1] ?? '';
}

function query(sql) {
  const out = spawnSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DATABASE, local ? '--local' : '--remote', '--json', '--command', sql],
    { cwd: WORKER, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (out.status !== 0) {
    throw new Error((out.stderr || out.stdout || `wrangler exited ${out.status}`).trim());
  }
  const parsed = JSON.parse(out.stdout);
  return (Array.isArray(parsed) ? parsed[0] : parsed)?.results ?? [];
}

/** Plain columns, right-aligned numbers, a dash for "not yet". */
function table(rows) {
  if (rows.length === 0) return '  (пусто)';
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v === null || v === undefined ? '—' : String(v));
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const numeric = cols.map((c) => rows.every((r) => r[c] === null || typeof r[c] === 'number'));
  const line = (vals) =>
    '  ' +
    vals.map((v, i) => (numeric[i] ? v.padStart(width[i]) : v.padEnd(width[i]))).join('  ');
  return [
    line(cols),
    '  ' + width.map((w) => '─'.repeat(w)).join('  '),
    ...rows.map((r) => line(cols.map((c) => cell(r[c])))),
  ].join('\n');
}

function main() {
  if (!existsSync(WRANGLER)) {
    console.error('Нет wrangler: сначала `npm install` в папке worker/.');
    process.exit(1);
  }
  const admin = adminId();
  const today = Math.floor(Date.now() / 86_400_000);
  console.log(
    `База: ${local ? 'локальная' : 'боевая'} · исключён ADMIN_ID ${admin || '(не задан)'} · ` +
      `сегодня ${new Date(today * 86_400_000).toISOString().slice(0, 10)} (UTC)\n`,
  );
  for (const [file, title] of REPORTS) {
    const sql = fill(readFileSync(join(HERE, file), 'utf8'), { admin, today });
    console.log(`■ ${title}`);
    try {
      console.log(table(query(sql)));
    } catch (err) {
      console.log(`  не получилось: ${err.message.split('\n')[0]}`);
    }
    console.log('');
  }
}

main();
