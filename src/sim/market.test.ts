import { describe, expect, it } from 'vitest';
import { CONFIG, cloneConfig } from './config';
import { buildSchedule, phaseAtTick, planNewsEvents, segmentAt, totalTicks } from './market';
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

describe('phases', () => {
  it('walks through the three phases in order', () => {
    expect(phaseAtTick(CONFIG, 0).id).toBe('open');
    expect(phaseAtTick(CONFIG, TOTAL / 2).id).toBe('news');
    expect(phaseAtTick(CONFIG, TOTAL - 1).id).toBe('close');
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

  it('schedules the news events inside the news phase', () => {
    const events = planNewsEvents(CONFIG, new Rng(4));
    const phase = CONFIG.phases.find((p) => p.newsEvents)!;
    const from = (phase.fromSec * 1000) / CONFIG.match.tickMs;
    const to = (phase.toSec * 1000) / CONFIG.match.tickMs;
    expect(events).toHaveLength(phase.newsEvents!);
    for (const e of events) {
      expect(e.tick).toBeGreaterThanOrEqual(from);
      expect(e.tick).toBeLessThan(to);
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
