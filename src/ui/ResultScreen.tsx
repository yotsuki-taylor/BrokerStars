import React, { useEffect, useRef } from 'react';
import { drawNetWorthChart } from './chart';
import { Star, money, signed } from './components';
import type { MatchState } from '../sim/types';
import { t as tt } from './i18n';
import { REWARDS, type Award } from './progress';

export default function ResultScreen({
  state,
  humanIdx,
  award,
  leagueName,
  unlockedName,
  onRestart,
  onMenu,
}: {
  state: MatchState;
  humanIdx: number;
  award: Award | null;
  /** the league this match was played in — it decides what the payout was worth */
  leagueName: string;
  /** the league this win just opened, if it opened one */
  unlockedName: string | null;
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
  const title =
    state.resigned === humanIdx
      ? tt('result.surrendered')
      : me.bankrupt
        ? tt('result.bankrupt')
        : state.winner === null
          ? tt('result.draw')
          : state.winner === humanIdx
            ? tt('result.win')
            : tt('result.lose');
  const gapPct =
    Math.abs(me.netWorth - rival.netWorth) / Math.max(1, Math.max(me.netWorth, rival.netWorth));

  const tradeLabel = (t?: (typeof closed)[number]) =>
    t ? `${state.cfg.stocks[t.stock].name.split(' ')[0]} ${signed(t.realized)}` : tt('common.none');

  return (
    <div className="overlay">
      <h2>{title}</h2>
      <div className="sub">
        {tt('result.gap', {
          league: leagueName,
          mine: money(me.netWorth),
          theirs: money(rival.netWorth),
          gap: (gapPct * 100).toFixed(1),
        })}
      </div>

      {award && (
        <div className={`payout${award.total ? '' : ' empty'}`}>
          <Star size={22} />
          <b>+{award.total}</b>
          <span>
            {award.win > 0 ? tt('result.winPay', { n: award.win }) : tt('result.noWin')}
            {award.profit > 0
              ? `  ·  ${tt('result.gainPay', { n: Math.round(REWARDS.profitBar * 100), stars: award.profit })}`
              : ''}
          </span>
        </div>
      )}

      {unlockedName && <div className="unlocked">{tt('result.unlocked', { name: unlockedName })}</div>}

      <canvas ref={ref} className="result-chart" />

      <div className="result-grid">
        <div className="stat">
          <div className="k">{tt('result.yourResult')}</div>
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
          <div className="k">{tt('result.bestTrade')}</div>
          <div className="v" style={{ color: best ? 'var(--up)' : 'var(--neutral)' }}>
            {tradeLabel(best)}
          </div>
        </div>
        <div className="stat">
          <div className="k">{tt('result.worstTrade')}</div>
          <div className="v" style={{ color: worst ? 'var(--down)' : 'var(--neutral)' }}>
            {tradeLabel(worst)}
          </div>
        </div>
        <div className="stat">
          <div className="k">{tt('result.trades')}</div>
          <div className="v">{me.trades.length}</div>
        </div>
        <div className="stat">
          <div className="k">{tt('result.closedInProfit')}</div>
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
          {tt('common.menu')}
        </button>
        <button className="big-btn" onClick={onRestart}>
          {tt('result.playAgain')}
        </button>
      </div>
    </div>
  );
}
