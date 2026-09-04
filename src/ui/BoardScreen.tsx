import React, { useState } from 'react';
import { TRAIT_LABEL, poolFor, type Company, type StockConfig } from '../sim/companies';
import { Check, Cross, LogoMask, Lock, Star } from './components';
import type { BoardPrefs } from './board';
import type { UiPerks } from './perks';

/**
 * The board, before you agree to it.
 *
 * Everything on this screen is a HEAD or EXTRA perk, so it only ever opens for
 * a player who owns one — a bare trader goes straight from the league to the
 * versus screen and finds out what they are trading when the match starts.
 */
export default function BoardScreen({
  leagueName,
  leagueIndex,
  stocks,
  ui,
  prefs,
  rerollsLeft,
  onReroll,
  onPrefs,
  onForce,
  onPlay,
  onBack,
}: {
  leagueName: string;
  leagueIndex: number;
  /** the three companies drawn for this match */
  stocks: StockConfig[];
  ui: UiPerks;
  prefs: BoardPrefs;
  rerollsLeft: number;
  onReroll: () => void;
  onPrefs: (next: BoardPrefs) => void;
  onForce: (ids: string[]) => void;
  onPlay: () => void;
  onBack: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const pool = poolFor(leagueIndex);
  const toggleChoice = (id: string) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );

  const setPin = (id: string) =>
    onPrefs({ pin: prefs.pin === id ? null : id, ban: prefs.ban === id ? null : prefs.ban });
  const setBan = (id: string) =>
    onPrefs({ ban: prefs.ban === id ? null : id, pin: prefs.pin === id ? null : prefs.pin });

  if (choosing) {
    return (
      <div className="board">
        <header className="menu-top">
          <button
            className="menu-btn back"
            onClick={() => {
              setChoosing(false);
              setChosen([]);
            }}
          >
            BACK
          </button>
          <span className="spacer" />
          <div className="arch-count">
            <b>{chosen.length}</b>/3
          </div>
        </header>

        <h3 className="league-title">NAME YOUR THREE</h3>

        <div className="arch-grid">
          {pool.map((c) => {
            const idx = chosen.indexOf(c.id);
            return (
              <button
                key={c.id}
                className={`arch-card${idx >= 0 ? ' picked' : ''}`}
                style={{ borderColor: c.color }}
                onClick={() => toggleChoice(c.id)}
              >
                <LogoMask file={c.logo} color={c.color} className="arch-thumb" />
                <span className="arch-tag">{c.name}</span>
                {idx >= 0 && <em className="worn-tag">{idx + 1}</em>}
              </button>
            );
          })}
        </div>

        <button
          className="menu-btn play"
          disabled={chosen.length !== 3}
          onClick={() => {
            onForce(chosen);
            setChoosing(false);
            setChosen([]);
          }}
        >
          {chosen.length === 3 ? 'TAKE THIS BOARD' : `PICK ${3 - chosen.length} MORE`}
        </button>
      </div>
    );
  }

  return (
    <div className="board">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          BACK
        </button>
        <span className="spacer" />
        <span className="board-league">{leagueName}</span>
      </header>

      <h3 className="league-title">TODAY&rsquo;S BOARD</h3>

      <div className="board-list">
        {stocks.map((s) => {
          const c = s as Company;
          const pinned = prefs.pin === s.id;
          const banned = prefs.ban === s.id;
          return (
            <div className="board-row" key={s.id} style={{ borderColor: s.color }}>
              <LogoMask file={s.logo} color={s.color} className="board-logo" />
              <div className="board-text">
                <div className="board-name" style={{ color: s.color }}>
                  {s.name}
                  {ui.showQuirks && (
                    <span className="board-kind">{TRAIT_LABEL[s.trait?.kind ?? 'plain']}</span>
                  )}
                </div>
                {ui.showQuirks ? (
                  <p className="board-blurb">{c.tagline}</p>
                ) : (
                  <p className="board-blurb dim">Trades at {Math.round(s.basePrice)}.</p>
                )}
              </div>
              {(ui.pins > 0 || ui.bans > 0) && (
                <div className="board-marks">
                  {ui.pins > 0 && (
                    <button
                      className={`mark${pinned ? ' on' : ''}`}
                      onClick={() => setPin(s.id)}
                      aria-label="always draw this one"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  {ui.bans > 0 && (
                    <button
                      className={`mark ban${banned ? ' on' : ''}`}
                      onClick={() => setBan(s.id)}
                      aria-label="never draw this one"
                    >
                      <Cross size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(prefs.pin || prefs.ban) && (
        <div className="board-standing">
          {prefs.pin && (
            <span className="pay-chip">
              <Star size={13} /> ALWAYS {nameOf(prefs.pin, pool)}
            </span>
          )}
          {prefs.ban && (
            <span className="pay-chip">
              <Cross size={13} /> NEVER {nameOf(prefs.ban, pool)}
            </span>
          )}
        </div>
      )}

      <div className="board-actions">
        <button className="menu-btn" disabled={rerollsLeft <= 0} onClick={onReroll}>
          {rerollsLeft > 0 ? `REROLL · ${rerollsLeft}` : 'NO REROLLS'}
        </button>
        {ui.pickAll ? (
          <button className="menu-btn" onClick={() => setChoosing(true)}>
            PICK YOUR OWN
          </button>
        ) : (
          <button className="menu-btn" disabled>
            <Lock size={14} /> PICK
          </button>
        )}
      </div>

      <button className="menu-btn play" onClick={onPlay}>
        <Check size={22} /> PLAY
      </button>
    </div>
  );
}

function nameOf(id: string, pool: Company[]): string {
  return pool.find((c) => c.id === id)?.name ?? id.toUpperCase();
}
