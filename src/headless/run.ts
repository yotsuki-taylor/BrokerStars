/**
 * Headless balance runner.
 *   npm run sim -- --seed=42 --runs=1000 --bot-a=medium --bot-b=random
 *   npm run sim -- --runs=500 --acceptance
 */
import { CONFIG, cloneConfig } from '../sim/config';
import { createMatch, runToEnd } from '../sim/match';

interface Args {
  seed: number;
  runs: number;
  botA: string;
  botB: string;
  acceptance: boolean;
  off: string[];
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  return {
    seed: Number(get('seed') ?? 1),
    runs: Number(get('runs') ?? 200),
    botA: get('bot-a') ?? 'medium',
    botB: get('bot-b') ?? 'random',
    acceptance: argv.includes('--acceptance'),
    off: (get('off') ?? '').split(',').filter(Boolean),
  };
}

interface Result {
  winsA: number;
  runs: number;
  closeMatches: number;
  bankruptA: number;
  bankruptB: number;
  nwA: number[];
  nwB: number[];
  tradesA: number;
}

function duel(a: string, b: string, seed0: number, runs: number, off: string[]): Result {
  const cfg = cloneConfig(CONFIG);
  for (const flag of off) {
    if (flag in cfg.flags) (cfg.flags as Record<string, boolean>)[flag] = false;
  }
  const r: Result = {
    winsA: 0,
    runs,
    closeMatches: 0,
    bankruptA: 0,
    bankruptB: 0,
    nwA: [],
    nwB: [],
    tradesA: 0,
  };
  for (let i = 0; i < runs; i++) {
    const st = createMatch(seed0 + i, cfg, {
      traders: [
        { name: 'A', kind: 'bot', preset: a },
        { name: 'B', kind: 'bot', preset: b },
      ],
    });
    runToEnd(st);
    const [ta, tb] = st.traders;
    if (ta.netWorth > tb.netWorth) r.winsA++;
    const hi = Math.max(ta.netWorth, tb.netWorth);
    const lo = Math.min(ta.netWorth, tb.netWorth);
    if (hi > 0 && (hi - lo) / hi < 0.15) r.closeMatches++;
    if (ta.bankrupt) r.bankruptA++;
    if (tb.bankrupt) r.bankruptB++;
    r.nwA.push(ta.netWorth);
    r.nwB.push(tb.netWorth);
    r.tradesA += ta.trades.length;
  }
  return r;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0);
const pct = (n: number, d: number) => `${((100 * n) / (d || 1)).toFixed(1)}%`;
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

function report(label: string, r: Result): void {
  console.log(`\n=== ${label}  (${r.runs} matches) ===`);
  console.log(`  A wins           ${pct(r.winsA, r.runs)}`);
  console.log(`  net worth A      median ${money(median(r.nwA))}  mean ${money(mean(r.nwA))}`);
  console.log(`  net worth B      median ${money(median(r.nwB))}  mean ${money(mean(r.nwB))}`);
  console.log(`  close (<15% gap) ${pct(r.closeMatches, r.runs)}`);
  console.log(`  bankruptcies     A ${pct(r.bankruptA, r.runs)}   B ${pct(r.bankruptB, r.runs)}`);
  console.log(`  trades / match A ${(r.tradesA / r.runs).toFixed(1)}`);
}

function determinismCheck(seed: number): void {
  const mk = () =>
    runToEnd(
      createMatch(seed, CONFIG, {
        traders: [
          { name: 'A', kind: 'bot', preset: 'medium' },
          { name: 'B', kind: 'bot', preset: 'hard' },
        ],
      }),
    );
  const a = mk();
  const b = mk();
  const sameP = a.stocks.every((s, i) => s.history.every((v, j) => v === b.stocks[i].history[j]));
  const sameN = a.traders.every((t, i) =>
    t.netWorthHistory.every((v, j) => v === b.traders[i].netWorthHistory[j]),
  );
  console.log(`\ndeterminism (seed ${seed}): prices ${sameP ? 'OK' : 'FAIL'}, net worth ${sameN ? 'OK' : 'FAIL'}`);
}

const args = parseArgs(process.argv.slice(2));
determinismCheck(args.seed);

if (args.acceptance) {
  report('medium vs random', duel('medium', 'random', args.seed, args.runs, args.off));
  report('hard vs easy', duel('hard', 'easy', args.seed, args.runs, args.off));
  report('medium vs holder (buy & hold)', duel('medium', 'holder', args.seed, args.runs, args.off));
  report('medium vs medium', duel('medium', 'medium', args.seed, args.runs, args.off));
  for (const flag of ['marketImpact', 'shorting', 'phases']) {
    report(`flag off: ${flag} — medium vs random`, duel('medium', 'random', args.seed, Math.min(args.runs, 100), [flag]));
  }
} else {
  report(`${args.botA} vs ${args.botB}`, duel(args.botA, args.botB, args.seed, args.runs, args.off));
}
