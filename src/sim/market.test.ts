import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig } from './config';
import {
  buildSchedule,
  halfProgress,
  isQuarterClose,
  phaseAtTick,
  planNewsEvents,
  quarterCloses,
  quarterOf,
  quarterTicks,
  segmentAt,
  totalTicks,
} from './market';
import { createMatch, runToEnd } from './match';
import { Rng, hashSeed } from './rng';

const TOTAL = totalTicks(CONFIG);

describe('rng', () => {
  it('repeats itself from the same seed and diverges from another', () => {
    const draw = (seed: number) => Array.from({ length: 8 }, () => new Rng(seed).next());
    expect(new Rng(5).next()).toBe(new Rng(5).next());
    expect(draw(5)[0]).not.toBe(draw(6)[0]);
  });

  it('stays inside [0, 1)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes seeds to a stable 32-bit number', () => {
    expect(hashSeed('42')).toBe(hashSeed('42'));
    expect(hashSeed('42')).not.toBe(hashSeed('43'));
    expect(Number.isInteger(hashSeed('abc'))).toBe(true);
  });
});

describe('segment schedule', () => {
  const schedule = () => buildSchedule(CONFIG.stocks[0], new Rng(1), TOTAL, []);

  it('covers the whole match end to end with no gaps', () => {
    const segs = schedule();
    expect(segs[0].start).toBe(0);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end);
    expect(segs[segs.length - 1].end).toBeGreaterThanOrEqual(TOTAL);
  });

  it('finds exactly one segment for any tick in the match', () => {
    const segs = schedule();
    for (let t = 0; t < TOTAL; t += 7) {
      const hits = segs.filter((s) => t >= s.start && t < s.end);
      expect(hits).toHaveLength(1);
      expect(segmentAt(segs, t)).toBe(hits[0]);
    }
  });

  it('keeps direction and strength consistent: flat means no strength', () => {
    for (const seg of schedule()) {
      expect([-1, 0, 1]).toContain(seg.dir);
      if (seg.dir === 0) expect(seg.strength).toBe(0);
      else expect(seg.strength).toBeGreaterThan(0);
      expect(seg.strength).toBeLessThanOrEqual(3);
    }
  });

  it('makes a news segment a full-strength one', () => {
    const segs = buildSchedule(CONFIG.stocks[0], new Rng(3), TOTAL, [100]);
    const news = segs.filter((s) => s.isNews);
    expect(news.length).toBeGreaterThan(0);
    for (const seg of news) {
      expect(seg.strength).toBe(3);
      expect(seg.dir).not.toBe(0);
    }
  });
});

describe('quarters', () => {
  it('cuts the match into four equal boxes', () => {
    expect(quarterTicks(CONFIG)).toBe(TOTAL / CONFIG.match.quarters);
    expect(quarterCloses(CONFIG)).toEqual([40, 80, 120, 160]);
    expect(quarterCloses(CONFIG)[CONFIG.match.quarters - 1]).toBe(TOTAL);
  });

  it('puts every tick in exactly one quarter, first to last', () => {
    expect(quarterOf(CONFIG, 0)).toBe(0);
    expect(quarterOf(CONFIG, quarterTicks(CONFIG) - 1)).toBe(0);
    expect(quarterOf(CONFIG, quarterTicks(CONFIG))).toBe(1);
    // the closing tick belongs to the last quarter rather than a fifth one
    expect(quarterOf(CONFIG, TOTAL)).toBe(CONFIG.match.quarters - 1);
  });

  it('flags the closes and nothing else', () => {
    expect(isQuarterClose(CONFIG, 0)).toBe(false);
    for (const t of quarterCloses(CONFIG)) expect(isQuarterClose(CONFIG, t)).toBe(true);
    expect(isQuarterClose(CONFIG, 59)).toBe(false);
    expect(isQuarterClose(CONFIG, 61)).toBe(false);
  });

  it('runs the half-year from 0 at the open to 1 at the close', () => {
    const half = quarterTicks(CONFIG) * 2;
    expect(halfProgress(CONFIG, 0)).toBe(0);
    expect(halfProgress(CONFIG, half / 2)).toBeCloseTo(0.5, 6);
    expect(halfProgress(CONFIG, half)).toBe(1);
    // and starts over for the second half
    expect(halfProgress(CONFIG, half + 1)).toBeCloseTo(1 / half, 6);
    expect(halfProgress(CONFIG, TOTAL)).toBe(1);
  });
});

describe('phases', () => {
  it('walks through the four quarters in order', () => {
    expect(phaseAtTick(CONFIG, 0).id).toBe('q1');
    expect(phaseAtTick(CONFIG, TOTAL / 2).id).toBe('q3');
    expect(phaseAtTick(CONFIG, TOTAL - 1).id).toBe('q4');
  });

  it('gives every quarter a phase of its own', () => {
    expect(CONFIG.phases).toHaveLength(CONFIG.match.quarters);
    const qt = quarterTicks(CONFIG);
    CONFIG.phases.forEach((p, i) => expect(phaseAtTick(CONFIG, i * qt).id).toBe(p.id));
  });

  it('gets more volatile towards the end', () => {
    expect(phaseAtTick(CONFIG, TOTAL - 1).volMult).toBeGreaterThan(phaseAtTick(CONFIG, 0).volMult);
  });

  it('flattens to a neutral phase when the flag is off', () => {
    const cfg = cloneConfig();
    cfg.flags.phases = false;
    for (const t of [0, TOTAL / 2, TOTAL - 1]) {
      expect(phaseAtTick(cfg, t).volMult).toBe(1);
    }
  });

  it('schedules every news event inside the quarter that asked for it', () => {
    const events = planNewsEvents(CONFIG, new Rng(4));
    const loud = CONFIG.phases.filter((p) => p.newsEvents);
    expect(events).toHaveLength(loud.reduce((n, p) => n + (p.newsEvents ?? 0), 0));
    for (const e of events) {
      const phase = loud.find((p) => {
        const from = (p.fromSec * 1000) / CONFIG.match.tickMs;
        const to = (p.toSec * 1000) / CONFIG.match.tickMs;
        return e.tick >= from && e.tick < to;
      });
      expect(phase).toBeDefined();
      expect(e.stockIdx).toBeGreaterThanOrEqual(0);
      expect(e.stockIdx).toBeLessThan(CONFIG.stocks.length);
    }
  });
});

describe('prices', () => {
  it('never leaves the clamp, however the match goes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = runToEnd(
        createMatch(seed, CONFIG, {
          traders: [
            { name: 'A', kind: 'bot', preset: 'hard' },
            { name: 'B', kind: 'bot', preset: 'random' },
          ],
        }),
      );
      s.stocks.forEach((stock, i) => {
        const base = CONFIG.stocks[i].basePrice;
        for (const p of stock.history) {
          expect(p).toBeGreaterThanOrEqual(base * 0.2 - 1e-9);
          expect(p).toBeLessThanOrEqual(base * 4 + 1e-9);
        }
      });
    }
  });

  it('records one price per tick plus the opening one', () => {
    const s = runToEnd(createMatch(8));
    for (const stock of s.stocks) expect(stock.history).toHaveLength(TOTAL + 1);
    expect(s.stocks.map((st) => st.history[0])).toEqual(CONFIG.stocks.map((c) => c.basePrice));
  });
});
