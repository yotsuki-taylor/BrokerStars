/**
 * Text imports, for a test that reads source files rather than calling them.
 *
 * Vite serves any file as a string with `?raw`, and this is what tells the
 * compiler so. It exists because the alternative was `node:fs`, which needs
 * Node's types — and the Worker's tsconfig names `@cloudflare/workers-types`
 * and nothing else ON PURPOSE. Adding "node" beside it would let anybody
 * `import fs` in a Worker and find out at runtime, on a deploy, that there is
 * no filesystem there. One four-line declaration is the cheaper side of that
 * trade.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
