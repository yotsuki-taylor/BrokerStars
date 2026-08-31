import React, { useState } from 'react';
import Character from './Character';
import { Check, Cross, Star } from './components';
import {
  PRICES,
  RARITIES,
  RARITY_COLOR,
  SLOTS,
  SLOT_FOCUS,
  SLOT_LABEL,
  SPRITE_H,
  SPRITE_W,
  itemId,
  pieceUrl,
  thumbPiece,
  type Outfit,
  type Rarity,
  type Slot,
} from './wardrobe';

/**
 * Zooms the shared sprite sheet into the part of the canvas the slot occupies.
 * All in percentages: five fixed-pixel thumbnails plus gaps overflow a 320pt
 * screen, so the cards have to be free to shrink.
 */
function thumbStyle(slot: Slot, rarity: Rarity): React.CSSProperties {
  const f = SLOT_FOCUS[slot];
  const url = pieceUrl(slot, rarity, thumbPiece(slot, rarity));
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${(SPRITE_W / f.w) * 100}% auto`,
    // a background-position percentage lines up that point of the image with
    // the same point of the box, hence fx / (sheet - focus) rather than fx / sheet
    backgroundPositionX: `${(f.x / (SPRITE_W - f.w)) * 100}%`,
    backgroundPositionY: `${(f.y / (SPRITE_H - f.h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export default function Shop({
  mode,
  stars,
  owned,
  outfit,
  admin,
  freeMode,
  onBuy,
  onEquip,
  onRefund,
  onBack,
}: {
  mode: 'shop' | 'equip';
  stars: number;
  owned: Set<string>;
  outfit: Outfit;
  admin: boolean;
  freeMode: boolean;
  onBuy: (slot: Slot, rarity: Rarity) => void;
  onEquip: (slot: Slot, rarity: Rarity) => void;
  onRefund: (slot: Slot, rarity: Rarity) => void;
  onBack: () => void;
}) {
  const [slot, setSlot] = useState<Slot>('torso');
  const [picked, setPicked] = useState<Rarity | null>(null);
  const [confirming, setConfirming] = useState(false);

  const rarities = mode === 'equip' ? RARITIES.filter((r) => owned.has(itemId(slot, r))) : RARITIES;
  const selected = picked && rarities.includes(picked) ? picked : (outfit[slot] ?? rarities[0] ?? null);
  // preview wears whatever is highlighted, so you see it before paying for it
  const preview: Outfit = selected ? { ...outfit, [slot]: selected } : outfit;

  const isOwned = selected ? owned.has(itemId(slot, selected)) : false;
  const isWorn = selected != null && outfit[slot] === selected;
  const price = freeMode ? 0 : selected ? PRICES[selected] : 0;
  const canAfford = stars >= price;

  return (
    <div className="shop">
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

      <div className="shop-preview">
        <Character outfit={preview} />
      </div>

      <div className="slot-tabs">
        {SLOTS.map((s) => (
          <button
            key={s}
            className={`slot-tab${s === slot ? ' on' : ''}`}
            onClick={() => {
              setSlot(s);
              setPicked(null);
              setConfirming(false);
            }}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="item-grid">
        {rarities.map((r) => {
          const own = owned.has(itemId(slot, r));
          const worn = outfit[slot] === r;
          return (
            <button
              key={r}
              className={`item${r === selected ? ' picked' : ''}${own ? ' owned' : ''}`}
              style={{ borderColor: RARITY_COLOR[r] }}
              onClick={() => {
              setPicked(r);
              setConfirming(false);
            }}
            >
              <i style={thumbStyle(slot, r)} />
              {worn && <em className="worn-tag">ON</em>}
              <span className="tag" style={{ color: RARITY_COLOR[r] }}>
                {own ? (
                  worn ? (
                    'WORN'
                  ) : (
                    'OWNED'
                  )
                ) : (
                  <>
                    <Star size={9} /> {PRICES[r]}
                  </>
                )}
              </span>
            </button>
          );
        })}
        {rarities.length === 0 && <p className="empty-note">Nothing owned in this slot yet.</p>}
      </div>

      {selected && admin && isOwned && selected !== 'common' && (
        <button className="admin-btn wide" onClick={() => onRefund(slot, selected)}>
          DEV · REFUND THIS
        </button>
      )}

      {selected && confirming && (
        <div className="confirm-pair action">
          <button className="confirm-btn no" onClick={() => setConfirming(false)} aria-label="cancel">
            <Cross size={24} />
          </button>
          <button
            className="confirm-btn yes"
            onClick={() => {
              onBuy(slot, selected);
              setConfirming(false);
            }}
            aria-label="confirm"
          >
            <Check size={24} />
          </button>
        </div>
      )}

      {selected && !confirming && (
        <button
          className={`menu-btn play action${!isOwned && !canAfford ? ' broke' : ''}`}
          disabled={isWorn || (!isOwned && !canAfford)}
          onClick={() => (isOwned ? onEquip(slot, selected) : setConfirming(true))}
        >
          {isWorn ? (
            'WEARING'
          ) : isOwned ? (
            'WEAR'
          ) : price === 0 ? (
            'BUY FREE'
          ) : canAfford ? (
            <>
              BUY <Star size={16} /> {price}
            </>
          ) : (
            <>
              NEED <Star size={16} /> {price - stars} MORE
            </>
          )}
        </button>
      )}
    </div>
  );
}
