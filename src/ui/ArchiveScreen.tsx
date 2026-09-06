import React, { useEffect, useState } from 'react';
import { COMPANIES, TRAIT_LABEL, type Company } from '../sim/companies';
import { LogoMask, Lock, money } from './components';
import { LEAGUES, leagueName } from './leagues';
import { t, tr } from './i18n';

/**
 * The archive: what the player has collected, under two tabs.
 *
 * COMPANIES is everything the game can put on a board, unlocked by playing a
 * match out against it — nothing bought, and nothing spoiled in advance.
 *
 * AWARDS is still a shelf with nothing on it. It is here rather than hidden
 * because a strip that grows a tab later moves the ones already on it.
 *
 * The leaderboard used to be a third tab. It is its own screen off the main
 * menu now — see RatingScreen.tsx — because the one part of the game other
 * people are in should not sit two taps behind a shelf of companies.
 */

type Tab = 'companies' | 'achievements';

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'companies', label: () => t('archive.tabCompanies') },
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
      {tab === 'achievements' && (
        <SoonTab title={t('archive.tabAchievements')} line={t('archive.achievementsSoon')} />
      )}
    </div>
  );
}
