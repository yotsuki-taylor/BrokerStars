import React, { useEffect, useState } from 'react';
import { Lock, Coin, Dollar, money } from './components';
import {
  boardConfigured,
  fetchBoard,
  fetchWorthBoard,
  myId,
  type Board,
  type BoardRow,
  type WorthBoard,
  type WorthRow,
} from './api';
import { t } from './i18n';

/**
 * The leaderboards the Worker keeps (see worker/), under two tabs.
 *
 * COINS ranks coins EARNED rather than coins held, so spending them in the shop
 * cannot cost anybody their place. It only ever goes up: it is a record of what
 * somebody earned playing matches.
 *
 * DOLLARS ranks the share counter — cash plus what the shares are worth today,
 * not the dollar balance. Ranking the balance would rank people for refusing to
 * buy anything, which is a strange thing for a stock market to reward
 * (`worker/src/board.ts` says it at more length). Unlike the coin board this one
 * is alive: a place can be lost overnight to a company that fell. The two are
 * worth having side by side precisely because they reward opposite habits —
 * one is what you earned, the other is what you are holding.
 *
 * Both are read-only here: the client never says what it scored, only what
 * happened, and the server does the arithmetic.
 *
 * This used to be a tab inside the archive, which put the one part of the game
 * other people are in two taps behind a shelf of companies. It is a screen of
 * its own off the main menu now.
 */

type Tab = 'coins' | 'dollars';

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'coins', label: () => t('rating.tabCoins') },
  { id: 'dollars', label: () => t('rating.tabDollars') },
];

/** Nothing to show, and which nothing it is. Never a spinner that never stops. */
function Notice({ line }: { line: string }) {
  return (
    <div className="arch-soon">
      <Lock size={30} />
      <b>{t('rating.title')}</b>
      <p>{line}</p>
    </div>
  );
}

/**
 * Load one board, saying which way it failed rather than spinning: a build with
 * no server behind it, a server that will not answer, and a board nobody has
 * opened an account on yet all look different.
 *
 * Fetched once on mount and never again. That is not a shortcut — the two tabs
 * are separate components rendered one at a time, so switching tabs unmounts
 * one and mounts the other, and mounting IS the moment to ask. It also means
 * coming back to a tab re-reads it, which is what somebody tapping back and
 * forth between two live tables would expect.
 *
 * `load` is deliberately not a dependency: it is a fresh closure on every
 * render, and listing it would refetch on every render for ever.
 */
function useBoard<T>(load: () => Promise<T | null>) {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [board, setBoard] = useState<T | null>(null);

  useEffect(() => {
    if (!boardConfigured()) {
      setState('offline');
      return;
    }
    let alive = true;
    load().then((b) => {
      if (!alive) return;
      setBoard(b);
      setState(b ? 'ready' : 'offline');
    });
    return () => {
      alive = false;
    };
  }, []);

  return { state, board };
}

/**
 * The frame both tables share: a heading, the rows, and the caller's own row
 * under a gap when they placed outside the slice.
 *
 * Generic in the row rather than taking some common supertype of the two, so
 * each tab's line component keeps its own real type and nothing is cast.
 */
function Table<T>({
  state,
  head,
  rows,
  mine,
  render,
}: {
  state: 'loading' | 'ready' | 'offline';
  head: string;
  rows: T[];
  mine: T | null;
  render: (row: T) => React.ReactNode;
}) {
  if (state === 'loading') {
    return (
      <div className="arch-soon">
        <p>{t('rating.loading')}</p>
      </div>
    );
  }
  if (state === 'offline') {
    return <Notice line={boardConfigured() ? t('rating.offline') : t('rating.noServer')} />;
  }
  if (!rows.length) return <Notice line={t('rating.empty')} />;

  return (
    <div className="rating-board">
      <div className="rating-head">
        <span>{head}</span>
        {!myId() && <em>{t('rating.onlyInTelegram')}</em>}
      </div>
      <div className="rating-rows">
        {rows.map((r) => render(r))}
        {mine && (
          <>
            <div className="rating-gap">···</div>
            {render(mine)}
          </>
        )}
      </div>
    </div>
  );
}

function CoinLine({ row }: { row: BoardRow }) {
  return (
    <div className={`rating-line${row.you ? ' you' : ''}`} key={row.id}>
      <span className="rating-rank">{row.rank}</span>
      <span className="rating-who">{row.name}</span>
      <span className="rating-matches">
        {row.matches} {t('rating.matches')}
      </span>
      <span className="rating-coins">
        <Coin size={12} /> {row.coins}
      </span>
    </div>
  );
}

/**
 * A dollar row says what the total is MADE OF as well as what it is, because
 * the two numbers are the whole story of how somebody got there: all cash is a
 * player who has not bought anything yet, all shares is one who is fully in.
 */
function WorthLine({ row }: { row: WorthRow }) {
  return (
    <div className={`rating-line${row.you ? ' you' : ''}`} key={row.id}>
      <span className="rating-rank">{row.rank}</span>
      <span className="rating-who">{row.name}</span>
      <span className="rating-matches">
        {row.shares > 0
          ? t('rating.inShares', { n: money(row.shares) })
          : t('rating.allCash')}
      </span>
      <span className="rating-coins">
        <Dollar size={12} /> {money(row.worth)}
      </span>
    </div>
  );
}

function Coins() {
  const { state, board } = useBoard<Board>(() => fetchBoard(25));
  return (
    <Table
      state={state}
      head={t('rating.header')}
      rows={board?.top ?? []}
      mine={board?.me ?? null}
      render={(r: BoardRow) => <CoinLine key={r.id} row={r} />}
    />
  );
}

function Dollars() {
  const { state, board } = useBoard<WorthBoard>(() => fetchWorthBoard(25));
  return (
    <Table
      state={state}
      head={t('rating.headerDollars')}
      rows={board?.top ?? []}
      mine={board?.me ?? null}
      render={(r: WorthRow) => <WorthLine key={r.id} row={r} />}
    />
  );
}

export default function RatingScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('coins');

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="arch-count">{t('rating.title')}</div>
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

      {/* One at a time, so each tab's mount is its own fetch — see `useBoard`. */}
      {tab === 'coins' ? <Coins /> : <Dollars />}
    </div>
  );
}
