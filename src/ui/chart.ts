import type { MatchState } from '../sim/types';

export interface ChartOpts {
  /** 0..1 progress inside the current tick, used to interpolate the live point */
  progress: number;
  showTruth: boolean;
  humanIdx: number;
}

const FONT = "'BD Cartoon Shout', 'Trebuchet MS', sans-serif";

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
  const ahead = opts.showTruth ? Math.round(win * 0.35) : 0;
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
    const minSpan = percent ? 6 : cfg.stocks[0].basePrice * 0.06;
    if (hi - lo < minSpan) {
      const mid = (hi + lo) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  } else {
    [lo, hi] = percent ? cfg.chart.percentRange : cfg.chart.absoluteRange;
    if (hi - lo < 1) hi = lo + 1;
  }

  const py = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  // --- grid
  const step = niceStep(hi - lo);
  ctx.lineWidth = 1;
  ctx.font = `9px ${FONT}`;
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

  // --- news markers
  for (const n of state.news) {
    if (n.tick < xMin || n.tick > xMax) continue;
    const x = px(n.tick);
    ctx.strokeStyle = 'rgba(255,214,64,0.55)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
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
    ctx.font = `11px ${FONT}`;
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

  const colors = ['#7fd7ff', '#ffd166'];
  series.forEach((s, i) => {
    ctx.beginPath();
    s.forEach((v, idx) => (idx ? ctx.lineTo(px(idx), py(v)) : ctx.moveTo(px(idx), py(v))));
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  });

  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  state.traders.forEach((t, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillText(t.name, 10, 8 + i * 13);
  });
}
