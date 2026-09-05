import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig } from './config';
import {
  COMPANIES,
  companyById,
  pickCompanies,
  poolFor,
  type Company,
  type StockConfig,
} from './companies';
import { buildSchedule, quarterTicks, totalTicks } from './market';
import { createMatch, runToEnd } from './match';
import { Rng } from './rng';
import type { MatchState } from './types';

const LEAGUES = 5;
const TOTAL = totalTicks(CONFIG);

/** A match on a chosen board, with nobody trading, so only the market moves. */
function board(stocks: StockConfig[], seed = 1): MatchState {
  return runToEnd(
    createMatch(seed, CONFIG, {
      traders: [
        { name: 'A', kind: 'human', preset: 'medium' },
        { name: 'B', kind: 'human', preset: 'medium' },
      ],
      stocks,
    }),
  );
}

const only = (id: string): Company => {
  const c = companyById(id);
  if (!c) throw new Error(`no company ${id}`);
  return c;
};

/** Same company with one trait field overridden, for forcing a rare event. */
const tweak = (id: string, trait: Partial<Company['trait']>): Company => {
  const c = only(id);
  return { ...c, trait: { ...c.trait, ...trait } };
};

describe('the roster', () => {
  it('gives every company an id, a colour and a logo of its own', () => {
    const ids = COMPANIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const logos = COMPANIES.map((c) => c.logo);
    expect(new Set(logos).size).toBe(logos.length);
    for (const c of COMPANIES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.tagline.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.basePrice).toBeGreaterThan(0);
    }
  });

  it('carries the numbers each trait kind actually reads', () => {
    for (const c of COMPANIES) {
      const t = c.trait;
      if (t.kind === 'floor') expect(t.floor).toBeGreaterThan(0);
      if (t.kind === 'regulated') expect(t.anchor).toBeGreaterThan(0);
      if (t.kind === 'locked') expect(t.runWeights).toHaveLength(3);
      if (t.kind === 'stall') expect(t.stallTicks?.[0]).toBeGreaterThan(0);
      if (t.kind === 'bubble') expect(t.popTo).toBeGreaterThan(0);
      if (t.kind === 'moonshot') {
        expect(t.band?.[0]).toBeGreaterThan(0);
        expect(t.jumpMult ?? 0).toBeGreaterThan(1);
      }
      if (t.kind === 'luxury') expect(t.dipTo ?? 0).toBeGreaterThan(0);
      if (t.kind === 'dividend') expect(t.dropAtClose ?? 0).toBeGreaterThan(0);
      if (t.kind === 'headline') expect(t.headlineChance ?? 0).toBeGreaterThan(0);
      if (t.kind === 'ratchet') expect(t.giveBack ?? 0).toBeGreaterThan(0);
    }
  });

  it('gives every league at least five companies of its own to draw from', () => {
    for (let i = 0; i < LEAGUES; i++) {
      const own = COMPANIES.filter((c) => !c.staple && c.fromLeague === i);
      expect(own.length).toBeGreaterThanOrEqual(5);
    }
    // and the two non-staple slots always have a real choice behind them
    for (let i = 0; i < LEAGUES; i++) {
      expect(poolFor(i).filter((c) => !c.staple).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('offers the staples everywhere and opens the rest a league at a time', () => {
    const staples = COMPANIES.filter((c) => c.staple);
    expect(staples.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < LEAGUES; i++) {
      const pool = poolFor(i);
      for (const s of staples) expect(pool).toContain(s);
      // every league can field a board of three
      expect(pool.length).toBeGreaterThanOrEqual(3);
      if (i > 0) for (const c of poolFor(i - 1)) expect(pool).toContain(c);
    }
    expect(poolFor(LEAGUES - 1)).toHaveLength(COMPANIES.length);
  });
});

describe('drawing a board', () => {
  it('always deals three distinct companies from that league only', () => {
    for (let league = 0; league < LEAGUES; league++) {
      const pool = poolFor(league);
      for (let seed = 0; seed < 60; seed++) {
        const picked = pickCompanies(league, new Rng(seed));
        expect(picked).toHaveLength(3);
        expect(new Set(picked.map((c) => c.id)).size).toBe(3);
        for (const c of picked) expect(pool).toContain(c);
      }
    }
  });

  it('always includes one staple to read the board against', () => {
    for (let league = 0; league < LEAGUES; league++) {
      for (let seed = 0; seed < 60; seed++) {
        const picked = pickCompanies(league, new Rng(seed));
        expect(picked.filter((c) => c.staple).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never puts two lines of the same colour family on one chart', () => {
    for (let league = 0; league < LEAGUES; league++) {
      for (let seed = 0; seed < 60; seed++) {
        const fams = pickCompanies(league, new Rng(seed)).map((c) => c.family);
        expect(new Set(fams).size).toBe(3);
      }
    }
  });

  it('deals a different board most of the time, even in the entry league', () => {
    for (let league = 0; league < LEAGUES; league++) {
      const boards = new Set<string>();
      for (let seed = 0; seed < 80; seed++) {
        boards.add(
          pickCompanies(league, new Rng(seed))
            .map((c) => c.id)
            .sort()
            .join('+'),
        );
      }
      // an entry league with two trait companies could only ever deal three
      // boards; the point of the wider pool is that it deals many more
      expect(boards.size).toBeGreaterThanOrEqual(12);
    }
  });

  it('reaches every company in the top league eventually', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      for (const c of pickCompanies(LEAGUES - 1, new Rng(seed))) seen.add(c.id);
    }
    expect(seen.size).toBe(COMPANIES.length);
  });
});

describe('traits on the tape', () => {
  it('replays a trait board tick for tick from the same seed', () => {
    const stocks = [only('yeti'), only('garage'), only('velvet')];
    const a = board(stocks, 77);
    const b = board(stocks, 77);
    expect(a.stocks.map((s) => s.history)).toEqual(b.stocks.map((s) => s.history));
  });

  it('leaves the plain companies untouched when a trait company joins them', () => {
    const alone = board([only('tet'), only('uranus'), only('nova')], 5);
    // a trait company draws from its own RNG stream, so the plain lines beside
    // it must print exactly what they printed without it
    const beside = board([only('tet'), only('uranus'), only('yeti')], 5);
    expect(beside.stocks[0].history).toEqual(alone.stocks[0].history);
    expect(beside.stocks[1].history).toEqual(alone.stocks[1].history);
  });

  it('never prints a floor company below its floor', () => {
    const brisket = only('brisket');
    for (const seed of [1, 2, 3, 4, 5]) {
      const st = board([brisket, only('saltcandle'), only('tet')], seed);
      for (const p of st.stocks[0].history) expect(p).toBeGreaterThanOrEqual(brisket.trait.floor!);
      const salt = only('saltcandle');
      for (const p of st.stocks[1].history) expect(p).toBeGreaterThanOrEqual(salt.trait.floor!);
    }
  });

  it('holds a locked company on one direction for a run of segments', () => {
    const segs = buildSchedule(only('compass'), new Rng(9), TOTAL, []);
    for (const s of segs) {
      expect(s.dir).not.toBe(0); // it is never undecided
      expect(s.strength).toBeGreaterThanOrEqual(2); // and never limp
    }
    // most segments continue the previous one rather than turning around
    let same = 0;
    for (let i = 1; i < segs.length; i++) if (segs[i].dir === segs[i - 1].dir) same++;
    expect(same / (segs.length - 1)).toBeGreaterThan(0.4);
  });

  it('freezes a stalling company dead flat for whole segments', () => {
    const arena = only('arena');
    const segs = buildSchedule(arena, new Rng(11), TOTAL, []);
    const frozen = segs.filter((s) => s.frozen);
    expect(frozen.length).toBeGreaterThan(0);
    for (const s of frozen) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(arena.trait.stallTicks![0]);
    }

    const st = board([arena, only('tet'), only('uranus')], 3);
    const hist = st.stocks[0].history;
    const flatRuns = st.stocks[0].segments.filter((s) => s.frozen && s.end < hist.length);
    expect(flatRuns.length).toBeGreaterThan(0);
    for (const s of flatRuns) {
      for (let t = s.start + 1; t < s.end; t++) expect(hist[t]).toBe(hist[s.start]);
    }
  });

  it('drags a regulated company back to its anchor by the half-year close', () => {
    const civic = only('civic');
    const anchor = civic.trait.anchor!;
    const half = quarterTicks(CONFIG) * 2;
    let closer = 0;
    for (let seed = 0; seed < 30; seed++) {
      const hist = board([civic, only('tet'), only('uranus')], seed).stocks[0].history;
      const mid = Math.abs(hist[Math.round(half * 0.6)] - anchor);
      const close = Math.abs(hist[half] - anchor);
      if (close <= mid) closer++;
    }
    expect(closer).toBeGreaterThan(20);
  });

  it('pops a bubble in a single tick and never lets it climb back', () => {
    const doomed = tweak('yeti', { popChance: 1 });
    const st = board([doomed, only('tet'), only('uranus')], 4);
    const hist = st.stocks[0].history;
    const popTo = doomed.trait.popTo!;
    // tick 3 is the first the pop is allowed on
    expect(hist[2]).toBeGreaterThan(popTo);
    expect(hist[3]).toBe(popTo);
    for (let t = 3; t < hist.length; t++) expect(hist[t]).toBeLessThan(popTo * 1.7);
  });

  it('climbs a bubble that never pops', () => {
    const safe = tweak('yeti', { popChance: 0 });
    const hist = board([safe, only('tet'), only('uranus')], 6).stocks[0].history;
    expect(hist[hist.length - 1]).toBeGreaterThan(hist[0] * 1.5);
  });

  it('keeps a moonshot in its band, and out of it for good once it jumps', () => {
    const grounded = tweak('garage', { jumpChance: [0, 0, 0] });
    const band = only('garage').trait.band!;
    const still = board([grounded, only('tet'), only('uranus')], 8).stocks[0].history;
    for (const p of still) expect(p).toBeLessThanOrEqual(band[1] + 1e-9);

    const sure = tweak('garage', { jumpChance: [1, 1, 1] });
    const flown = board([sure, only('tet'), only('uranus')], 8).stocks[0].history;
    const q = quarterTicks(CONFIG);
    expect(flown[q - 1]).toBeLessThanOrEqual(band[1] + 1e-9);
    const mult = only('garage').trait.jumpMult!;
    expect(flown[flown.length - 1]).toBeGreaterThan(band[1]);
    // once it has arrived, the floor comes up with it
    for (let t = q * 2; t < flown.length; t++) expect(flown[t]).toBeGreaterThanOrEqual(band[0] * mult);
  });

  it('knocks a luxury company down at a quarter close and lets it climb back', () => {
    const sure = tweak('velvet', { dipChance: 1 });
    const velvet = only('velvet');
    const hist = board([sure, only('tet'), only('uranus')], 12).stocks[0].history;
    const q = quarterTicks(CONFIG);
    const span = velvet.trait.dipTicks!;
    const bottom = Math.min(...hist.slice(q, q + span[1] + 4));
    expect(bottom).toBeLessThan(velvet.basePrice * 0.75);
    // and it is back near its own level well before the next close
    expect(hist[q * 2 - 1]).toBeGreaterThan(velvet.basePrice * 0.8);
  });

  it('gaps a dividend company down at each close and lets it grind back', () => {
    const postal = only('postal');
    const drop = postal.trait.dropAtClose!;
    const q = quarterTicks(CONFIG);
    const hist = board([postal, only('tet'), only('uranus')], 21).stocks[0].history;
    // the first three closes pay; the fourth is the whistle and is left alone
    for (let i = 1; i <= CONFIG.match.quarters - 1; i++) {
      expect(hist[q * i]).toBeCloseTo(hist[q * i - 1] * (1 - drop), 6);
    }
    // and mean reversion repairs the notch: more often than not it is back
    // above the gap well before the next close, though any single match can
    // trend away. The margin is thin — the two headlines of the year land
    // inside 80 seconds, so a quarter carries enough news to drown the pull —
    // so this samples widely and only asks for a majority.
    const after = Math.round(q * 0.6);
    let repaired = 0;
    const runs = 120;
    for (let seed = 0; seed < runs; seed++) {
      const h = board([postal, only('tet'), only('uranus')], seed).stocks[0].history;
      if (h[q + after] > h[q]) repaired++;
    }
    expect(repaired).toBeGreaterThan(runs / 2);
  });

  it('breaks news on a headline company far more often than on a plain one', () => {
    const loud = buildSchedule(only('kraken'), new Rng(31), TOTAL, []).filter((s) => s.isNews);
    const quiet = buildSchedule(only('tet'), new Rng(31), TOTAL, []).filter((s) => s.isNews);
    expect(quiet).toHaveLength(0); // nothing but the phases schedules news for TET
    expect(loud.length).toBeGreaterThanOrEqual(2);
    for (const seg of loud) {
      expect(seg.strength).toBe(3);
      expect(seg.dir).not.toBe(0);
    }
  });

  it('never lets a ratchet company fall past the quarter high-water mark', () => {
    const q = quarterTicks(CONFIG);
    for (const id of ['crampon', 'highwater']) {
      const c = only(id);
      const give = c.trait.giveBack!;
      for (const seed of [2, 3, 5]) {
        const hist = board([c, only('tet'), only('uranus')], seed).stocks[0].history;
        let peak = hist[0];
        let ratcheted = 0;
        for (let t = 0; t < hist.length; t++) {
          // the close wipes the mark and sets a new one under the price there
          if (t > 0 && t % q === 0) peak = hist[t - 1];
          expect(hist[t]).toBeGreaterThanOrEqual(peak * (1 - give) - 1e-6);
          if (hist[t] > peak) ratcheted++;
          peak = Math.max(peak, hist[t]);
        }
        // and the mark is doing something, not merely sitting under the floor
        expect(ratcheted).toBeGreaterThan(10);
      }
    }
  });

  it('plays a whole match on every company without printing a bad price', () => {
    const cfg = cloneConfig();
    for (let i = 0; i < COMPANIES.length; i += 3) {
      const slice = COMPANIES.slice(i, i + 3);
      const stocks = slice.length === 3 ? slice : COMPANIES.slice(-3);
      const st = runToEnd(
        createMatch(100 + i, cfg, {
          traders: [
            { name: 'A', kind: 'bot', preset: 'hard' },
            { name: 'B', kind: 'bot', preset: 'random' },
          ],
          stocks,
        }),
      );
      expect(st.finished).toBe(true);
      for (const s of st.stocks) {
        expect(s.history).toHaveLength(TOTAL + 1);
        for (const p of s.history) {
          expect(Number.isFinite(p)).toBe(true);
          expect(p).toBeGreaterThan(0);
        }
      }
    }
  });
});
