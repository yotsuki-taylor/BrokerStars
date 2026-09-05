import React, { useState } from 'react';
import { COMPANIES, TRAIT_LABEL, type Company } from '../sim/companies';
import { LogoMask, Lock, money } from './components';
import { LEAGUES, leagueName } from './leagues';
import { t, tr } from './i18n';

/**
 * The company archive: everything the game can put on a board, and what the
 * player has actually run into. A card unlocks the moment its company goes up
 * in a match — nothing is bought, and nothing is spoiled in advance.
 */

function whereFound(c: Company): string {
  if (c.staple) return t('archive.everyLeague');
  const league = LEAGUES[c.fromLeague];
  return league ? t('archive.andUp', { name: leagueName(league) }) : t('archive.unknown');
}

export default function Companies({ seen, onBack }: { seen: Set<string>; onBack: () => void }) {
  const first = COMPANIES.find((c) => seen.has(c.id));
  const [pickedId, setPickedId] = useState<string | null>(first?.id ?? null);
  const picked = COMPANIES.find((c) => c.id === pickedId && seen.has(c.id)) ?? null;

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="arch-count">
          <b>{seen.size}</b>/{COMPANIES.length}
        </div>
      </header>

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
          <p className="arch-empty">
            {t('archive.empty')}
          </p>
        )}
      </div>

      <div className="arch-grid">
        {COMPANIES.map((c) => {
          const found = seen.has(c.id);
          return (
            <button
              key={c.id}
              className={`arch-card${found ? '' : ' locked'}${c.id === pickedId && found ? ' picked' : ''}`}
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
    </div>
  );
}
