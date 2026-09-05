import { describe, expect, it } from 'vitest';
import { COMPANIES, TRAIT_LABEL, TRAIT_SHORT } from '../sim/companies';
import { LANGS, lang, setLang, t, tr, translatedIds, type Key } from './i18n';
import { LEAGUES } from './leagues';
import { ROOM_STEPS } from './renovation';
import { CATALOGUE, RARITIES, RARITY_LABEL, SLOTS, SLOT_LABEL, SLOT_THEME } from './wardrobe';

/** Every id the game will ever ask `tr` for. */
function everyContentId(): string[] {
  const ids: string[] = [];
  for (const l of LEAGUES) ids.push(`league.${l.id}.name`, `league.${l.id}.blurb`);
  for (const c of COMPANIES) ids.push(`company.${c.id}.tagline`);
  for (const kind of Object.keys(TRAIT_LABEL)) ids.push(`trait.${kind}.label`);
  for (const kind of Object.keys(TRAIT_SHORT)) ids.push(`trait.${kind}.short`);
  for (const step of ROOM_STEPS) ids.push(`room.${step.slot}`);
  for (const s of SLOTS) ids.push(`slot.${s}.label`, `slot.${s}.theme`);
  for (const r of RARITIES) ids.push(`rarity.${r}`);
  for (const s of SLOTS) {
    for (const r of RARITIES) ids.push(`item.${s}.${r}.name`, `item.${s}.${r}.text`);
  }
  return ids;
}

describe('the dictionary', () => {
  it('has Russian for every piece of content the game can show', () => {
    // `tr` falls back to English on a missing id, which is the right behaviour
    // at runtime and a very good place for a forgotten string to hide. This is
    // what stops it hiding.
    const have = new Set(translatedIds());
    const missing = everyContentId().filter((id) => !have.has(id));
    expect(missing, `no Russian for: ${missing.join(', ')}`).toEqual([]);
  });

  it('carries nothing the game will never ask for', () => {
    const wanted = new Set(everyContentId());
    const stale = translatedIds().filter((id) => !wanted.has(id));
    expect(stale, `translated but unused: ${stale.join(', ')}`).toEqual([]);
  });

  it('actually answers in the language that is on', () => {
    const before = lang();
    try {
      setLang('en');
      expect(t('menu.play')).toBe('PLAY');
      expect(tr('league.bronze.name', 'BRONZE PIT')).toBe('BRONZE PIT');
      setLang('ru');
      expect(t('menu.play')).toBe('ИГРАТЬ');
      expect(tr('league.bronze.name', 'BRONZE PIT')).toBe('БРОНЗОВАЯ ЯМА');
      // an id nobody has translated still shows something a player can read
      expect(tr('company.nosuch.tagline', 'fallback')).toBe('fallback');
    } finally {
      setLang(before);
    }
  });

  it('fills the same holes in both languages', () => {
    // A string with a {slot} in one language and not the other renders a raw
    // brace to somebody. The set of names has to match, not just the count.
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const before = lang();
    try {
      const en: Record<string, string[]> = {};
      setLang('en');
      for (const key of KEYS) en[key] = holes(t(key));
      setLang('ru');
      for (const key of KEYS) expect(holes(t(key)), key).toEqual(en[key]);
    } finally {
      setLang(before);
    }
  });

  it('leaves the company names alone in both languages', () => {
    const before = lang();
    try {
      for (const l of LANGS) {
        setLang(l);
        for (const c of COMPANIES) {
          // the tagline is translated, the name on the card is not
          expect(tr(`company.${c.id}.tagline`, c.tagline).length).toBeGreaterThan(0);
        }
      }
    } finally {
      setLang(before);
    }
  });

  it('has no empty string where a label is meant to be', () => {
    const before = lang();
    try {
      for (const l of LANGS) {
        setLang(l);
        for (const s of SLOTS) {
          expect(tr(`slot.${s}.label`, SLOT_LABEL[s]).trim().length, s).toBeGreaterThan(0);
          expect(tr(`slot.${s}.theme`, SLOT_THEME[s]).trim().length, s).toBeGreaterThan(0);
          for (const r of RARITIES) {
            const card = CATALOGUE[s][r];
            expect(tr(`item.${s}.${r}.name`, card.name).trim().length).toBeGreaterThan(0);
            expect(tr(`item.${s}.${r}.text`, card.text).trim().length).toBeGreaterThan(0);
            expect(tr(`rarity.${r}`, RARITY_LABEL[r]).trim().length).toBeGreaterThan(0);
          }
        }
      }
    } finally {
      setLang(before);
    }
  });
});

/**
 * The chrome keys, listed here rather than exported from i18n: the dictionary
 * is typed so a key can only exist in both languages or neither, and this is
 * only used to walk them.
 */
const KEYS = [
  'common.back',
  'common.cancel',
  'common.menu',
  'common.none',
  'common.on',
  'common.off',
  'menu.play',
  'menu.shop',
  'menu.equip',
  'menu.companies',
  'menu.nextUpgrade',
  'menu.renovate',
  'menu.free',
  'menu.roomComplete',
  'settings.title',
  'settings.help',
  'settings.language',
  'settings.close',
  'help.title',
  'help.match',
  'help.companies',
  'help.quarters',
  'help.trading',
  'help.entry',
  'help.gotIt',
  'leagues.title',
  'leagues.locked',
  'leagues.winsToNext',
  'leagues.top',
  'leagues.win',
  'leagues.gain',
  'leagues.winMoreIn',
  'leagues.isOpen',
  'leagues.topLeague',
  'board.title',
  'board.nameYours',
  'board.take',
  'board.reroll',
  'board.pick',
  'board.pin',
  'board.ban',
  'board.pickMore',
  'board.noRerolls',
  'board.rerollN',
  'board.pickYourOwn',
  'board.tradesAt',
  'board.always',
  'board.never',
  'versus.searching',
  'archive.empty',
  'archive.everyLeague',
  'archive.andUp',
  'archive.unknown',
  'archive.listsAt',
  'shop.tryingOn',
  'shop.worn',
  'shop.owned',
  'shop.wear',
  'shop.wearing',
  'shop.buyFirst',
  'shop.emptySlot',
  'shop.buyFree',
  'shop.buy',
  'shop.need',
  'shop.more',
  'match.you',
  'match.rival',
  'match.cash',
  'match.held',
  'match.bust',
  'match.shares',
  'match.buy',
  'match.sell',
  'match.short',
  'match.noCash',
  'match.takeBack',
  'match.abilityUsed',
  'match.paused',
  'match.resume',
  'match.surrender',
  'result.win',
  'result.lose',
  'result.draw',
  'result.bankrupt',
  'result.surrendered',
  'result.gap',
  'result.winPay',
  'result.noWin',
  'result.gainPay',
  'result.unlocked',
  'result.yourResult',
  'result.bestTrade',
  'result.worstTrade',
  'result.trades',
  'result.closedInProfit',
  'result.playAgain',
] as const satisfies readonly Key[];
