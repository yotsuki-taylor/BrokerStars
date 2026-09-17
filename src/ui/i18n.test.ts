import { describe, expect, it } from 'vitest';
import { COMPANIES, TRAIT_LABEL, TRAIT_SHORT } from '../sim/companies';
import { LANGS, lang, pickLang, setLang, t, tr, translatedIds, type Key } from './i18n';
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
      // English is whatever the data file said, handed straight back
      expect(tr('league.bronze.name', 'BRONZE PIT')).toBe('BRONZE PIT');
      setLang('ru');
      expect(t('menu.play')).toBe('ИГРАТЬ');
      // Russian is something else, and Russian. Asserting the exact wording
      // here would only mean that renaming a league breaks a test about
      // whether the lookup works.
      const ru = tr('league.bronze.name', 'BRONZE PIT');
      expect(ru).not.toBe('BRONZE PIT');
      expect(ru).toMatch(/^[А-ЯЁ][А-ЯЁ\s-]+$/);
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
  'menu.archive',
  'menu.nextUpgrade',
  'menu.renovate',
  'menu.free',
  'menu.roomComplete',
  'menu.daily',
  'daily.bonusTitle',
  'daily.bonusReady',
  'daily.bonusBackIn',
  'daily.inHours',
  'daily.inMinutes',
  'daily.questsTitle',
  'daily.collect',
  'daily.questsRoll',
  'profile.title',
  'profile.wins',
  'profile.duelWins',
  'profile.best',
  'profile.league',
  'profile.earned',
  'profile.met',
  'profile.awards',
  'profile.friendsN',
  'profile.friendsUnknown',
  'settings.title',
  'settings.help',
  'settings.language',
  'settings.privacy',
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
  'archive.tabCompanies',
  'archive.tabAchievements',
  'archive.achievementsSoon',
  'rating.title',
  'rating.header',
  'rating.matches',
  'rating.loading',
  'rating.offline',
  'rating.noServer',
  'rating.empty',
  'rating.onlyInTelegram',
  'shop.tryingOn',
  'shop.worn',
  'shop.owned',
  'shop.wear',
  'shop.wearing',
  'duel.shoutSignIn',
  'shop.today',
  'shop.cleanedOut',
  'shop.comeBack',
  'shop.nothingOwned',
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
  'settings.tutorial',
  'tut.step',
  'tut.skip',
  'tut.next',
  'tut.done',
  'tut.duel.title',
  'tut.duel.body',
  'tut.friends.title',
  'tut.friends.body',
  'tut.money.title',
  'tut.money.body',
  'tut.shares.title',
  'tut.shares.body',
  'tut.equip.title',
  'tut.equip.body',
  'tut.room.title',
  'tut.room.body',
  'duel.shout',
  'duel.shouted',
  'duel.shoutWait',
  'duel.shoutFailed',
  'friends.chatPitch',
  'friends.chatJoin',
  // Every corporation key, which is the newest block and the one most
  // likely to grow a {hole} in one language and not the other.
  'corp.title',
  'corp.loading',
  'corp.offline',
  'corp.noServer',
  'corp.noneTitle',
  'corp.none',
  'corp.search',
  'corp.found',
  'corp.create',
  'corp.join',
  'corp.ask',
  'corp.fullMark',
  'corp.closedMark',
  'corp.membersOf',
  'corp.unranked',
  'corp.place',
  'corp.newTitle',
  'corp.name',
  'corp.tag',
  'corp.motto',
  'corp.mottoHint',
  'corp.emblem',
  'corp.emblemOwn',
  'corp.emblemCompanies',
  'corp.policy',
  'corp.policyOpen',
  'corp.policyClosed',
  'corp.letters',
  'corp.tagLetters',
  'corp.found2',
  'corp.membersTitle',
  'corp.feedTitle',
  'corp.feedEmpty',
  'corp.seasonEnds',
  'corp.inDays',
  'corp.thisSeason',
  'corp.coinRank',
  'corp.dollarRank',
  'corp.table',
  'corp.callOut',
  'corp.invite',
  'corp.inviteText',
  'corp.yourCode',
  'corp.copyCode',
  'corp.enterCode',
  'corp.leave',
  'corp.leaveSure',
  'corp.owner',
  'corp.you',
  'corp.manage',
  'corp.rename',
  'corp.renameWait',
  'corp.kick',
  'corp.transfer',
  'corp.disband',
  'corp.disbandSure',
  'corp.requests',
  'corp.accept',
  'corp.refuse',
  'corp.save',
  'corp.feed.joined',
  'corp.feed.left',
  'corp.feed.league',
  'corp.feed.award',
  'corp.feed.duel',
  'corp.feed.duelYours',
  'corp.feed.taken',
  'corp.feed.join',
  'corp.feed.left2',
  'corp.topTitle',
  'corp.tabCoins',
  'corp.tabDollars',
  'corp.headCoins',
  'corp.headDollars',
  'corp.topEmpty',
  'corp.topWhy',
  'corp.err.nosuch',
  'corp.err.full',
  'corp.err.already',
  'corp.err.notmember',
  'corp.err.notowner',
  'corp.err.badname',
  'corp.err.taken',
  'corp.err.renamed',
  'corp.err.cooldown',
  'corp.err.closed',
  'corp.err.pending',
  'corp.err.gone',
  'corp.err.busy',
  'corp.err.noserver',
] as const satisfies readonly Key[];

describe('which language a stranger is greeted in', () => {
  it('obeys a choice that was actually made, whatever the device says', () => {
    // the one rule that outranks everything: a tap in settings is not a guess
    expect(pickLang('ru', 'en-US')).toBe('ru');
    expect(pickLang('en', 'ru-RU')).toBe('en');
  });

  it('takes the host at its word when nobody has chosen', () => {
    expect(pickLang(null, 'ru')).toBe('ru');
    expect(pickLang(null, 'en')).toBe('en');
  });

  it('reads only the language out of a full tag', () => {
    // ru-RU, ru_RU and RU are one language; the region is not ours to care about
    for (const tag of ['ru-RU', 'ru_RU', 'RU', ' ru ']) expect(pickLang(null, tag)).toBe('ru');
    expect(pickLang(null, 'en-GB')).toBe('en');
  });

  it('falls back to English for a language this game does not have', () => {
    // pt-BR is somebody the game cannot greet properly either way
    expect(pickLang(null, 'pt-BR')).toBe('en');
    expect(pickLang(null, 'de')).toBe('en');
  });

  it('falls back to English when the host says nothing at all', () => {
    expect(pickLang(null, '')).toBe('en');
    expect(pickLang(null, '   ')).toBe('en');
  });

  it('ignores a stored value that is not a language', () => {
    // a store somebody else wrote to, or one left over from a rename
    expect(pickLang('klingon', 'ru')).toBe('ru');
    expect(pickLang('', 'ru')).toBe('ru');
  });
});
