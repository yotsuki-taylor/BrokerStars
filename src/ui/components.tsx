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

/** No star in the texture set yet, so it is drawn inline. */
export function Star({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 2.6l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.2 1.2-6.6-4.8-4.6 6.6-.9z"
        fill="#ffc02e"
        stroke="#0a1f3c"
        strokeWidth="1.7"
        strokeLinejoin="round"
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
            <span className="bankrupt-tag">BUST</span>
          ) : (
            <span className={`delta ${deltaClass(pct)}`}>{signed(pct, 1)}%</span>
          )}
        </div>
        {/* Net worth is the score, but it is two very different things added
            together: only the cash half can buy anything. Shown raw, negatives
            included, so the two numbers always add back up to the total. */}
        <div className="split">
          <span className={`part cash${spent ? ' spent' : ''}`}>
            CASH <b>{money(cash)}</b>
          </span>
          <span className="part held">
            HELD <b>{money(held)}</b>
          </span>
        </div>
      </div>
      <div className={`portrait ${mood}`}>
        <Character outfit={outfit} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- size selector */

export const SIZES: { label: string; value: number }[] = [
  { label: '10%', value: 0.1 },
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: 'MAX', value: 1 },
];

/**
 * How much of the cash on hand one tap commits. The free cash itself used to
 * sit beside these buttons as POWER, but the trader card now carries it as
 * CASH — and the two disagreed on sight, since POWER was clamped at zero while
 * CASH shows the overdraft. One number for one thing.
 */
export function SizeSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sizes">
      {SIZES.map((s) => (
        <button
          key={s.label}
          className={`size-btn${value === s.value ? ' on' : ''}`}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
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
          {position > 0 ? `+${position}` : `-${-position}`} SH
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
        <span>{sellNeedsCash ? 'NO CASH' : shortSide ? 'SHORT' : 'SELL'}</span>
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
        <span>{buyNeedsCash ? 'NO CASH' : 'BUY'}</span>
      </button>
    </div>
  );
}
