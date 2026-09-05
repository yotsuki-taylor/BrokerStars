import React, { useEffect, useState } from 'react';
import { COMPANIES, TRAIT_LABEL, type Company } from '../sim/companies';
import { LogoMask, Lock, Star, money } from './components';
import { LEAGUES, leagueName } from './leagues';
import { boardConfigured, fetchBoard, myId, type Board, type BoardRow } from './api';
import { t, tr } from './i18n';

/**
 * The archive: what the player has collected, under three tabs.
 *
 * COMPANIES is everything the game can put on a board, unlocked by playing a
 * match out against it — nothing bought, and nothing spoiled in advance.
 *
 * RATING is the leaderboard the Worker keeps (see worker/). It ranks stars
 * EARNED rather than stars held, so spending them in the shop cannot cost
 * anybody their place, and it is read-only here: the client never says what it
 * scored, only what happened, and the server does the arithmetic.
 *
 * AWARDS is still a shelf with nothing on it. It is here rather than hidden
 * because a strip that grows a tab later moves the ones already on it.
 */

type Tab = 'companies' | 'rating' | 'achievements';

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'companies', label: () => t('archive.tabCompanies') },
  { id: 'rating', label: () => t('archive.tabRating') },
  { id: 'achievements', label: () => t('archive.tabAchievements') },
];

function whereFound(c: Company): string {
  if (c.staple) return t('archive.everyLeague');
  const league = LEAGUES[c.fromLeague];
  return league ? t('archive.andUp', { name: leagueName(league) }) : t('archive.unknown');
}

function CompaniesTab({ seen }: { seen: Set<string> }) {
  const first = COMPANIES.find((c) => seen.has(c.id));
  const [pickedId, setPickedId] = useState<string | null>(first?.id ?? null);
  const picked = COMPANIES.find((c) => c.id === pickedId && seen.has(c.id)) ?? null;

  return (
    <>
      <div className="arch-detail">
        {picked ? (
          <>
            <LogoMask file={picked.logo} color={picked.color} className="arch-big" />
            <div className="arch-text">
              <div className="arch-name" style={{ color: picked.color }}>
                {picked.name}
              </div>
              <div className="arch-chips">
                <span className="arch-chip" style={{ borderColor: picked.color }}>
                  {tr(`trait.${picked.trait.kind}.label`, TRAIT_LABEL[picked.trait.kind])}
                </span>
                <span className="arch-chip">
                  {t('archive.listsAt', { price: money(picked.basePrice) })}
                </span>
              </div>
              <p className="arch-blurb">{tr(`company.${picked.id}.tagline`, picked.tagline)}</p>
              <div className="arch-where">{whereFound(picked)}</div>
            </div>
          </>
        ) : (
          <p className="arch-empty">{t('archive.empty')}</p>
        )}
      </div>

      <div className="arch-grid">
        {COMPANIES.map((c) => {
          const found = seen.has(c.id);
          return (
            <button
              key={c.id}
              className={`arch-card${found ? '' : ' locked'}${
                c.id === pickedId && found ? ' picked' : ''
              }`}
              style={found ? { borderColor: c.color } : undefined}
              disabled={!found}
              onClick={() => setPickedId(c.id)}
            >
              {found ? (
                <>
                  <LogoMask file={c.logo} color={c.color} className="arch-thumb" />
                  <span className="arch-tag">{c.name}</span>
                </>
              ) : (
                <>
                  <i className="arch-thumb hidden">
                    <Lock size={22} />
                  </i>
                  <span className="arch-tag">???</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** A tab with its shelf built and nothing on it yet. Says so, rather than opening empty. */
function SoonTab({ title, line }: { title: string; line: string }) {
  return (
    <div className="arch-soon">
      <Lock size={30} />
      <b>{title}</b>
      <p>{line}</p>
    </div>
  );
}

/**
 * The leaderboard. Every way this can fail says so in a sentence rather than
 * spinning: a build with no server behind it, a server that will not answer,
 * and a board nobody has opened an account on yet all look different.
 */
function RatingTab() {
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

  if (state === 'loading') return <div className="arch-soon"><p>{t('archive.ratingLoading')}</p></div>;
  if (state === 'offline') {
    return (
      <SoonTab
        title={t('archive.tabRating')}
        line={boardConfigured() ? t('archive.ratingOffline') : t('archive.ratingNoServer')}
      />
    );
  }

  const rows = board?.top ?? [];
  if (!rows.length) {
    return <SoonTab title={t('archive.tabRating')} line={t('archive.ratingEmpty')} />;
  }

  // the caller's own row, appended when they placed outside the slice above
  const mine = board?.me ?? null;

  return (
    <div className="board">
      <div className="board-head">
        <span>{t('archive.ratingHeader')}</span>
        {!myId() && <em>{t('archive.ratingOnlyInTelegram')}</em>}
      </div>
      <div className="board-rows">
        {rows.map((r) => (
          <BoardLine key={r.id} row={r} />
        ))}
        {mine && (
          <>
            <div className="board-gap">···</div>
            <BoardLine key={mine.id} row={mine} />
          </>
        )}
      </div>
    </div>
  );
}

function BoardLine({ row }: { row: BoardRow }) {
  return (
    <div className={`board-line${row.you ? ' you' : ''}`}>
      <span className="board-rank">{row.rank}</span>
      <span className="board-who">{row.name}</span>
      <span className="board-matches">
        {row.matches} {t('archive.ratingMatches')}
      </span>
      <span className="board-stars">
        <Star size={12} /> {row.stars}
      </span>
    </div>
  );
}

export default function ArchiveScreen({ seen, onBack }: { seen: Set<string>; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('companies');

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        {tab === 'companies' && (
          <div className="arch-count">
            <b>{seen.size}</b>/{COMPANIES.length}
          </div>
        )}
      </header>

      <div className="arch-tabs">
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

      {tab === 'companies' && <CompaniesTab seen={seen} />}
      {tab === 'rating' && <RatingTab />}
      {tab === 'achievements' && (
        <SoonTab title={t('archive.tabAchievements')} line={t('archive.achievementsSoon')} />
      )}
    </div>
  );
}
