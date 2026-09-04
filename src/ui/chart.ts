import { quarterTicks, segmentAt } from '../sim/market';
import type { MatchState } from '../sim/types';

export interface ChartOpts {
  /** 0..1 progress inside the current tick, used to interpolate the live point */
  progress: number;
  showTruth: boolean;
  humanIdx: number;
  /**
   * Perk overlay: this many ticks of the committed future are drawn ahead of
   * the line, and only for a company the player is actually holding. Zero, and
   * nothing is drawn — which is what everyone without the lens sees.
   */
  peekTicks?: number;
}

const FONT_FAMILY =
  "ui-rounded, 'SF Pro Rounded', 'Segoe UI Variable Display', 'Segoe UI', Roboto, " +
  "'Trebuchet MS', system-ui, sans-serif";
/** Canvas labels carry the same heavy weight the HUD uses. */
const font = (px: number) => `800 ${px}px ${FONT_FAMILY}`;

function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Eased vertical domain, one entry per canvas.
 *
 * The auto-scale fits whatever is on screen and the window slides every frame,
 * so the instant an old extreme scrolls off the left edge the domain snaps and
 * the whole chart lurches under a line that never moved. Playtesters read that
 * as the chart changing too fast. Gliding the drawn domain toward the fitted
 * one turns the lurch into a drift. Kept weakly, so a discarded canvas takes
 * its entry with it.
 */
const axisEase = new WeakMap<
  HTMLCanvasElement,
  { lo: number; hi: number; at: number; tick: number }
>();

/** Glide constant: slow enough to kill the lurch, quick enough to feel attached. */
export const AXIS_TAU_MS = 260;

export interface AxisDomain {
  lo: number;
  hi: number;
}

/**
 * One frame of that glide.
 *
 * `target` is the fitted domain plus its headroom, `fit` the bare range the
 * visible points occupy. Slack is what lags: the result is never allowed to
 * narrow past `fit`, so widening lands on the same frame it is needed and a
 * spike is never clipped — only the shrink back down is slowed. A frame longer
 * than 250 ms (a backgrounded tab, a stalled main thread) is capped, or the
 * first frame after the stall would jump the whole way and undo the point. A
 * frame time that is not a number at all holds the axis still: letting NaN
 * through would poison the domain and blank the chart for the rest of the match.
 */
export function easeAxis(
  prev: AxisDomain,
  target: AxisDomain,
  fit: AxisDomain,
  dtMs: number,
): AxisDomain {
  const ms = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), 250) : 0;
  const k = 1 - Math.exp(-ms / AXIS_TAU_MS);
  return {
    lo: Math.min(prev.lo + (target.lo - prev.lo) * k, fit.lo),
    hi: Math.max(prev.hi + (target.hi - prev.hi) * k, fit.hi),
  };
}

function niceStep(span: number): number {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

/** Live price chart: two normalised lines, break-even markers, optional truth overlay. */
export function drawChart(canvas: HTMLCanvasElement, state: MatchState, opts: ChartOpts): void {
  const ctx = fit(canvas);
  if (!ctx) return;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const cfg = state.cfg;
  const percent = cfg.chart.mode === 'percent';

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a3670';
  ctx.fillRect(0, 0, W, H);

  const padL = 8;
  const padR = 58;
  const padT = 10;
  const padB = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const win = cfg.chart.windowTicks;
  const peek = Math.max(0, opts.peekTicks ?? 0);
  const ahead = opts.showTruth ? Math.round(win * 0.35) : peek;
  const liveX = state.tick - 1 + opts.progress;
  const xMax = Math.max(win, liveX) + ahead;
  const xMin = xMax - win - ahead;
  const px = (t: number) => padL + ((t - xMin) / (xMax - xMin)) * plotW;

  const val = (stockIdx: number, price: number) =>
    percent ? (price / cfg.stocks[stockIdx].basePrice - 1) * 100 : price;

  // --- y domain: fixed by default, so the chart keeps its scale while a trend runs
  let lo: number;
  let hi: number;
  if (cfg.chart.autoScale) {
    lo = Infinity;
    hi = -Infinity;
    state.stocks.forEach((st, i) => {
      const from = Math.max(0, Math.floor(xMin));
      for (let t = from; t < st.history.length; t++) {
        const v = val(i, st.history[t]);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const entry = state.traders[opts.humanIdx].avgEntry[i];
      if (state.traders[opts.humanIdx].positions[i] !== 0 && entry > 0) {
        const v = val(i, entry);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    });
    if (!isFinite(lo) || !isFinite(hi)) {
      lo = percent ? -5 : 0;
      hi = percent ? 5 : 100;
    }
    // what is actually on screen, before any headroom: the glide below may
    // never narrow past this, or it would hide a point the player can see
    const fitLo = lo;
    const fitHi = hi;
    const minSpan = percent ? 6 : cfg.stocks[0].basePrice * 0.06;
    if (hi - lo < minSpan) {
      const mid = (hi + lo) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const now = performance.now();
    const prev = axisEase.get(canvas);
    // A fresh match rewinds the tick. Snap then, rather than gliding down from
    // whatever scale the previous match happened to end on.
    if (prev && state.tick >= prev.tick) {
      const eased = easeAxis(prev, { lo, hi }, { lo: fitLo, hi: fitHi }, now - prev.at);
      lo = eased.lo;
      hi = eased.hi;
    }
    axisEase.set(canvas, { lo, hi, at: now, tick: state.tick });
  } else {
    [lo, hi] = percent ? cfg.chart.percentRange : cfg.chart.absoluteRange;
    if (hi - lo < 1) hi = lo + 1;
  }

  const py = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  // --- grid
  const step = niceStep(hi - lo);
  ctx.lineWidth = 1;
  ctx.font = font(9);
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = py(v);
    const zero = percent && Math.abs(v) < step * 0.01;
    ctx.strokeStyle = zero ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.11)';
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR + 4, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.textAlign = 'left';
    const labelY = Math.max(padT + 5, y - 6);
    ctx.fillText(percent ? `${v > 0 ? '+' : ''}${v.toFixed(0)}%` : v.toFixed(0), padL + 2, labelY);
  }

  // everything below is clipped to the plot box: with a fixed scale, a line that
  // runs off the top must be cut, not allowed to paint over the panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  // --- quarter rules: the match is a business year, and several companies do
  // something at a close, so the boxes have to be on the chart and not just in
  // the player's head. Dashed and dim — they are a frame, not data.
  const qt = quarterTicks(cfg);
  ctx.textBaseline = 'top';
  ctx.font = font(9);
  for (let q = 0; q <= cfg.match.quarters; q++) {
    const t = q * qt;
    if (t < xMin || t > xMax) continue;
    const x = px(t);
    if (q > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (q < cfg.match.quarters) {
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.textAlign = 'left';
      ctx.fillText(`Q${q + 1}`, x + 4, padT + 2);
    }
  }
  ctx.textBaseline = 'middle';

  // --- truth overlay: the future the market has already committed to
  if (opts.showTruth) {
    const bandH = plotH / state.stocks.length;
    state.stocks.forEach((st, i) => {
      for (const seg of st.segments) {
        if (seg.end < state.tick || seg.start > xMax) continue;
        if (seg.strength === 0) continue;
        const x0 = px(Math.max(seg.start, state.tick));
        const x1 = px(Math.min(seg.end, xMax));
        if (x1 <= x0) continue;
        const y0 = padT + i * bandH;
        ctx.fillStyle = seg.dir > 0 ? 'rgba(67,224,106,0.16)' : 'rgba(255,91,91,0.16)';
        ctx.fillRect(x0, y0, x1 - x0, bandH);
        ctx.strokeStyle = cfg.stocks[i].color;
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(x0, y0, x1 - x0, bandH);
        ctx.globalAlpha = 1;
        ctx.fillStyle = cfg.stocks[i].color;
        ctx.textAlign = 'left';
        ctx.fillText(
          `${seg.dir > 0 ? 'UP' : 'DN'} ${seg.strength}${seg.isNews ? ' NEWS' : ''}`,
          x0 + 3,
          y0 + 9,
        );
      }
    });
  }

  // --- break-even lines for open positions
  const me = state.traders[opts.humanIdx];
  state.stocks.forEach((_, i) => {
    if (me.positions[i] === 0 || me.avgEntry[i] <= 0) return;
    const y = py(val(i, me.avgEntry[i]));
    ctx.strokeStyle = cfg.stocks[i].color;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  // --- price lines
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const heads: { x: number; y: number; value: number; price: number; offScale: boolean }[] = [];
  state.stocks.forEach((st, i) => {
    const from = Math.max(0, Math.floor(xMin));
    const last = st.history.length - 1;
    ctx.beginPath();
    let started = false;
    for (let t = from; t < last; t++) {
      const x = px(t);
      const y = py(val(i, st.history[t]));
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    // live point, interpolated inside the tick
    const prev = st.history[Math.max(0, last - 1)];
    const cur = st.history[last];
    const liveVal = val(i, prev + (cur - prev) * opts.progress);
    const lx = px(Math.max(0, last - 1 + opts.progress));
    const ly = py(liveVal);
    if (started) ctx.lineTo(lx, ly);
    ctx.strokeStyle = cfg.stocks[i].color;
    ctx.lineWidth = 3;
    ctx.stroke();
    heads.push({
      x: lx,
      y: ly,
      value: liveVal,
      price: cur,
      offScale: liveVal < lo || liveVal > hi,
    });
  });

  // --- the peeked future: the drift the market has already committed to for a
  // company the player is holding, walked forward without its noise. It is the
  // expected path rather than the printed one — nobody is promised the exact
  // tick — but the direction and the weight of it are real.
  if (peek > 0) {
    const phase = cfg.flags.phases
      ? (cfg.phases.find((ph) => {
          const sec = (state.tick * cfg.match.tickMs) / 1000;
          return sec >= ph.fromSec && sec < ph.toSec;
        })?.volMult ?? 1)
      : 1;
    state.stocks.forEach((st, i) => {
      if (state.traders[opts.humanIdx].positions[i] === 0) return;
      const last = st.history.length - 1;
      let price = st.history[last];
      ctx.beginPath();
      ctx.moveTo(px(last), py(val(i, price)));
      for (let k = 1; k <= peek; k++) {
        const seg = segmentAt(st.segments, state.tick + k);
        const drift =
          (seg?.dir ?? 0) * (seg?.strength ?? 0) * cfg.stocks[i].driftPerStrength * phase;
        price = seg?.frozen ? price : price * (1 + drift);
        ctx.lineTo(px(last + k), py(val(i, price)));
      }
      ctx.strokeStyle = cfg.stocks[i].color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }

  ctx.restore();

  // --- head dot and price chip, drawn outside the clip so they stay readable
  // even when the line itself has run off the fixed scale
  state.stocks.forEach((_, i) => {
    const head = heads[i];
    const color = cfg.stocks[i].color;
    const dotY = Math.max(padT + 4, Math.min(padT + plotH - 4, head.y));
    ctx.fillStyle = color;
    ctx.beginPath();
    if (head.offScale) {
      // a flat wedge pinned to the edge: the price is there, just past the frame
      const up = head.value > hi;
      ctx.moveTo(head.x - 6, dotY + (up ? 4 : -4));
      ctx.lineTo(head.x + 6, dotY + (up ? 4 : -4));
      ctx.lineTo(head.x, dotY + (up ? -3 : 3));
      ctx.closePath();
    } else {
      ctx.arc(head.x, dotY, 4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = '#06203f';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const label = percent
      ? `${head.value >= 0 ? '+' : ''}${head.value.toFixed(1)}%`
      : Math.round(head.price).toString();
    const chipY = Math.max(padT + 9, Math.min(padT + plotH - 9, head.y));
    ctx.fillStyle = 'rgba(6,26,54,0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const chipX = W - padR + 4;
    roundRect(ctx, chipX, chipY - 9, padR - 8, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = font(11);
    ctx.textAlign = 'center';
    ctx.fillText(label, chipX + (padR - 8) / 2, chipY + 1);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Post-match net worth curves for both traders. */
export function drawNetWorthChart(canvas: HTMLCanvasElement, state: MatchState): void {
  const ctx = fit(canvas);
  if (!ctx) return;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a3670';
  ctx.fillRect(0, 0, W, H);

  const series = state.traders.map((t) => t.netWorthHistory);
  const all = series.flat();
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 100) {
    hi += 50;
    lo -= 50;
  }
  const padX = 8;
  const padY = 10;
  const n = Math.max(...series.map((s) => s.length), 2);
  const px = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const py = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);

  const start = state.cfg.match.startingCash;
  if (start >= lo && start <= hi) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padX, py(start));
    ctx.lineTo(W - padX, py(start));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Deliberately outside the company palette: these are people, not assets. An
  // earlier version used a cyan and an amber, and the two lines read as the
  // NOVA and TET price lines with URANUS mysteriously missing.
  const colors = ['#ffffff', '#8fa3be'];
  series.forEach((s, i) => {
    ctx.beginPath();
    s.forEach((v, idx) => (idx ? ctx.lineTo(px(idx), py(v)) : ctx.moveTo(px(idx), py(v))));
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = i === 0 ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  });

  // caption plus swatch legend, so the chart cannot be mistaken for prices
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const rows = state.traders.map((t) => `${t.name} ${fmt(t.netWorth)}`);
  ctx.font = font(10);
  let boxW = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 16;
  ctx.font = font(9);
  boxW = Math.max(boxW, ctx.measureText('NET WORTH').width);

  // backdrop: a net worth curve will otherwise run straight through the labels
  ctx.fillStyle = 'rgba(6,26,54,0.78)';
  roundRect(ctx, 6, 3, boxW + 26, 17 + rows.length * 13, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('NET WORTH', 12, 6);
  rows.forEach((row, i) => {
    const y = 19 + i * 13;
    ctx.fillStyle = colors[i];
    ctx.fillRect(12, y + 4, 11, 3);
    ctx.font = font(10);
    ctx.fillText(row, 28, y);
  });
}

/** Same thousands separator the HUD uses, without pulling React in here. */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US').replace(/,/g, '\u00a0');
}
