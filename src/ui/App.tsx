import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG, cloneConfig, type Config } from '../sim/config';
import { createMatch, step } from '../sim/match';
import { hashSeed } from '../sim/rng';
import { applyAction, isShortSide, plannedQty } from '../sim/trading';
import type { MatchState } from '../sim/types';
import { drawChart } from './chart';
import {
  SizeSelector,
  StockRow,
  TraderCard,
  money,
  signed,
  tex,
  type FloatPnl,
} from './components';
import DevPanel from './DevPanel';
import ResultScreen from './ResultScreen';

const HUMAN = 0;
const PORTRAITS = ['player1.png', 'player2.png'];

function haptic(kind: 'light' | 'heavy' = 'light') {
  const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
  if (tg?.impactOccurred) tg.impactOccurred(kind === 'heavy' ? 'medium' : 'light');
  else navigator.vibrate?.(kind === 'heavy' ? 25 : 10);
}

function makeMatch(cfg: Config, seed: string, preset: string): MatchState {
  return createMatch(hashSeed(seed), cfg, {
    traders: [
      { name: 'YOU', kind: 'human', preset: 'easy' },
      { name: 'RIVAL', kind: 'bot', preset },
    ],
  });
}

export default function App() {
  const baseCfg = useRef<Config>(cloneConfig(CONFIG));
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1e6)));
  // easy by default: medium trades ~80 times a match, faster than a human can tap
  const [botPreset, setBotPreset] = useState('easy');
  const stateRef = useRef<MatchState>(makeMatch(baseCfg.current, seed, botPreset));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);

  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const [speed, setSpeed] = useState(1);
  const [showTruth, setShowTruth] = useState(false);
  const [fraction, setFraction] = useState(0.25);
  const [devOpen, setDevOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [floats, setFloats] = useState<Record<number, FloatPnl[]>>({});
  const [newsFlash, setNewsFlash] = useState<string | null>(null);

  // latest UI values for the animation loop, which is created only once
  const ui = useRef({ speed, showTruth, paused: false });
  ui.current.speed = speed;
  ui.current.showTruth = showTruth;
  ui.current.paused = devOpen || helpOpen;

  /* ------------------------------------------------- simulation + render loop */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let renderedTick = -1;
    let renderedNews = 0;

    const loop = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      const st = stateRef.current;

      if (!st.finished && !ui.current.paused) {
        acc += dt * ui.current.speed;
        const tickMs = st.cfg.match.tickMs;
        while (acc >= tickMs && !st.finished) {
          step(st);
          acc -= tickMs;
        }
        progressRef.current = st.finished ? 1 : acc / tickMs;
      }

      if (canvasRef.current) {
        drawChart(canvasRef.current, st, {
          progress: progressRef.current,
          showTruth: ui.current.showTruth,
          humanIdx: HUMAN,
        });
      }

      if (st.news.length !== renderedNews) {
        renderedNews = st.news.length;
        const n = st.news[st.news.length - 1];
        setNewsFlash(n.text);
        window.setTimeout(() => setNewsFlash(null), 2200);
      }
      if (st.tick !== renderedTick) {
        renderedTick = st.tick;
        setVersion((v) => v + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ----------------------------------------------------------------- dev panel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDevOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const taps = useRef<number[]>([]);
  const cornerTap = () => {
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < 800);
    if (taps.current.length >= 3) {
      taps.current = [];
      setDevOpen(true);
    }
  };

  /* ------------------------------------------------------------------- actions */
  const restart = useCallback(
    (nextSeed?: string, nextPreset?: string) => {
      const s = nextSeed ?? seed;
      const p = nextPreset ?? botPreset;
      if (nextSeed) setSeed(s);
      if (nextPreset) setBotPreset(p);
      stateRef.current = makeMatch(baseCfg.current, s, p);
      progressRef.current = 0;
      setFloats({});
      rerender();
    },
    [seed, botPreset, rerender],
  );

  const floatId = useRef(1);
  const act = (stockIdx: number, side: 'buy' | 'sell') => {
    const st = stateRef.current;
    if (st.finished || st.traders[HUMAN].bankrupt) return;
    const trade = applyAction(st, { trader: HUMAN, stock: stockIdx, side, fraction });
    if (!trade) return;
    haptic(Math.abs(trade.realized) > 1 ? 'heavy' : 'light');
    const id = floatId.current++;
    const text =
      trade.realized !== 0
        ? `${signed(trade.realized)}`
        : `${trade.qty > 0 ? '+' : '-'}${Math.abs(trade.qty)} SH`;
    const item: FloatPnl = { id, text, good: trade.realized !== 0 ? trade.realized > 0 : true };
    setFloats((f) => ({ ...f, [stockIdx]: [...(f[stockIdx] ?? []), item] }));
    window.setTimeout(
      () =>
        setFloats((f) => ({
          ...f,
          [stockIdx]: (f[stockIdx] ?? []).filter((x) => x.id !== id),
        })),
      900,
    );
    rerender();
  };

  const patch = (fn: (c: Config) => void) => {
    fn(stateRef.current.cfg);
    fn(baseCfg.current);
    rerender();
  };

  // dev-only console handle: window.bs.step(60), window.bs.state(), window.bs.restart()
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).bs = {
      state: () => stateRef.current,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) step(stateRef.current);
        rerender();
        return stateRef.current.tick;
      },
      restart,
    };
  }, [restart, rerender]);


  /* --------------------------------------------------------------------- render */
  const st = stateRef.current;
  const cfg = st.cfg;
  const me = st.traders[HUMAN];
  const rival = st.traders[1];
  const remaining = Math.max(0, (st.totalTicks - st.tick) * cfg.match.tickMs) / 1000;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(Math.floor(remaining % 60)).padStart(2, '0');

  return (
    <div className="app">
      <div className="dev-corner" onClick={cornerTap} />

      <header className="hdr">
        <span className="title">BROKER STARS</span>
        <span className="spacer" />
        <button className="icon-btn accent" onClick={() => setHelpOpen(true)} aria-label="help">
          <img src={tex('help.png')} alt="" />
        </button>
        <button className="icon-btn" onClick={() => setDevOpen(true)} aria-label="menu">
          <img src={tex('options.png')} alt="" />
        </button>
      </header>

      <div className="chart-card">
        <div className="chart-wrap">
          <canvas ref={canvasRef} />
          {newsFlash && <div className="news-flash">{newsFlash}</div>}
        </div>
      </div>

      <div className="mid">
        <TraderCard
          name={me.name}
          portrait={PORTRAITS[0]}
          netWorth={me.netWorth}
          startCash={cfg.match.startingCash}
          bankrupt={me.bankrupt}
          mirrored={false}
        />
        <div className={`timer${remaining <= 15 ? ' urgent' : ''}`}>
          {mm}:{ss}
        </div>
        <TraderCard
          name={rival.name}
          portrait={PORTRAITS[1]}
          netWorth={rival.netWorth}
          startCash={cfg.match.startingCash}
          bankrupt={rival.bankrupt}
          mirrored
        />
      </div>

      <SizeSelector value={fraction} onChange={setFraction} />

      <div className="rows">
        {cfg.stocks.map((s, i) => {
          const price = st.stocks[i].price;
          const short = isShortSide(st, HUMAN, i);
          const buyQty = plannedQty(st, { trader: HUMAN, stock: i, side: 'buy', fraction });
          const sellQty = plannedQty(st, { trader: HUMAN, stock: i, side: 'sell', fraction });
          return (
            <StockRow
              key={s.id}
              stock={s}
              price={price}
              changePct={(price / s.basePrice - 1) * 100}
              position={me.positions[i]}
              shortSide={short}
              canBuy={!st.finished && !me.bankrupt && buyQty > 0}
              canSell={!st.finished && !me.bankrupt && sellQty < 0}
              floats={floats[i] ?? []}
              onBuy={() => act(i, 'buy')}
              onSell={() => act(i, 'sell')}
            />
          );
        })}
      </div>

      {st.finished && (
        <ResultScreen state={st} humanIdx={HUMAN} onRestart={() => restart(String(Math.floor(Math.random() * 1e6)))} />
      )}

      {helpOpen && (
        <div className="overlay">
          <h2>HOW TO PLAY</h2>
          <p>
            120 seconds. You and your rival trade the same two stocks. Whoever ends with the bigger
            net worth — cash plus positions — wins. Positions close automatically at the whistle.
          </p>
          <p>
            The strip under the chart predicts what is about to happen: company icon plus one to
            three arrows. More arrows means a stronger move <b>and</b> a more reliable tip. One arrow
            is close to a coin flip, and unknown companies never trade at all.
          </p>
          <p>
            SIZE sets how much of your buying power one tap commits. BUY goes long. SELL closes a
            long, or opens a short when you hold nothing — you profit when the price falls. Big
            orders move the price against you, so the rival feels every trade you make.
          </p>
          <p>Dashed line on the chart = your average entry. Above it you are in profit.</p>
          <button className="big-btn" onClick={() => setHelpOpen(false)}>
            GOT IT
          </button>
        </div>
      )}

      {devOpen && (
        <DevPanel
          cfg={cfg}
          seed={seed}
          speed={speed}
          showTruth={showTruth}
          botPreset={botPreset}
          onSeed={setSeed}
          onRestart={restart}
          onSpeed={setSpeed}
          onShowTruth={setShowTruth}
          onBotPreset={setBotPreset}
          onPatch={patch}
          onClose={() => setDevOpen(false)}
        />
      )}
    </div>
  );
}
