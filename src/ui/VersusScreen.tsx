import React, { useEffect, useRef, useState } from 'react';
import Character from './Character';
import { tex } from './components';
import { t } from './i18n';
import type { Outfit } from './wardrobe';

/**
 * Matchmaking flourish before a match. Purely presentational: the match itself
 * has already been created, this only decides when to hand over to it.
 *
 * player in → searching → rival in as a silhouette → rival revealed → done.
 */
type Phase = 'enter' | 'searching' | 'found' | 'revealed';

const TIMELINE: [Phase, number][] = [
  ['searching', 500],
  ['found', 1900],
  ['revealed', 2700],
];
const HANDOVER_MS = 3600;

export default function VersusScreen({
  playerName,
  playerOutfit,
  rivalName,
  rivalOutfit,
  onReady,
  onCancel,
}: {
  playerName: string;
  playerOutfit: Outfit;
  rivalName: string;
  rivalOutfit: Outfit;
  onReady: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('enter');
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
    const timers = TIMELINE.map(([p, at]) => window.setTimeout(() => setPhase(p), at));
    timers.push(window.setTimeout(() => finish(), HANDOVER_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rivalIn = phase === 'found' || phase === 'revealed';

  return (
    // tapping anywhere skips the wait
    <div className="versus" onClick={finish}>
      <img className="versus-bg" src={tex('bg_vs.png')} alt="" draggable={false} />

      {!rivalIn && (
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

      {!rivalIn && <div className="versus-status">{t('versus.searching')}</div>}

      {rivalIn && <div className="name-plate top">{rivalName}</div>}
      <div className="name-plate bottom">{playerName}</div>
    </div>
  );
}
