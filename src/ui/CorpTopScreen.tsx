import React, { useEffect, useState } from 'react';
import { Coin, Dollar, Lock, money } from './components';
import { boardConfigured, fetchCorpTop, type CorpBoard } from './api';
import { t } from './i18n';
import { MAX_MEMBERS, MIN_RANKED, type CorpSummary, type Metric } from '../corp/protocol';

/**
 * The table of corporations, under two tabs, and the two things about it worth
 * knowing before reading a row.
 *
 * IT RANKS THE AVERAGE, NOT THE TOTAL. A corporation of thirty does not beat
 * one of five by being thirty. That is the whole design of the thing — a table
 * of sums is a table of recruiting, and the only strategy in it is to admit
 * everybody — and it is said out loud under the rows rather than left to be
 * worked out, because a player who assumes a sum will spend a month doing the
 * wrong thing.
 *
 * THE DOLLAR TABLE IS EARNED DOLLARS ONLY. Dollars will be sold for Telegram
 * Stars one day, and a table of dollar balances would be a table of who spent
 * the most real money. What is counted is what the game paid out during the
 * season, at the moment it paid it (`worker/src/corps.ts`), so a purchase can
 * never reach this screen.
 *
 * A season is a calendar month, UTC, and the table empties on the first. The
 * rows are what a corporation has done THIS month, not ever — otherwise the
 * corporations founded first would be unmovable and there would be no reason
 * for a new one to exist.
 */

type Tab = Metric;

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'coins', label: () => t('corp.tabCoins') },
  { id: 'dollars', label: () => t('corp.tabDollars') },
];

function Notice({ line }: { line: string }) {
  return (
    <div className="arch-soon">
      <Lock size={30} />
      <b>{t('corp.topTitle')}</b>
      <p>{line}</p>
    </div>
  );
}

function Line({ row, metric, mine }: { row: CorpSummary; metric: Metric; mine: boolean }) {
  return (
    <div className={`rating-line corp-top-line${mine ? ' you' : ''}`}>
      <span className="rating-rank">{row.rank}</span>
      <span className="corp-tag">{row.tag}</span>
      <span className="rating-who">{row.name}</span>
      <span className="rating-matches">
        {t('corp.membersOf', { n: row.members, max: MAX_MEMBERS })}
      </span>
      <span className="rating-coins">
        {metric === 'coins' ? <Coin size={12} /> : <Dollar size={12} />}{' '}
        {metric === 'coins' ? row.average : money(row.average)}
      </span>
    </div>
  );
}

/**
 * One tab's table.
 *
 * Fetched on mount and never again, exactly like the player boards: the two
 * tabs are separate components rendered one at a time, so switching tabs
 * unmounts one and mounts the other, and mounting IS the moment to ask.
 */
function Table({ metric, mine }: { metric: Metric; mine: string | null }) {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [board, setBoard] = useState<CorpBoard | null>(null);

  useEffect(() => {
    if (!boardConfigured()) {
      setState('offline');
      return;
    }
    let alive = true;
    void fetchCorpTop(metric, mine).then((b) => {
      if (!alive) return;
      setBoard(b);
      setState(b ? 'ready' : 'offline');
    });
    return () => {
      alive = false;
    };
  }, [metric, mine]);

  if (state === 'loading') {
    return (
      <div className="arch-soon">
        <p>{t('corp.loading')}</p>
      </div>
    );
  }
  if (state === 'offline') {
    return <Notice line={boardConfigured() ? t('corp.offline') : t('corp.noServer')} />;
  }
  if (!board?.top.length) return <Notice line={t('corp.topEmpty', { min: MIN_RANKED })} />;

  return (
    <div className="rating-board">
      <div className="rating-head">
        <span>{t(metric === 'coins' ? 'corp.headCoins' : 'corp.headDollars')}</span>
      </div>
      <div className="rating-rows">
        {board.top.map((row) => (
          <Line key={row.id} row={row} metric={metric} mine={row.id === mine} />
        ))}
        {/* Somebody whose corporation placed outside the page still wants to
            know where it stands — the same courtesy the player boards extend,
            and the same gap to mark that it is not the next row down. */}
        {board.me && (
          <>
            <div className="rating-gap">···</div>
            <Line row={board.me} metric={metric} mine />
          </>
        )}
      </div>
      <p className="corp-foot">{t('corp.topWhy', { min: MIN_RANKED })}</p>
    </div>
  );
}

export default function CorpTopScreen({
  mine,
  onBack,
}: {
  /** the caller's own corporation, which only decides which row is lit */
  mine: string | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('coins');

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="arch-count">{t('corp.topTitle')}</div>
      </header>

      <div className="arch-tabs rating-tabs">
        {TABS.map((x) => (
          <button
            key={x.id}
            className={`slot-tab${x.id === tab ? ' on' : ''}`}
            onClick={() => setTab(x.id)}
          >
            {x.label()}
          </button>
        ))}
      </div>

      {/* One at a time, so each tab's mount is its own fetch — see `Table`. */}
      <Table metric={tab} mine={mine} />
    </div>
  );
}
