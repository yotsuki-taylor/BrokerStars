import React, { useState } from 'react';
import { COMPANIES, type Company, type TraitKind } from '../sim/companies';
import { LogoMask, Lock, money } from './components';
import { LEAGUES } from './leagues';

/**
 * The company archive: everything the game can put on a board, and what the
 * player has actually run into. A card unlocks the moment its company goes up
 * in a match — nothing is bought, and nothing is spoiled in advance.
 */

/** A word for the quirk, so a card reads at a glance before the line does. */
const TRAIT_LABEL: Record<TraitKind, string> = {
  plain: 'STANDARD',
  locked: 'TRENDING',
  regulated: 'REGULATED',
  bubble: 'BUBBLE',
  stall: 'STREAKY',
  floor: 'PROTECTED',
  moonshot: 'LONG SHOT',
  luxury: 'LUXURY',
  dividend: 'PAYS OUT',
  headline: 'IN THE NEWS',
  ratchet: 'RATCHET',
};

function whereFound(c: Company): string {
  if (c.staple) return 'EVERY LEAGUE';
  const league = LEAGUES[c.fromLeague];
  return league ? `${league.name} AND UP` : 'UNKNOWN';
}

export default function Companies({ seen, onBack }: { seen: Set<string>; onBack: () => void }) {
  const first = COMPANIES.find((c) => seen.has(c.id));
  const [pickedId, setPickedId] = useState<string | null>(first?.id ?? null);
  const picked = COMPANIES.find((c) => c.id === pickedId && seen.has(c.id)) ?? null;

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          BACK
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
                  {TRAIT_LABEL[picked.trait.kind]}
                </span>
                <span className="arch-chip">LISTS AT {money(picked.basePrice)}</span>
              </div>
              <p className="arch-blurb">{picked.tagline}</p>
              <div className="arch-where">{whereFound(picked)}</div>
            </div>
          </>
        ) : (
          <p className="arch-empty">
            Nothing filed yet. Every company you trade against goes on this shelf.
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
