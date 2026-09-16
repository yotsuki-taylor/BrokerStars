/**
 * The little of `node:sqlite` that `d1.ts` actually touches.
 *
 * Here for exactly the reason `raw.d.ts` is here: this package's tsconfig names
 * `@cloudflare/workers-types` and nothing else, deliberately, so that nobody
 * can `import fs` in a Worker and discover on a deploy that there is no
 * filesystem. Pulling in Node's types to typecheck one test helper would open
 * that door for the sake of a database that only exists inside a test.
 *
 * So this declares the four methods used and no more. It is not a description
 * of the module — it is a description of what the test asks of it, which is the
 * shape that has to keep compiling.
 */
declare module 'node:sqlite' {
  interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): RunResult;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
