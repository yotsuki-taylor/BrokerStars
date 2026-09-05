import React, { useState } from 'react';
import Character from './Character';
import { Check, Cross, Lock, Star } from './components';
import { t, tr } from './i18n';
import {
  CATALOGUE,
  PRICES,
  RARITIES,
  RARITY_COLOR,
  RARITY_LABEL,
  SLOTS,
  SLOT_FOCUS,
  SLOT_LABEL,
  SLOT_THEME,
  SPRITE_H,
  SPRITE_W,
  highestOwned,
  itemId,
  nextRarity,
  pieceUrl,
  rarityBelow,
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

  const top = highestOwned(owned, slot);
  const next = nextRarity(owned, slot);

  // The shop shows the whole ladder, locked rungs included — what is coming is
  // half of why you would save for it. Equip only lists what is actually owned.
  const rarities = mode === 'equip' ? RARITIES.filter((r) => owned.has(itemId(slot, r))) : RARITIES;
  const fallback = mode === 'equip' ? (outfit[slot] ?? top) : (next ?? top);
  const selected = picked && rarities.includes(picked) ? picked : fallback;

  const card = selected ? CATALOGUE[slot][selected] : null;
  const isOwned = selected ? owned.has(itemId(slot, selected)) : false;
  const isWorn = selected != null && outfit[slot] === selected;
  const isNext = selected != null && selected === next;
  /**
   * The rung directly under the one being looked at, which is what a locked
   * card should send you to. Naming the next rung the player owes instead gave
   * every locked card in a bare slot the same "BUY COMMON FIRST" — three steps
   * of advice at once, and none of them about the card in front of you.
   */
  const below = selected ? rarityBelow(selected) : null;
  const price = freeMode ? 0 : selected ? PRICES[selected] : 0;
  const canAfford = stars >= price;
  // preview wears whatever is highlighted, so you see it before paying for it
  const preview: Outfit = selected ? { ...outfit, [slot]: selected } : outfit;

  const pick = (r: Rarity) => {
    setPicked(r);
    setConfirming(false);
  };

  return (
    <div className="shop">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="star-count">
          <Star size={20} />
          <b>{stars}</b>
        </div>
      </header>

      {/* The preview always wears whatever is highlighted, which is the point
          of a fitting room — but on a bare slot that puts an unbought garment
          on the biggest thing on screen, and it reads as already owned. */}
      <div className="shop-preview">
        <Character outfit={preview} />
        {selected && !isOwned && <span className="try-tag">{t('shop.tryingOn')}</span>}
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
            {tr(`slot.${s}.label`, SLOT_LABEL[s])}
          </button>
        ))}
      </div>

      <div className="item-grid">
        {rarities.map((r) => {
          const own = owned.has(itemId(slot, r));
          const worn = outfit[slot] === r;
          // in the shop, anything past the next rung is out of reach for now
          const locked = mode === 'shop' && !own && r !== next;
          return (
            <button
              key={r}
              className={`item${r === selected ? ' picked' : ''}${own ? ' owned' : ''}${locked ? ' locked' : ''}`}
              style={{ borderColor: RARITY_COLOR[r] }}
              onClick={() => pick(r)}
            >
              <i style={thumbStyle(slot, r)} />
              {worn && <em className="worn-tag">ON</em>}
              <span className="tag" style={{ color: RARITY_COLOR[r] }}>
                {own ? (
                  worn ? (
                    t('shop.worn')
                  ) : (
                    t('shop.owned')
                  )
                ) : locked ? (
                  <Lock size={10} />
                ) : (
                  <>
                    <Star size={9} /> {PRICES[r]}
                  </>
                )}
              </span>
            </button>
          );
        })}
        {rarities.length === 0 && <p className="empty-note">{t('shop.emptySlot')}</p>}
      </div>

      {/* What the thing actually does. Fixed height, so stepping along the
          ladder never shuffles the buttons under the player's thumb. */}
      {card && selected && (
        <div className="item-desc">
          <div className="desc-head">
            <b style={{ color: RARITY_COLOR[selected] }}>
              {tr(`item.${slot}.${selected}.name`, card.name)}
            </b>
            <span className="desc-kicker">{tr(`slot.${slot}.theme`, SLOT_THEME[slot])}</span>
          </div>
          <p>{tr(`item.${slot}.${selected}.text`, card.text)}</p>
        </div>
      )}

      {selected && admin && top === selected && (
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
          className={`menu-btn play action${!isOwned && (!isNext || !canAfford) ? ' broke' : ''}`}
          disabled={isWorn || (!isOwned && (!isNext || !canAfford))}
          onClick={() => (isOwned ? onEquip(slot, selected) : setConfirming(true))}
        >
          {isWorn ? (
            t('shop.wearing')
          ) : isOwned ? (
            t('shop.wear')
          ) : !isNext ? (
            t('shop.buyFirst', {
              rarity: tr(
                `rarity.${below ?? next ?? 'common'}`,
                RARITY_LABEL[below ?? next ?? 'common'],
              ),
            })
          ) : price === 0 ? (
            t('shop.buyFree')
          ) : canAfford ? (
            <>
              {t('shop.buy')} <Star size={16} /> {price}
            </>
          ) : (
            <>
              {t('shop.need')} <Star size={16} /> {price - stars} {t('shop.more')}
            </>
          )}
        </button>
      )}
    </div>
  );
}
