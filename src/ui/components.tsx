import { t } from './i18n';
import React from 'react';
import type { StockConfig } from '../sim/config';
import Character from './Character';
import type { Outfit } from './wardrobe';

export const tex = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

export const money = (n: number) =>
  Math.round(n)
    .toLocaleString('en-US')
    .replace(/,/g, ' ');

export const signed = (n: number, digits = 0) =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(digits)}`;

export const deltaClass = (n: number) => (n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'flat');

/** White silhouette tinted with the company colour via a CSS mask. */
export function LogoMask({ file, color, className }: { file: string; color: string; className: string }) {
  return (
    <i
      className={className}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${tex(file)})`,
        maskImage: `url(${tex(file)})`,
      }}
    />
  );
}

/**
 * The soft currency: a coin, and it used to be a star.
 *
 * The rename is not cosmetic. Telegram has a currency of its own called Stars,
 * and the plan is to sell dollars for them — so a shop that charges "stars"
 * would have been asking which ones, in a dialog where getting it wrong costs
 * real money. Nothing in the game is called a star any more.
 *
 * Drawn rather than a texture, like every other mark in this file, and given a
 * rim and a highlight rather than left a flat disc: at 9px in the shop grid a
 * plain circle is a dot, and the rim is what still reads as struck metal.
 *
 * The three parts carry class names because the gold buttons have to recolour
 * them separately. A gold coin on an orange button is an invisible coin, and
 * filling the whole thing dark instead — which is what the old star did, and
 * what the CSS still did to this by inheritance — turns it into a bullet point.
 * On gold it goes dark disc with a gold rim, which still reads as a coin.
 */
export function Coin({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle className="disc" cx="12" cy="12" r="9.2" fill="#ffc02e" stroke="#0a1f3c" strokeWidth="1.7" />
      <circle
        className="rim"
        cx="12"
        cy="12"
        r="5.8"
        fill="none"
        stroke="#0a1f3c"
        strokeWidth="1.2"
        opacity="0.45"
      />
      {/* the shine, top left, where the light in this game always comes from */}
      <path
        className="shine"
        d="M8.4 7.9a5.5 5.5 0 013.2-1.6"
        fill="none"
        stroke="#fff3cd"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The hard currency, and deliberately not another gold disc.
 *
 * A star and a coin side by side in the same corner of the menu read as one
 * thing seen twice, which is the opposite of what two currencies want from a
 * counter. So the dollar is green and it is a note rather than a coin: the two
 * counters differ in colour AND in outline, which is what makes them tell apart
 * at a glance rather than after a squint.
 *
 * The glyph is drawn — an S in two arcs with a bar through it — for the reason
 * every other mark in this file is: a typed `$` falls back to whatever face the
 * system has and stops matching the game.
 */
export function Dollar({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect
        x="1.8"
        y="4.6"
        width="20.4"
        height="14.8"
        rx="3"
        fill="#3ecb74"
        stroke="#0a1f3c"
        strokeWidth="1.7"
      />
      <path
        d="M15 9.3c-.8-.9-1.9-1.4-3.1-1.4-1.8 0-2.9.8-2.9 2 0 1.3 1.2 1.7 3 2.1 2.1.5 3.4 1.1 3.4 2.7 0 1.5-1.3 2.5-3.3 2.5-1.4 0-2.7-.5-3.5-1.4M12 6.3v11.4"
        fill="none"
        stroke="#0a1f3c"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Confirm / cancel marks, drawn rather than typed: the glyphs are unreliable. */
export function Check({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M4.5 12.5l5 5 10-11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Cross({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Three bars for the corner of the menu. Drawn rather than a texture, like the
 * marks above: the corner used to hold the help sprite, and the sprite said
 * "help" when what is behind it now is a menu with help inside it.
 */
export function Gear({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Padlock on a league that is not open yet. Drawn, like the marks above. */
export function Lock({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M7.5 10V7.5a4.5 4.5 0 019 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.6" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------- menu button marks */

/*
 * One mark per button on the main menu, drawn here rather than typed as emoji.
 * Emoji would fall out of the display face onto whatever the system ships, so
 * the same four buttons would wear four different styles on iOS, Android and
 * desktop Telegram — and none of them the game's. These are the same 24-box,
 * round-capped, `currentColor` line the marks above are: they take the label's
 * colour, so a disabled button dims its picture along with its word.
 */

/** SHOP. Basket, rail and two wheels. */
export function Cart({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M2.8 4.3h2.4l2.9 11.4h9.4M6.6 7.6h14.1l-1.9 6.2H8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.8" cy="19.2" r="1.7" fill="currentColor" />
      <circle cx="17.3" cy="19.2" r="1.7" fill="currentColor" />
    </svg>
  );
}

/**
 * EQUIP. A necktie: the one piece of the wardrobe that says which game this is.
 *
 * Knot and blade are one filled shape with a waist between them rather than two
 * pieces — at 18px a gap of half a pixel closes up and the tie turns into a
 * leaf. The collar is the stroke on top, and it is what stops it reading as one.
 */
export function Tie({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M9.3 3.7L12 6.1l2.7-2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.4l2.6 2.4-1.1 1.6 2 8.8L12 21.2l-3.5-2 2-8.8-1.1-1.6z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * ARCHIVE. Two cards of the collection, the near one lying over the far one.
 *
 * Anything centred and humped on top of a box reads as a briefcase — that was
 * the first two attempts. What kills the reading is the diagonal: the cards are
 * offset corner to corner, and the far one is drawn as the two edges that would
 * actually still be showing rather than as a whole rectangle behind. The offset
 * is 4.4 units because the stroke eats 2.2 of it, and what is left has to stay
 * a visible gap down at 18px.
 */
export function Cards({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M8 5.4h10.2a2.2 2.2 0 012.2 2.2v9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.6"
        y="9.8"
        width="12.4"
        height="10.6"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/**
 * DAILY. The trader's own case, which is what the bonus art is a picture of.
 *
 * It sits on its own round button rather than in the column of four, so unlike
 * the marks above it is the whole of the button and gets to be drawn a little
 * heavier. Same 24-box and same `currentColor` all the same: the button dims
 * its picture with its border when there is nothing inside to come and get.
 */
export function Briefcase({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M9 7V5.7A1.7 1.7 0 0110.7 4h2.6A1.7 1.7 0 0115 5.7V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="2.8"
        y="7"
        width="18.4"
        height="13.2"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      {/* the band across the case, with the clasp sitting on it */}
      <path d="M2.8 12.4h18.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <rect x="10.2" y="10.6" width="3.6" height="3.6" rx="1" fill="currentColor" />
    </svg>
  );
}

/** RATING. A cup, not a coin: the coin is already what the currency is. */
export function Trophy({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M7 4h10l-.6 5.2a4.5 4.5 0 01-8.8 0zM7.1 5.6H5a2.3 2.3 0 000 4.6h1.4M16.9 5.6H19a2.3 2.3 0 010 4.6h-1.4M12 14v3.4M8.4 20.4h7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * FRIENDS. Two of them, the near one whole and the far one only half drawn —
 * which is what makes a pair of heads read as a crowd at 22 pixels instead of
 * as one head with a lump beside it.
 */
export function People({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="9.4" cy="8.2" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M3.2 19.6a6.2 6.2 0 0112.4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* the one behind, cut off by the frame rather than by the one in front */}
      <path
        d="M16.4 5.1a3.3 3.3 0 010 6.3M18.4 19.6a5.7 5.7 0 00-2.6-4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------- trader card */

export function TraderCard({
  name,
  outfit,
  netWorth,
  cash,
  held,
  startCash,
  cheapestShare,
  bankrupt,
  hit,
}: {
  name: string;
  /** both traders are dressed figures — the rival's look comes from the versus screen */
  outfit: Outfit;
  netWorth: number;
  /** money on hand, which is the only thing a new position can be bought with */
  cash: number;
  /** what the open positions are worth, negative while short */
  held: number;
  startCash: number;
  /** price of the cheapest share, so a cash pile too small to buy anything shows */
  cheapestShare: number;
  bankrupt: boolean;
  /** an ability is landing on this trader right now */
  hit: boolean;
}) {
  const delta = netWorth - startCash;
  const pct = (delta / startCash) * 100;
  const mood = bankrupt ? 'losing' : pct > 1 ? 'winning' : pct < -1 ? 'losing' : 'level';
  // the moment buying stops being possible, and the reason the split is here
  const spent = !bankrupt && cash < cheapestShare;
  return (
    <div className="trader">
      <div className="trader-card">
        <div className="name">{name}</div>
        <div className="nw">
          <b>{money(netWorth)}</b>
          {bankrupt ? (
            <span className="bankrupt-tag">{t('match.bust')}</span>
          ) : (
            <span className={`delta ${deltaClass(pct)}`}>{signed(pct, 1)}%</span>
          )}
        </div>
        {/* Net worth is the score, but it is two very different things added
            together: only the cash half can buy anything. Shown raw, negatives
            included, so the two numbers always add back up to the total. */}
        <div className="split">
          <span className={`part cash${spent ? ' spent' : ''}`}>
            {t('match.cash')} <b>{money(cash)}</b>
          </span>
          <span className="part held">
            {t('match.held')} <b>{money(held)}</b>
          </span>
        </div>
      </div>
      <div className={`portrait ${mood}${hit ? ' hit' : ''}`}>
        <Character outfit={outfit} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- ability bar */

/**
 * The one ability the player brought, and the one press they get for it.
 *
 * It takes no target — what it lands on is read off the board when it goes off
 * — so the whole thing is a single button. The slot is kept even with a bare
 * neck, so that putting a tie on does not shove the stock rows down the screen.
 */
export function AbilityBar({
  name,
  owned,
  ready,
  spent,
  onUse,
}: {
  /** null for a bare neck, which is what the hint below is for */
  name: string | null;
  /**
   * Whether a neck item is owned at all. Only read when there is no ability:
   * one that is bought and left in the wardrobe wants a different sentence
   * from one that was never bought, and telling somebody to go and buy what
   * they already have is worse than saying nothing.
   */
  owned: boolean;
  /** live now — unspent, and whatever it needs is on the board */
  ready: boolean;
  spent: boolean;
  onUse: () => void;
}) {
  // The row used to stand here empty. A bare strip is not a thing a player can
  // read anything off, and the neck slot is the one part of the wardrobe whose
  // absence is invisible from the match screen: everything else you can see
  // yourself not wearing. So the row says what is missing and where it comes
  // from — as a hint and not a disabled button, because a disabled button
  // means "you have one and it is not ready yet", which is a different state
  // this screen already draws.
  if (!name) {
    return (
      <div className="ability-bar">
        <span className="ability-hint">{t(owned ? 'match.abilityOff' : 'match.abilityNone')}</span>
      </div>
    );
  }
  return (
    <div className="ability-bar">
      <button
        className={`ability-btn${spent ? ' spent' : ''}`}
        onClick={onUse}
        disabled={!ready}
      >
        {spent ? t('match.abilityUsed', { name }) : name}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ stock row */

export interface FloatPnl {
  id: number;
  text: string;
  good: boolean;
}

export function StockRow({
  stock,
  price,
  changePct,
  position,
  shortSide,
  canBuy,
  canSell,
  floats,
  kind,
  hint,
  buyNeedsCash,
  sellNeedsCash,
  onBuy,
  onSell,
}: {
  stock: StockConfig;
  price: number;
  changePct: number;
  position: number;
  shortSide: boolean;
  canBuy: boolean;
  canSell: boolean;
  floats: FloatPnl[];
  /** what sort of company this is, once the player owns the glasses that say */
  kind?: string;
  /** which way it is committed to going, for a position the player holds */
  hint?: -1 | 0 | 1;
  /**
   * The match is still live and the only thing stopping this side is money.
   * Buying power is the cash on hand, so a book fully committed to positions
   * kills BUY on every row at once — worth saying out loud, because a greyed
   * button with no reason on it reads as the game being broken.
   */
  buyNeedsCash?: boolean;
  sellNeedsCash?: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  return (
    <div className="row">
      {position !== 0 && (
        <div className={`pos-badge ${position > 0 ? 'long' : 'short'}`}>
          {position > 0 ? `+${position}` : `-${-position}`} {t('match.shares')}
        </div>
      )}
      {floats.map((f) => (
        <div
          key={f.id}
          className="float-pnl"
          style={{ color: f.good ? 'var(--up)' : 'var(--down)' }}
        >
          {f.text}
        </div>
      ))}

      <button
        className={`trade-btn sell${sellNeedsCash ? ' broke' : ''}`}
        onClick={onSell}
        disabled={!canSell}
      >
        <span>
          {sellNeedsCash ? t('match.noCash') : shortSide ? t('match.short') : t('match.sell')}
        </span>
      </button>

      <div className="info" style={{ boxShadow: `inset 0 0 0 2px ${stock.color}` }}>
        <LogoMask file={stock.logo} color={stock.color} className="logo" />
        <div className="meta">
          {/* The row is barely wide enough for the name on its own, so the
              kind keeps its whole word and the name is the part that gives
              way: the name is spelled out in full on the board screen and in
              the archive, and the kind is what the player paid to see. */}
          <div className="tick-name">
            <span className="tick-label">{stock.name}</span>
            {kind && <em className="kind-tag">{kind}</em>}
          </div>
          <div className="price-line">
            <span className="price">{money(price)}</span>
            <span className={`chg delta ${deltaClass(changePct)}`}>{signed(changePct, 1)}%</span>
            {hint !== undefined && (
              <em className={`hint-tag ${hint > 0 ? 'up' : hint < 0 ? 'down' : 'flat'}`}>
                {hint > 0 ? '\u25b2' : hint < 0 ? '\u25bc' : '\u2014'}
              </em>
            )}
          </div>
        </div>
      </div>

      <button
        className={`trade-btn buy${buyNeedsCash ? ' broke' : ''}`}
        onClick={onBuy}
        disabled={!canBuy}
      >
        <span>{buyNeedsCash ? t('match.noCash') : t('match.buy')}</span>
      </button>
    </div>
  );
}
