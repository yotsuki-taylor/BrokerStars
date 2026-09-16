/**
 * A D1 that runs in a test, built on the SQLite that ships inside Node.
 *
 * WHY THIS EXISTS AT ALL, when every other test in this directory is careful
 * not to need a database. Everything in `worker/src/corps.ts` IS the database:
 * the thirty-seat ceiling is a conditional UPDATE, the ownership handover is an
 * ORDER BY, the season rollover is a CASE, and the first tap on a duel card
 * wins because of a WHERE clause. None of that can be lifted into a pure
 * function without lifting the guarantee out with it — the guarantee is that
 * two requests cannot both win, and that is a property of the statement rather
 * than of the arithmetic around it.
 *
 * So the rules are tested against real SQL, and `schema.sql` is what creates
 * the tables — which means these tests also fail if the schema and the queries
 * drift apart, which is the second thing worth having.
 *
 * WHAT IT IS NOT. It is not a claim that D1 and SQLite behave identically. It
 * is SQLite underneath either way; what differs is the transport, the batching
 * and the failure modes, and a test here proves a statement does what it says
 * rather than proving a deployment works.
 *
 * WHAT IT NEEDS. `node:sqlite`, which is in Node from 22.13 without a flag —
 * the version CI installs (`node-version: 22` resolves to the latest 22.x) and
 * anything newer. There is no third-party dependency here on purpose: the
 * Worker package has four dev dependencies and a database driver is not worth
 * being the fifth.
 *
 * THE ONE PIECE OF TRANSLATION. D1 takes `?1`-style numbered parameters and
 * `node:sqlite` binds positionally, so the SQL is rewritten on the way through:
 * every `?N` becomes a plain `?` and the argument list is rebuilt in order of
 * appearance. That is not cosmetic — half the statements in `corps.ts` use the
 * same parameter twice, and a positional binding of the original would silently
 * put the wrong value in the second place.
 */

import { DatabaseSync } from 'node:sqlite';
import SCHEMA from '../schema.sql?raw';

type Row = Record<string, unknown>;

/** `?1, ?2, ?1` and three arguments become `?, ?, ?` and four. */
function positional(sql: string, args: unknown[]): { sql: string; args: unknown[] } {
  const out: unknown[] = [];
  const text = sql.replace(/\?(\d+)/g, (_, n: string) => {
    out.push(args[Number(n) - 1] ?? null);
    return '?';
  });
  // A statement with no numbered parameters keeps whatever it was given.
  return out.length ? { sql: text, args: out } : { sql, args };
}

/** SQLite hands back `null`-prototype objects; the code under test expects plain ones. */
const plain = (r: unknown): Row => ({ ...(r as Row) });

class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}

  bind(...args: unknown[]): Statement {
    return new Statement(this.db, this.sql, args);
  }

  private ready() {
    const { sql, args } = positional(this.sql, this.args);
    return { stmt: this.db.prepare(sql), args: args.map((a) => (a === undefined ? null : a)) };
  }

  async first<T>(): Promise<T | null> {
    const { stmt, args } = this.ready();
    const row = stmt.get(...(args as never[]));
    return row === undefined ? null : (plain(row) as T);
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const { stmt, args } = this.ready();
    return { results: stmt.all(...(args as never[])).map(plain) as T[], success: true };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const { stmt, args } = this.ready();
    const out = stmt.run(...(args as never[]));
    return {
      meta: { changes: Number(out.changes), last_row_id: Number(out.lastInsertRowid) },
    };
  }
}

export interface Fake {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
  /** straight to the database, for a test that wants to arrange something */
  exec(sql: string): void;
}

/**
 * An empty database with the real schema in it.
 *
 * A batch is run in a transaction, which is what D1 promises: all of it or none
 * of it, in the order given.
 */
export function fakeD1(): Fake {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        const out: unknown[] = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    exec: (sql: string) => db.exec(sql),
  };
}
