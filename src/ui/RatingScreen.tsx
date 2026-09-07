import React, { useEffect, useState } from 'react';
import { Lock, Coin } from './components';
import { boardConfigured, fetchBoard, myId, type Board, type BoardRow } from './api';
import { t } from './i18n';

/**
 * The leaderboard the Worker keeps (see worker/).
 *
 * It ranks coins EARNED rather than coins held, so spending them in the shop
 * cannot cost anybody their place, and it is read-only here: the client never
 * says what it scored, only what happened, and the server does the arithmetic.
 *
 * This used to be a tab inside the archive, which put the one part of the game
 * other people are in two taps behind a shelf of companies. It is a screen of
 * its own off the main menu now.
 */

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

function RatingLine({ row }: { row: BoardRow }) {
  return (
    <div className={`rating-line${row.you ? ' you' : ''}`}>
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
 * Every way this can fail says so in a sentence rather than spinning: a build
 * with no server behind it, a server that will not answer, and a board nobody
 * has opened an account on yet all look different.
 */
function Standings() {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    if (!boardConfigured()) {
      setState('offline');
      return;
    }
    let alive = true;
    fetchBoard(25).then((b) => {
      if (!alive) return;
      setBoard(b);
      setState(b ? 'ready' : 'offline');
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const rows = board?.top ?? [];
  if (!rows.length) return <Notice line={t('rating.empty')} />;

  // the caller's own row, appended when they placed outside the slice above
  const mine = board?.me ?? null;

  return (
    <div className="rating-board">
      <div className="rating-head">
        <span>{t('rating.header')}</span>
        {!myId() && <em>{t('rating.onlyInTelegram')}</em>}
      </div>
      <div className="rating-rows">
        {rows.map((r) => (
          <RatingLine key={r.id} row={r} />
        ))}
        {mine && (
          <>
            <div className="rating-gap">···</div>
            <RatingLine key={mine.id} row={mine} />
          </>
        )}
      </div>
    </div>
  );
}

export default function RatingScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="arch-count">{t('rating.title')}</div>
      </header>

      <Standings />
    </div>
  );
}
