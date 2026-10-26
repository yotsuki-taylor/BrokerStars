import React, { useEffect, useState } from 'react';
import { t, tr } from './i18n';
import { TRAIT_LABEL, poolFor, type Company } from '../sim/companies';
import { Check, Coin, Cross, Lock, LogoMask, money } from './components';
import { actions, type DraftMove, type DraftView } from '../duel/draft';

/**
 * The board of a duel while both players argue over it (`src/duel/draft.ts`).
 *
 * Only for a player who may look at it — a bare head waits on the versus
 * screen and meets the board there. Everything this screen offers comes off
 * the server's view: which buttons are live is the server's arithmetic on the
 * wardrobe it keeps, and a tap here is only ever a request.
 */
export default function DraftScreen({
  league,
  view,
  /** `Date.now()` when the view arrived, so the clocks count down locally */
  at,
  quirks,
  onMove,
}: {
  league: number;
  view: DraftView;
  at: number;
  quirks: boolean;
  onMove: (move: DraftMove) => void;
}) {
  // Redrawn four times a second, for the two clocks.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const secs = (ms: number) => Math.max(0, Math.ceil((ms - (now - at)) / 1000));

  // Which slot is being replaced by a company the player names; null is the board.
  const [choosing, setChoosing] = useState<number | null>(null);
  // A player who can look but not touch still gets the button, and pressing
  // it only says so on their own screen: the server never waited on them.
  const [pressed, setPressed] = useState(false);

  const pool = poolFor(league);
  const byId = (id: string) => pool.find((c) => c.id === id);
  const name = (id?: string) => (id ? (byId(id)?.name ?? id.toUpperCase()) : '');

  const mine = view.turn === 'you' && !view.youDone;
  const you = view.you;
  const canAct = actions(you) > 0;

  if (choosing !== null) {
    const taken = new Set([...view.board, ...view.banned]);
    return (
      <div className="board">
        <header className="menu-top">
          <button className="menu-btn back" onClick={() => setChoosing(null)}>
            {t('common.back')}
          </button>
          <span className="spacer" />
          <span className="draft-clock">{secs(view.turnInMs)}</span>
        </header>
        <h3 className="league-title">{t('draft.pickFor', { name: name(view.board[choosing]) })}</h3>
        <div className="arch-grid">
          {pool
            .filter((c) => !taken.has(c.id))
            .map((c) => (
              <button
                key={c.id}
                className="arch-card"
                style={{ borderColor: c.color }}
                onClick={() => {
                  onMove({ kind: 'pick', slot: choosing, id: c.id });
                  setChoosing(null);
                }}
              >
                <LogoMask file={c.logo} color={c.color} className="arch-thumb" />
                <span className="arch-tag">{c.name}</span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  // What the line under the title says: whose move, and for how long.
  const status = view.youDone || !canAct
    ? view.rivalDone
      ? t('draft.starting')
      : t('draft.waitRival')
    : mine
      ? view.contested
        ? t('draft.yourTurn')
        : t('draft.yourBoard')
      : t('draft.rivalTurn');
  const clock = !view.youDone && canAct ? secs(view.turnInMs) : secs(view.endsInMs);

  const last = view.last;
  const lastLine =
    last && last.kind !== 'ready'
      ? t(`draft.last.${last.kind}`, {
          who: t(last.who === 'you' ? 'draft.you' : 'draft.rival'),
          from: name(last.from),
          to: name(last.to),
        })
      : null;

  const rivalHas = [
    view.rival.swaps && t('draft.has.swaps', { n: view.rival.swaps }),
    view.rival.bans && t('draft.has.bans', { n: view.rival.bans }),
    view.rival.pins && t('draft.has.pins', { n: view.rival.pins }),
    view.rival.picks && t('draft.has.picks', { n: view.rival.picks }),
  ].filter(Boolean);

  return (
    <div className="board draft">
      <header className="menu-top">
        <h3 className="league-title draft-title">{t('draft.title')}</h3>
        <span className="spacer" />
        <span className="draft-clock">{secs(view.endsInMs)}</span>
      </header>

      <div className={`draft-status${mine ? ' mine' : ''}`}>
        {status} <b>{clock}</b>
      </div>
      {lastLine && <div className="draft-last">{lastLine}</div>}

      <div className="board-list">
        {view.board.map((id, slot) => {
          const c = byId(id) as Company | undefined;
          if (!c) return null;
          const pinned = view.pinned[slot];
          const open = mine && pinned === null;
          return (
            <div className="board-row draft-row" key={`${slot}-${id}`} style={{ borderColor: c.color }}>
              <LogoMask file={c.logo} color={c.color} className="board-logo" />
              <div className="board-text">
                <div className="board-name" style={{ color: c.color }}>
                  {c.name}
                  {quirks && (
                    <span className="board-kind">
                      {tr(`trait.${c.trait?.kind ?? 'plain'}.label`, TRAIT_LABEL[c.trait?.kind ?? 'plain'])}
                    </span>
                  )}
                </div>
                <p className="board-blurb dim">
                  {pinned
                    ? t(pinned === 'you' ? 'draft.pinnedYou' : 'draft.pinnedRival')
                    : quirks
                      ? tr(`company.${c.id}.tagline`, c.tagline)
                      : t('board.tradesAt', { price: money(c.basePrice) })}
                </p>
              </div>
              {pinned && (
                <span className={`draft-pin ${pinned}`}>
                  <Lock size={14} />
                </span>
              )}
              {open && canAct && (
                <div className="draft-moves">
                  {you.swaps > 0 && (
                    <button className="draft-move" onClick={() => onMove({ kind: 'swap', slot })}>
                      {t('draft.swap')}
                    </button>
                  )}
                  {you.bans > 0 && (
                    <button className="draft-move ban" onClick={() => onMove({ kind: 'ban', slot })}>
                      <Cross size={11} /> {t('draft.ban')}
                    </button>
                  )}
                  {you.pins > 0 && (
                    <button className="draft-move pin" onClick={() => onMove({ kind: 'pin', slot })}>
                      <Coin size={11} /> {t('draft.pin')}
                    </button>
                  )}
                  {you.picks > 0 && (
                    <button className="draft-move" onClick={() => setChoosing(slot)}>
                      {t('draft.pick')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="draft-foot">
        {canAct && !view.youDone && (
          <span className="pay-chip">
            {t('draft.youHave', {
              list: [
                you.swaps && t('draft.has.swaps', { n: you.swaps }),
                you.bans && t('draft.has.bans', { n: you.bans }),
                you.pins && t('draft.has.pins', { n: you.pins }),
                you.picks && t('draft.has.picks', { n: you.picks }),
              ]
                .filter(Boolean)
                .join(' · '),
            })}
          </span>
        )}
        {rivalHas.length > 0 && !view.rivalDone && (
          <span className="pay-chip dim">{t('draft.rivalHas', { list: rivalHas.join(' · ') })}</span>
        )}
        {view.banned.length > 0 && (
          <span className="pay-chip dim">
            <Cross size={11} /> {view.banned.map(name).join(', ')}
          </span>
        )}
      </div>

      <button
        className="menu-btn play"
        disabled={canAct ? view.youDone : pressed}
        onClick={() => (canAct ? onMove({ kind: 'ready' }) : setPressed(true))}
      >
        {(canAct ? view.youDone : pressed) ? (
          t('draft.waitRival')
        ) : (
          <>
            <Check size={22} /> {t('draft.ready')}
          </>
        )}
      </button>
    </div>
  );
}
