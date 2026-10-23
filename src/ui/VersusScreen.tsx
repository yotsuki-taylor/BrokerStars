import React, { useEffect, useRef, useState } from 'react';
import Character from './Character';
import { LogoMask, money, tex } from './components';
import { t, tr } from './i18n';
import { TRAIT_LABEL, type StockConfig } from '../sim/companies';
import type { Outfit } from './wardrobe';

/**
 * The versus screen before a match: the search, then who turned up.
 *
 * player in → searching → rival in as a silhouette → rival revealed → done.
 *
 * THE SEARCH IS REAL NOW, for as long as `searching` says so. PLAY asks the
 * server's pool for somebody else looking in this league (`ui/seek.ts`), and
 * the screen holds on "searching" until the answer: a stranger, in which case
 * the parent swaps this for the duel version, or nobody, in which case the bot
 * comes in. The match against the bot has already been dealt either way, and
 * a build that cannot look at all passes nothing and gets the old flourish.
 *
 * A duel skips most of that. There is nothing to search for — the friend is
 * already sitting on the other end of the socket — and nothing to cancel or
 * skip either: the server started its clock when it sent the two of us here,
 * and a player who tapped past the wait would only reach an empty board
 * sooner. So the reveal comes almost at once and the wait is spent looking at
 * who turned up.
 */
type Phase = 'enter' | 'searching' | 'found' | 'revealed';

const TIMELINE: [Phase, number][] = [
  ['searching', 500],
  ['found', 1900],
  ['revealed', 2700],
];
const DUEL_TIMELINE: [Phase, number][] = [
  ['found', 250],
  ['revealed', 950],
];
const HANDOVER_MS = 3600;

/**
 * After a real search came back empty. The waiting is done — the player has
 * watched "searching" for as long as there was anybody to wait for — so the
 * rival comes straight in rather than being searched for a second time.
 */
const FOUND_TIMELINE: [Phase, number][] = [
  ['found', 100],
  ['revealed', 900],
];
const FOUND_HANDOVER_MS = 2400;

export default function VersusScreen({
  playerName,
  playerOutfit,
  rivalName,
  rivalOutfit,
  duel = false,
  stranger = false,
  searching = false,
  searched = false,
  stocks = null,
  quirks = false,
  onReady,
  onCancel,
  onSkip,
}: {
  playerName: string;
  playerOutfit: Outfit;
  rivalName: string;
  rivalOutfit: Outfit;
  /** a friend rather than a draw from the pool: no searching, no way out */
  duel?: boolean;
  /**
   * The duel is with somebody the pool found, not a friend: there was no friend
   * to wait for, and the moment before the rival comes in is still the search.
   */
  stranger?: boolean;
  /** the server is still looking for somebody: hold on "searching" until it answers */
  searching?: boolean;
  /** a real search already came back empty, so the rival comes straight in */
  searched?: boolean;
  /**
   * The three companies, for a player whose hat says they get to see them.
   *
   * Only ever passed for a duel. A match against a bot shows them properly, on
   * a screen of their own with a PLAY button and a reroll — a duel cannot: the
   * server dealt one board for both players and started its clock, so there is
   * nothing to refuse and no waiting for a tap. What is left is the half of the
   * item that still works, which is knowing what you are about to face.
   */
  stocks?: StockConfig[] | null;
  /** whether the hat also spells out what each company is like */
  quirks?: boolean;
  onReady: () => void;
  onCancel: () => void;
  /**
   * Stop looking and play the bot now. Passed only while a real search is on
   * and nobody has been found yet; the button is drawn from whether it is here.
   */
  onSkip?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('enter');

  // How long the search has been on, so a wait of up to a minute is a clock
  // the player can read rather than a spinner they have to trust.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const from = Date.now();
    setWaited(0);
    const tick = window.setInterval(() => setWaited(Math.floor((Date.now() - from) / 1000)), 250);
    return () => clearInterval(tick);
  }, [searching]);
  const done = useRef(false);

  // Held in a ref so the timeline below can depend on nothing: onReady is a
  // fresh closure on every parent render, and depending on it restarted the
  // whole sequence from the top each time anything else re-rendered.
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    readyRef.current();
  };

  useEffect(() => {
    if (searching) {
      // Nothing is scheduled past "searching": the answer decides what comes next.
      const t = window.setTimeout(() => setPhase('searching'), TIMELINE[0][1]);
      return () => clearTimeout(t);
    }
    const line = duel ? DUEL_TIMELINE : searched ? FOUND_TIMELINE : TIMELINE;
    const timers = line.map(([p, at]) => window.setTimeout(() => setPhase(p), at));
    timers.push(window.setTimeout(() => finish(), searched && !duel ? FOUND_HANDOVER_MS : HANDOVER_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel, searching, searched]);

  const rivalIn = phase === 'found' || phase === 'revealed';

  return (
    // tapping anywhere skips the wait, except in a duel, where the wait is the
    // server's and skipping it only means staring at a board that has not
    // started yet -- and except during a real search, which a tap would turn
    // into a bot match the player never asked for
    <div className="versus" onClick={duel || searching ? undefined : finish}>
      <img className="versus-bg" src={tex('bg_vs.png')} alt="" draggable={false} />

      {!rivalIn && !duel && (
        <button
          className="menu-btn back versus-cancel"
          onClick={(e) => {
            e.stopPropagation();
            done.current = true;
            onCancel();
          }}
        >
          {t('common.cancel')}
        </button>
      )}

      <div className="versus-side rival">
        <div className={`versus-fig${rivalIn ? ' in' : ''}`}>
          <Character outfit={rivalOutfit} silhouette={phase !== 'revealed'} />
        </div>
      </div>

      <div className="versus-side player">
        <div className="versus-fig in">
          <Character outfit={playerOutfit} />
        </div>
      </div>

      <div className="versus-mark">VS</div>

      {!rivalIn && (
        <div className="versus-status">
          {t(duel && !stranger ? 'versus.waitingFriend' : 'versus.searching')}
          {searching && waited > 0 && (
            <span className="versus-clock">
              {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      )}

      {/* Under the status, where the eye already is. It stops the tap from
          reaching the screen behind, which would only skip the flourish. */}
      {onSkip && !rivalIn && (
        <button
          className="menu-btn versus-skip"
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
        >
          {t('versus.playBot')}
        </button>
      )}

      {rivalIn && <div className="name-plate top">{rivalName}</div>}

      {/* The bottom corner, stacked rather than layered. The player's own name
          has always sat here; the board joins it above, once the rival is up —
          before that the screen is about who turned up, and a board read while
          a silhouette is still resolving is a board nobody reads. */}
      <div className="versus-foot">
        {stocks && rivalIn && (
          <div className="versus-board">
            <span className="versus-board-title">{t('versus.board')}</span>
            {stocks.map((s) => (
              <div className="versus-stock" key={s.id} style={{ borderColor: s.color }}>
                <LogoMask file={s.logo} color={s.color} className="versus-logo" />
                <span className="versus-stock-name" style={{ color: s.color }}>
                  {s.name}
                </span>
                {quirks && (
                  <span className="versus-stock-kind">
                    {tr(
                      `trait.${s.trait?.kind ?? 'plain'}.label`,
                      TRAIT_LABEL[s.trait?.kind ?? 'plain'],
                    )}
                  </span>
                )}
                <span className="versus-stock-price">{money(s.basePrice)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="name-plate bottom">{playerName}</div>
      </div>
    </div>
  );
}
