import React from 'react';
import type { StockConfig } from '../sim/config';

export const tex = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

export const money = (n: number) =>
  Math.round(n)
    .toLocaleString('en-US')
    .replace(/,/g, ' ');

export const signed = (n: number, digits = 0) =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(digits)}`;

export const deltaClass = (n: number) => (n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'flat');

/** White silhouette PNG tinted with the company colour via a CSS mask. */
function LogoMask({ file, color, className }: { file: string; color: string; className: string }) {
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

/* ---------------------------------------------------------- trader card */

export function TraderCard({
  name,
  portrait,
  netWorth,
  startCash,
  bankrupt,
  mirrored,
}: {
  name: string;
  portrait: string;
  netWorth: number;
  startCash: number;
  bankrupt: boolean;
  mirrored: boolean;
}) {
  const delta = netWorth - startCash;
  const pct = (delta / startCash) * 100;
  const mood = bankrupt ? 'losing' : pct > 1 ? 'winning' : pct < -1 ? 'losing' : 'level';
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
      </div>
      <div className={`portrait ${mood}`}>
        <img src={tex(portrait)} alt="" style={mirrored ? { transform: 'scaleX(-1)' } : undefined} />
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

export function SizeSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sizes">
      <span className="label">SIZE</span>
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

      <button className="trade-btn sell" onClick={onSell} disabled={!canSell}>
        <span>{shortSide ? 'SHORT' : 'SELL'}</span>
      </button>

      <div className="info" style={{ boxShadow: `inset 0 0 0 2px ${stock.color}` }}>
        <LogoMask file={stock.logo} color={stock.color} className="logo" />
        <div className="meta">
          <div className="tick-name">{stock.name}</div>
          <div className="price-line">
            <span className="price">{money(price)}</span>
            <span className={`chg delta ${deltaClass(changePct)}`}>{signed(changePct, 1)}%</span>
          </div>
        </div>
      </div>

      <button className="trade-btn buy" onClick={onBuy} disabled={!canBuy}>
        <span>BUY</span>
      </button>
    </div>
  );
}
