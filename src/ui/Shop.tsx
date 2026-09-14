import React, { useState } from 'react';
import Character from './Character';
import { Check, Cross, Coin } from './components';
import { t, tr } from './i18n';
import { OFFER_SIZE, showing, type Offer } from '../shop/protocol';
import {
  ALL_ITEMS,
  CATALOGUE,
  PRICES,
  RARITY_COLOR,
  SLOT_FOCUS,
  SLOT_LABEL,
  SLOT_THEME,
  SPRITE_H,
  SPRITE_W,
  itemId,
  rankOf,
  thumbPiece,
  pieceUrl,
  type Outfit,
  type Rarity,
  type Slot,
} from './wardrobe';

/** Every garment by id, so a shelf of ids can be drawn without a second lookup. */
const BY_ID = new Map(ALL_ITEMS.map((it) => [it.id, it]));

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

/**
 * The shop, and the wardrobe behind it — one screen, two moods.
 *
 * NO TABS, AND NO LADDER. It used to be a slot picker over a five-rung column:
 * pick HEAD, see the five hats, and buy the one rung the slot was standing in
 * front of. That made three taps out of one question and put four locked cards
 * on screen for every card worth looking at.
 *
 * What is drawn now is a flat row of whole garments. In the shop that row is
 * today's shelf — up to five drawn at midnight, minus whatever has been bought
 * since, in any order the coins allow (`src/shop/protocol.ts`). In the wardrobe
 * it is everything owned, across every slot at once. Either way a card is a
 * thing, not a rung, so the slot it belongs to is written on it: with the tabs
 * gone, nothing else says a TEN GALLON goes on your head.
 */
export default function Shop({
  mode,
  coins,
  owned,
  offer,
  outfit,
  admin,
  freeMode,
  onBuy,
  onEquip,
  onRefund,
  onBack,
}: {
  mode: 'shop' | 'equip';
  coins: number;
  owned: Set<string>;
  offer: Offer;
  outfit: Outfit;
  admin: boolean;
  freeMode: boolean;
  onBuy: (slot: Slot, rarity: Rarity) => void;
  onEquip: (slot: Slot, rarity: Rarity) => void;
  onRefund: (slot: Slot, rarity: Rarity) => void;
  onBack: () => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The shop shows today's shelf and nothing else; the wardrobe shows the whole
  // of what has been bought, cheapest first so the eye runs the same way.
  const ids =
    mode === 'shop'
      ? showing(offer, owned)
      : ALL_ITEMS.filter((it) => owned.has(it.id))
          .sort((a, b) => rankOf(a.rarity) - rankOf(b.rarity))
          .map((it) => it.id);

  const selectedId = pickedId && ids.includes(pickedId) ? pickedId : (ids[0] ?? null);
  const picked = selectedId ? BY_ID.get(selectedId) : undefined;
  const slot = picked?.slot ?? null;
  const rarity = picked?.rarity ?? null;

  const card = picked ? CATALOGUE[picked.slot][picked.rarity] : null;
  const isOwned = selectedId ? owned.has(selectedId) : false;
  const isWorn = picked != null && outfit[picked.slot] === picked.rarity;
  const price = freeMode ? 0 : rarity ? PRICES[rarity] : 0;
  const canAfford = coins >= price;
  // preview wears whatever is highlighted, so you see it before paying for it
  const preview: Outfit = picked ? { ...outfit, [picked.slot]: picked.rarity } : outfit;

  const pick = (id: string) => {
    setPickedId(id);
    setConfirming(false);
  };

  return (
    <div className="shop">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="coin-count">
          <Coin size={20} />
          <b>{coins}</b>
        </div>
      </header>

      {/* The preview always wears whatever is highlighted, which is the point
          of a fitting room — but on a bare slot that puts an unbought garment
          on the biggest thing on screen, and it reads as already owned. */}
      <div className="shop-preview">
        <Character outfit={preview} />
        {picked && !isOwned && <span className="try-tag">{t('shop.tryingOn')}</span>}
      </div>

      {/* What the day put out, and how long it is there for. The line is what
          makes an empty shelf legible: a shop with nothing in it and no
          explanation reads as broken rather than as sold out. */}
      {mode === 'shop' && (
        <p className="shelf-note">
          {ids.length > 0 ? t('shop.today') : t('shop.cleanedOut')}
        </p>
      )}

      <div className="item-grid" style={{ gridTemplateColumns: `repeat(${OFFER_SIZE}, 1fr)` }}>
        {ids.map((id) => {
          const it = BY_ID.get(id)!;
          const worn = outfit[it.slot] === it.rarity;
          return (
            <button
              key={id}
              className={`item${id === selectedId ? ' picked' : ''}${mode === 'equip' ? ' owned' : ''}`}
              style={{ borderColor: RARITY_COLOR[it.rarity] }}
              onClick={() => pick(id)}
            >
              <i style={thumbStyle(it.slot, it.rarity)} />
              {worn && <em className="worn-tag">ON</em>}
              {/* With the tabs gone this is the only thing saying where the
                  garment goes, so it is on the card rather than over the grid. */}
              <span className="slot-tag">{tr(`slot.${it.slot}.label`, SLOT_LABEL[it.slot])}</span>
              <span className="tag" style={{ color: RARITY_COLOR[it.rarity] }}>
                {mode === 'equip' ? (
                  worn ? (
                    t('shop.worn')
                  ) : (
                    t('shop.owned')
                  )
                ) : (
                  <>
                    <Coin size={9} /> {PRICES[it.rarity]}
                  </>
                )}
              </span>
            </button>
          );
        })}
        {ids.length === 0 && (
          <p className="empty-note">
            {mode === 'shop' ? t('shop.comeBack') : t('shop.nothingOwned')}
          </p>
        )}
      </div>

      {/* What the thing actually does. Fixed height, so stepping along the
          shelf never shuffles the buttons under the player's thumb. */}
      {card && picked && (
        <div className="item-desc">
          <div className="desc-head">
            <b style={{ color: RARITY_COLOR[picked.rarity] }}>
              {tr(`item.${picked.slot}.${picked.rarity}.name`, card.name)}
            </b>
            <span className="desc-kicker">
              {tr(`slot.${picked.slot}.theme`, SLOT_THEME[picked.slot])}
            </span>
          </div>
          <p>{tr(`item.${picked.slot}.${picked.rarity}.text`, card.text)}</p>
        </div>
      )}

      {picked && slot && rarity && admin && owned.has(itemId(slot, rarity)) && (
        <button className="admin-btn wide" onClick={() => onRefund(slot, rarity)}>
          DEV · REFUND THIS
        </button>
      )}

      {picked && slot && rarity && confirming && (
        <div className="confirm-pair action">
          <button className="confirm-btn no" onClick={() => setConfirming(false)} aria-label="cancel">
            <Cross size={24} />
          </button>
          <button
            className="confirm-btn yes"
            onClick={() => {
              onBuy(slot, rarity);
              setConfirming(false);
            }}
            aria-label="confirm"
          >
            <Check size={24} />
          </button>
        </div>
      )}

      {picked && slot && rarity && !confirming && (
        <button
          className={`menu-btn play action${!isOwned && !canAfford ? ' broke' : ''}`}
          disabled={isWorn || (!isOwned && !canAfford)}
          onClick={() => (isOwned ? onEquip(slot, rarity) : setConfirming(true))}
        >
          {isWorn ? (
            t('shop.wearing')
          ) : isOwned ? (
            t('shop.wear')
          ) : price === 0 ? (
            t('shop.buyFree')
          ) : canAfford ? (
            <>
              {t('shop.buy')} <Coin size={16} /> {price}
            </>
          ) : (
            <>
              {t('shop.need')} <Coin size={16} /> {price - coins} {t('shop.more')}
            </>
          )}
        </button>
      )}
    </div>
  );
}
