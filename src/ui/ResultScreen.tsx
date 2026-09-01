import React, { useEffect, useRef } from 'react';
import { drawNetWorthChart } from './chart';
import { Star, money, signed } from './components';
import type { MatchState } from '../sim/types';
import { REWARDS, type Award } from './progress';

export default function ResultScreen({
  state,
  humanIdx,
  award,
  onRestart,
  onMenu,
}: {
  state: MatchState;
  humanIdx: number;
  award: Award | null;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawNetWorthChart(ref.current, state);
  }, [state]);

  const me = state.traders[humanIdx];
  const rival = state.traders[1 - humanIdx];
  const start = state.cfg.match.startingCash;
  const closed = me.trades.filter((t) => t.realized !== 0);
  const best = closed.reduce((a, b) => (b.realized > (a?.realized ?? -Infinity) ? b : a), closed[0]);
  const worst =
    closed.length > 1
      ? closed.reduce((a, b) => (b.realized < (a?.realized ?? Infinity) ? b : a), closed[0])
      : undefined;
  const winRate = closed.length
    ? (100 * closed.filter((t) => t.realized > 0).length) / closed.length
    : 0;
  const title = state.resigned === humanIdx
    ? 'SURRENDERED'
    : me.bankrupt
    ? 'BANKRUPT'
    : state.winner === null
      ? 'DRAW'
      : state.winner === humanIdx
        ? 'YOU WIN'
        : 'YOU LOSE';
  const gapPct =
    Math.abs(me.netWorth - rival.netWorth) / Math.max(1, Math.max(me.netWorth, rival.netWorth));

  const tradeLabel = (t?: (typeof closed)[number]) =>
    t ? `${state.cfg.stocks[t.stock].name.split(' ')[0]} ${signed(t.realized)}` : 'NONE';

  return (
    <div className="overlay">
      <h2>{title}</h2>
      <div className="sub">
        {money(me.netWorth)} vs {money(rival.netWorth)} · gap {(gapPct * 100).toFixed(1)}%
      </div>

      {award && (
        <div className={`payout${award.total ? '' : ' empty'}`}>
          <Star size={22} />
          <b>+{award.total}</b>
          <span>
            {award.win > 0 ? `WIN +${award.win}` : 'NO WIN'}
            {award.profit > 0
              ? `  ·  +${Math.round(REWARDS.profitBar * 100)}% GAIN +${award.profit}`
              : ''}
          </span>
        </div>
      )}

      <canvas ref={ref} className="result-chart" />

      <div className="result-grid">
        <div className="stat">
          <div className="k">YOUR RESULT</div>
          <div className="v">
            {money(me.netWorth)}{' '}
            <span className={me.netWorth >= start ? 'delta up' : 'delta down'}>
              {signed(((me.netWorth - start) / start) * 100, 1)}%
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="k">{rival.name.toUpperCase()}</div>
          <div className="v">
            {money(rival.netWorth)}{' '}
            <span className={rival.netWorth >= start ? 'delta up' : 'delta down'}>
              {signed(((rival.netWorth - start) / start) * 100, 1)}%
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="k">BEST TRADE</div>
          <div className="v" style={{ color: best ? 'var(--up)' : 'var(--neutral)' }}>
            {tradeLabel(best)}
          </div>
        </div>
        <div className="stat">
          <div className="k">WORST TRADE</div>
          <div className="v" style={{ color: worst ? 'var(--down)' : 'var(--neutral)' }}>
            {tradeLabel(worst)}
          </div>
        </div>
        <div className="stat">
          <div className="k">TRADES</div>
          <div className="v">{me.trades.length}</div>
        </div>
        <div className="stat">
          <div className="k">CLOSED IN PROFIT</div>
          <div
            className="v"
            style={{
              color: !closed.length ? 'var(--neutral)' : winRate >= 50 ? 'var(--up)' : 'var(--down)',
            }}
          >
            {closed.length ? `${winRate.toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      <div className="result-actions">
        <button className="big-btn ghost" onClick={onMenu}>
          MENU
        </button>
        <button className="big-btn" onClick={onRestart}>
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
