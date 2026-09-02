import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Lock, Star, tex } from './components';
import { LEAGUES, unlockedCount, winsOwed } from './leagues';

const badge = (file: string) => tex(`leagues/${file}`);

/**
 * The difficulty ladder, as a horizontally snapping shelf of badges. The one
 * in the middle is the one you play: it scales up and rides forward while its
 * neighbours sit back, so the choice reads at a glance on a phone.
 *
 * The scaling is continuous rather than a class on the snapped card — the
 * badge grows under your thumb as you drag, which is what sells the carousel.
 * Each card carries a `--near` custom property, 1 dead centre and 0 a full
 * card away, and the CSS below turns that into scale and opacity. React state
 * only ever changes when the snapped card changes, not every frame.
 */
export default function LeagueSelect({
  stars,
  wins,
  initial,
  onPlay,
  onBack,
}: {
  stars: number;
  /** wins banked in each league, index for index with LEAGUES */
  wins: number[];
  /** league to open on — the last one played */
  initial: number;
  onPlay: (index: number) => void;
  onBack: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [center, setCenter] = useState(initial);
  const centerRef = useRef(initial);
  const open = unlockedCount(wins);

  const paint = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    // Measured, not assumed: distance is counted in card pitches, and the gap
    // between cards is part of the pitch. Normalising by the card width alone
    // put a neighbour more than 1.0 away, which pinned every card but the
    // centred one at the minimum scale — the shelf then snapped between two
    // states instead of growing under the thumb. The 1.35 widens the falloff
    // past one pitch so the incoming badge is already on its way up.
    const first = cards.current[0];
    const second = cards.current[1];
    const pitch = first && second ? second.offsetLeft - first.offsetLeft : 1;
    const falloff = Math.max(1, pitch * 1.35);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < cards.current.length; i++) {
      const el = cards.current[i];
      if (!el) continue;
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) / falloff;
      const near = 1 - Math.min(1, dist);
      el.style.setProperty('--near', near.toFixed(3));
      // the grown badge overlaps its neighbours, so it has to sit on top
      el.style.zIndex = String(Math.round(near * 10));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best !== centerRef.current) {
      centerRef.current = best;
      setCenter(best);
    }
  }, []);

  const scrollToCard = useCallback((i: number, smooth = true) => {
    const track = trackRef.current;
    const el = cards.current[i];
    if (!track || !el) return;
    track.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // land on the opening card before the first paint, or it visibly jumps
  useLayoutEffect(() => {
    scrollToCard(initial, false);
    paint();
  }, [initial, paint, scrollToCard]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      track.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [paint]);

  const league = LEAGUES[center];
  const unlocked = center < open;
  const owed = winsOwed(center, wins);
  const banked = wins[center] ?? 0;
  const gate = league.winsToNext;
  const prev = center > 0 ? LEAGUES[center - 1] : null;

  return (
    <div className="leagues">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          BACK
        </button>
        <span className="spacer" />
        <div className="star-count">
          <Star size={20} />
          <b>{stars}</b>
        </div>
      </header>

      <h3 className="league-title">CHOOSE YOUR LEAGUE</h3>

      <div className="league-track" ref={trackRef}>
        {LEAGUES.map((l, i) => (
          <div
            key={l.id}
            className="league-card"
            ref={(el) => {
              cards.current[i] = el;
            }}
            onClick={() => scrollToCard(i)}
          >
            <div className={`league-badge${i < open ? '' : ' locked'}`}>
              <img src={badge(l.icon)} alt="" draggable={false} />
              {i >= open && (
                <span className="league-lock">
                  <Lock size={34} />
                </span>
              )}
            </div>
            <div className="league-name">{l.name}</div>
          </div>
        ))}
      </div>

      <div className="league-info">
        <p className="league-blurb">{league.blurb}</p>

        <div className="league-pay">
          <span className="pay-chip">
            <Star size={16} />
            <b>{league.reward.win}</b> WIN
          </span>
          <span className="pay-chip">
            <Star size={16} />
            <b>{league.reward.profit}</b> +40% GAIN
          </span>
        </div>

        {!unlocked && prev ? (
          <div className="league-gate locked">
            <span>
              WIN {owed} MORE IN {prev.name}
            </span>
            <div className="gate-bar">
              <i style={{ width: `${((prev.winsToNext - owed) / prev.winsToNext) * 100}%` }} />
            </div>
          </div>
        ) : gate > 0 ? (
          <div className="league-gate">
            <span>
              {banked >= gate
                ? `${LEAGUES[center + 1].name} IS OPEN`
                : `${banked}/${gate} WINS · UNLOCKS ${LEAGUES[center + 1].name}`}
            </span>
            <div className="gate-bar">
              <i style={{ width: `${Math.min(100, (banked / gate) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <div className="league-gate">
            <span>
              TOP LEAGUE · {banked} WIN{banked === 1 ? '' : 'S'}
            </span>
            <div className="gate-bar">
              <i style={{ width: '100%' }} />
            </div>
          </div>
        )}
      </div>

      <button className="menu-btn play" disabled={!unlocked} onClick={() => onPlay(center)}>
        {unlocked ? 'PLAY' : 'LOCKED'}
      </button>
    </div>
  );
}
