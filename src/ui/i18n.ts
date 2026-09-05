/**
 * Two languages, one dictionary.
 *
 * There are two kinds of text in this game and they are handled differently on
 * purpose.
 *
 * Screen furniture — buttons, headings, the odd sentence — lives here in both
 * languages, keyed by a name. `RU` is typed against `EN`, so a key that exists
 * in one and not the other will not compile.
 *
 * Content — what a company is like, what an item does, what a league is — goes
 * on living in the data files it belongs to (`sim/companies.ts`, `ui/leagues.ts`,
 * `ui/wardrobe.ts`, `ui/renovation.ts`), in English, and this file carries only
 * the Russian for it, keyed by the same id the data uses. Adding a company then
 * costs one line in one file rather than three, and an untranslated one falls
 * back to English instead of showing a raw key. `i18n.test.ts` is what stops
 * that fallback from becoming a hiding place: it fails if any id is missing.
 *
 * Company NAMES are deliberately not in here. TET CORP is TET CORP in both.
 *
 * The current language is module state rather than a context, and every screen
 * hangs off one component that re-renders when it changes, so `t()` can be
 * called anywhere without threading a prop through nine files.
 */

export type Lang = 'en' | 'ru';

export const LANGS: Lang[] = ['en', 'ru'];

/** What each language calls itself. Never translated — that is the point. */
export const LANG_NAME: Record<Lang, string> = { en: 'ENGLISH', ru: 'РУССКИЙ' };

const KEY = 'brokerstars.lang';

/** Private browsing and locked-down webviews throw on access, so never assume. */
function loadLang(): Lang {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === 'ru' || raw === 'en' ? raw : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = loadLang();

export const lang = (): Lang => current;

export function setLang(next: Lang): void {
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable — the choice holds for this session only */
  }
}

/* ------------------------------------------------------------ the chrome */

const EN = {
  'common.back': 'BACK',
  'common.cancel': 'CANCEL',
  'common.menu': 'MENU',
  'common.none': 'NONE',
  'common.on': 'ON',
  'common.off': 'OFF',

  'menu.play': 'PLAY',
  'menu.shop': 'SHOP',
  'menu.equip': 'EQUIP',
  'menu.companies': 'COMPANIES',
  'menu.nextUpgrade': 'NEXT UPGRADE · {n}/{of}',
  'menu.renovate': 'RENOVATE?',
  'menu.free': 'FREE',
  'menu.roomComplete': 'ROOM COMPLETE',

  'settings.title': 'SETTINGS',
  'settings.help': 'HOW TO PLAY',
  'settings.language': 'LANGUAGE',
  'settings.close': 'CLOSE',

  'help.title': 'HOW TO PLAY',
  'help.match':
    '80 seconds. You and your rival trade the same three stocks. Whoever ends with the bigger net worth — cash plus positions — wins. Positions close automatically at the whistle, so the finish is never a race to sell.',
  'help.companies':
    'The three companies change from match to match, and each one has a habit of its own — one commits to a trend, one goes dead for seconds at a time, one climbs until the day it doesn’t. COMPANIES on the menu keeps every one you have met and what it does.',
  'help.quarters':
    'The year runs in four quarters, ruled off on the chart. Some companies only do their trick at a quarter close, so watch the line as one goes by.',
  'help.trading':
    'BUY goes long, and one tap commits a quarter of your cash. SELL closes a long, or opens a short when you hold nothing — then you profit when the price falls. Big orders move the price against you, so the rival feels every trade you make.',
  'help.entry':
    'Dashed line on the chart is your average entry: a long is in profit above it, a short below. Win a match to earn stars — the tougher the league, the bigger the payout. Bank enough wins in a league and the next one opens.',
  'help.gotIt': 'GOT IT',

  'leagues.title': 'CHOOSE YOUR LEAGUE',
  'leagues.locked': 'LOCKED',
  'leagues.winsToNext': '{n}/{of} WINS · UNLOCKS {name}',
  'leagues.top': 'THE TOP OF THE LADDER',
  'leagues.win': 'WIN',
  'leagues.gain': '+{n}% GAIN',
  'leagues.winMoreIn': 'WIN {n} MORE IN {name}',
  'leagues.isOpen': '{name} IS OPEN',
  'leagues.topLeague': 'TOP LEAGUE · {n} WINS',

  'board.title': 'TODAY’S BOARD',
  'board.nameYours': 'NAME YOUR THREE',
  'board.take': 'TAKE THIS BOARD',
  'board.reroll': 'REROLL',
  'board.pick': 'PICK',
  'board.pin': 'PIN',
  'board.ban': 'BAN',
  'board.pickMore': 'PICK {n} MORE',
  'board.noRerolls': 'NO REROLLS',
  'board.rerollN': 'REROLL · {n}',
  'board.pickYourOwn': 'PICK YOUR OWN',
  'board.tradesAt': 'Trades at {price}.',
  'board.always': 'ALWAYS {name}',
  'board.never': 'NEVER {name}',

  'versus.searching': 'SEARCHING FOR AN OPPONENT',

  'archive.empty': 'Nothing filed yet. Every company you trade against goes on this shelf.',
  'archive.everyLeague': 'EVERY LEAGUE',
  'archive.andUp': '{name} AND UP',
  'archive.unknown': 'UNKNOWN',
  'archive.listsAt': 'LISTS AT {price}',

  'shop.tryingOn': 'TRYING ON',
  'shop.worn': 'WORN',
  'shop.owned': 'OWNED',
  'shop.wear': 'WEAR',
  'shop.wearing': 'WEARING',
  'shop.buyFirst': 'BUY {rarity} FIRST',
  'shop.emptySlot': 'Nothing owned in this slot yet.',
  'shop.buyFree': 'BUY FREE',
  'shop.buy': 'BUY',
  'shop.need': 'NEED',
  'shop.more': 'MORE',

  'match.you': 'YOU',
  'match.rival': 'RIVAL',
  'match.cash': 'CASH',
  'match.held': 'HELD',
  'match.bust': 'BUST',
  'match.shares': 'SH',
  'match.buy': 'BUY',
  'match.sell': 'SELL',
  'match.short': 'SHORT',
  'match.noCash': 'NO CASH',
  'match.takeBack': 'TAKE THAT BACK',
  'match.abilityUsed': '{name} · USED',
  'match.paused': 'PAUSED',
  'match.resume': 'RESUME',
  'match.surrender': 'SURRENDER',

  'result.win': 'YOU WIN',
  'result.lose': 'YOU LOSE',
  'result.draw': 'DRAW',
  'result.bankrupt': 'BANKRUPT',
  'result.surrendered': 'SURRENDERED',
  'result.gap': '{league} · {mine} vs {theirs} · gap {gap}%',
  'result.winPay': 'WIN +{n}',
  'result.noWin': 'NO WIN',
  'result.gainPay': '+{n}% GAIN +{stars}',
  'result.unlocked': '{name} UNLOCKED',
  'result.yourResult': 'YOUR RESULT',
  'result.bestTrade': 'BEST TRADE',
  'result.worstTrade': 'WORST TRADE',
  'result.trades': 'TRADES',
  'result.closedInProfit': 'CLOSED IN PROFIT',
  'result.playAgain': 'PLAY AGAIN',
} as const;

export type Key = keyof typeof EN;

const RU: Record<Key, string> = {
  'common.back': 'НАЗАД',
  'common.cancel': 'ОТМЕНА',
  'common.menu': 'МЕНЮ',
  'common.none': 'НЕТ',
  'common.on': 'ВКЛ',
  'common.off': 'ВЫКЛ',

  'menu.play': 'ИГРАТЬ',
  'menu.shop': 'МАГАЗИН',
  'menu.equip': 'НАДЕТЬ',
  'menu.companies': 'КОМПАНИИ',
  'menu.nextUpgrade': 'СЛЕДУЮЩЕЕ · {n}/{of}',
  'menu.renovate': 'ОБНОВИТЬ?',
  'menu.free': 'ДАРОМ',
  'menu.roomComplete': 'КОМНАТА ГОТОВА',

  'settings.title': 'НАСТРОЙКИ',
  'settings.help': 'СПРАВКА',
  'settings.language': 'ЯЗЫК',
  'settings.close': 'ЗАКРЫТЬ',

  'help.title': 'КАК ИГРАТЬ',
  'help.match':
    '80 секунд. Ты и соперник торгуете одними и теми же тремя акциями. Побеждает тот, у кого к финалу больше капитал — деньги плюс позиции. На свистке позиции закрываются сами, так что успевать продать не нужно.',
  'help.companies':
    'Три компании меняются от матча к матчу, и у каждой свой характер: одна держит тренд, другая замирает на несколько секунд, третья растёт до самого обвала. КОМПАНИИ в меню хранят всех, кого ты встречал, и что каждая делает.',
  'help.quarters':
    'Год идёт четырьмя кварталами, они отчёркнуты на графике. Некоторые компании показывают свой фокус только на закрытии квартала — следи за линией, когда оно проходит.',
  'help.trading':
    'BUY открывает лонг, одно нажатие вкладывает четверть твоих денег. SELL закрывает лонг, а если ничего нет — открывает шорт, и тогда ты зарабатываешь на падении. Крупные заявки двигают цену против тебя, так что соперник чувствует каждую твою сделку.',
  'help.entry':
    'Пунктир на графике — твоя средняя цена входа: лонг в плюсе выше неё, шорт ниже. За победу дают звёзды, и чем выше лига, тем больше. Набери достаточно побед в лиге — откроется следующая.',
  'help.gotIt': 'ПОНЯТНО',

  'leagues.title': 'ВЫБЕРИ ЛИГУ',
  'leagues.locked': 'ЗАКРЫТА',
  'leagues.winsToNext': '{n}/{of} ПОБЕД · ОТКРОЕТ {name}',
  'leagues.top': 'ВЕРШИНА ЛЕСТНИЦЫ',
  'leagues.win': 'ПОБЕДА',
  'leagues.gain': '+{n}% ПРИБЫЛИ',
  'leagues.winMoreIn': 'ЕЩЁ {n} ПОБЕД В {name}',
  'leagues.isOpen': '{name} ОТКРЫТА',
  'leagues.topLeague': 'ВЫСШАЯ ЛИГА · ПОБЕД: {n}',

  'board.title': 'ДОСКА НА СЕГОДНЯ',
  'board.nameYours': 'НАЗОВИ СВОИ ТРИ',
  'board.take': 'БЕРУ ЭТУ ДОСКУ',
  'board.reroll': 'ПЕРЕСДАТЬ',
  'board.pick': 'ВЫБРАТЬ',
  'board.pin': 'ВСЕГДА',
  'board.ban': 'НИКОГДА',
  'board.pickMore': 'ВЫБЕРИ ЕЩЁ {n}',
  'board.noRerolls': 'ПЕРЕСДАЧ НЕТ',
  'board.rerollN': 'ПЕРЕСДАТЬ · {n}',
  'board.pickYourOwn': 'ВЫБРАТЬ САМОМУ',
  'board.tradesAt': 'Торгуется по {price}.',
  'board.always': 'ВСЕГДА {name}',
  'board.never': 'НИКОГДА {name}',

  'versus.searching': 'ИЩЕМ СОПЕРНИКА',

  'archive.empty':
    'Пока пусто. Сюда попадает каждая компания, с которой ты доиграл матч.',
  'archive.everyLeague': 'В КАЖДОЙ ЛИГЕ',
  'archive.andUp': '{name} И ВЫШЕ',
  'archive.unknown': 'НЕИЗВЕСТНО',
  'archive.listsAt': 'ЦЕНА ОТ {price}',

  'shop.tryingOn': 'ПРИМЕРКА',
  'shop.worn': 'НАДЕТО',
  'shop.owned': 'ЕСТЬ',
  'shop.wear': 'НАДЕТЬ',
  'shop.wearing': 'НАДЕТО',
  'shop.buyFirst': 'СНАЧАЛА КУПИ {rarity}',
  'shop.emptySlot': 'В этом слоте пока ничего нет.',
  'shop.buyFree': 'ВЗЯТЬ ДАРОМ',
  'shop.buy': 'КУПИТЬ',
  'shop.need': 'НУЖНО ЕЩЁ',
  'shop.more': '',

  'match.you': 'ТЫ',
  'match.rival': 'СОПЕРНИК',
  'match.cash': 'КЭШ',
  'match.held': 'В ПОЗИЦИЯХ',
  'match.bust': 'БАНКРОТ',
  'match.shares': 'ШТ',
  'match.buy': 'КУПИТЬ',
  'match.sell': 'ПРОДАТЬ',
  'match.short': 'ШОРТ',
  'match.noCash': 'НЕТ ДЕНЕГ',
  'match.takeBack': 'ОТМЕНИТЬ СДЕЛКУ',
  'match.abilityUsed': '{name} · ПОТРАЧЕНО',
  'match.paused': 'ПАУЗА',
  'match.resume': 'ПРОДОЛЖИТЬ',
  'match.surrender': 'СДАТЬСЯ',

  'result.win': 'ПОБЕДА',
  'result.lose': 'ПОРАЖЕНИЕ',
  'result.draw': 'НИЧЬЯ',
  'result.bankrupt': 'БАНКРОТСТВО',
  'result.surrendered': 'СДАЛСЯ',
  'result.gap': '{league} · {mine} против {theirs} · разрыв {gap}%',
  'result.winPay': 'ПОБЕДА +{n}',
  'result.noWin': 'БЕЗ ПОБЕДЫ',
  'result.gainPay': '+{n}% ПРИБЫЛИ +{stars}',
  'result.unlocked': '{name} ОТКРЫТА',
  'result.yourResult': 'ТВОЙ РЕЗУЛЬТАТ',
  'result.bestTrade': 'ЛУЧШАЯ СДЕЛКА',
  'result.worstTrade': 'ХУДШАЯ СДЕЛКА',
  'result.trades': 'СДЕЛОК',
  'result.closedInProfit': 'ЗАКРЫТО В ПЛЮС',
  'result.playAgain': 'ЕЩЁ РАЗ',
};

const TABLES: Record<Lang, Record<Key, string>> = { en: EN, ru: RU };

/** `{name}` in the string is replaced by `vars.name`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = TABLES[current][key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/* ------------------------------------------------------------ the content */

/**
 * Russian for text that lives in the data files. The English is whatever the
 * data says, so only one language is written twice here.
 */
const RU_DATA: Record<string, string> = {
  /* ---- leagues ---- */
  'league.bronze.name': 'БРОНЗОВАЯ ЯМА',
  'league.bronze.blurb': 'Заходит поздно, мелко и паникует. Заканчивает примерно там же, где начал.',
  'league.silver.name': 'СЕРЕБРЯНЫЙ ЗАЛ',
  'league.silver.blurb': 'Берёт только то, чего не заметить нельзя, и сидит в позиции слишком долго.',
  'league.gold.name': 'ЗОЛОТОЙ СТОЛ',
  'league.gold.blurb': 'Реагирует меньше чем за секунду и выходит, как только движение кончилось.',
  'league.global.name': 'ГЛОБАЛЬНЫЙ ФОНД',
  'league.global.blurb': 'Ловит почти каждый тренд и наваливается на него. Заканчивает около 16 000.',
  'league.crown.name': 'БЫЧЬЯ КОРОНА',
  'league.crown.blurb': 'Читает ленту раньше тебя. Обыграешь — считай, удвоил счёт.',

  /* ---- what a company is like ---- */
  'company.tet.tagline': 'Тяжёлая и медленная. Не торопится ни вверх, ни вниз.',
  'company.uranus.tagline': 'Самые широкие качели на доске, и никаких приличий.',
  'company.nova.tagline': 'Середина рынка. Ничего умного, ничего злого.',
  'company.compass.tagline':
    'Выбирает направление и держится его — семь раз из десяти, три хода подряд.',
  'company.brisket.tagline': 'Едят при любом рынке. Ниже 300 цена не печатается никогда.',
  'company.homestead.tagline': 'Страхование. Здесь ничего не происходит — за это и платят.',
  'company.tinbox.tagline': 'Тихо между обедами. Линия замирает на секунду-другую и стоит.',
  'company.postal.tagline':
    'Платит на каждом закрытии квартала, и цена проваливается ровно на выплату.',
  'company.arena.tagline': 'Замирает на несколько секунд, потом вспоминает, что торгуется.',
  'company.civic.tagline': 'Государственные деньги. Каждое полугодие тянет её обратно к 500.',
  'company.beacon.tagline':
    'Вечно в собственных газетах. Ломает новости о себе по нескольку раз за матч.',
  'company.granite.tagline': 'Дорого, скучно и с гарантией: ниже 800 цена не печатается.',
  'company.ember.tagline':
    'Жирная выплата: семь процентов долой на каждом закрытии, между ними отскребает назад.',
  'company.yeti.tagline':
    'Растёт девять тиков из десяти, потом отдаёт весь рост одним. И не отыгрывается.',
  'company.velvet.tagline':
    'Дорогая и спокойная — кроме закрытия квартала, где может сложиться вдвое.',
  'company.crampon.tagline':
    'Альпинистское снаряжение. Внутри квартала не отдаёт больше 18 % от своего пика, а на закрытии отметка сбрасывается.',
  'company.freight.tagline': 'Никаких фокусов и никаких тормозов: обычные правила, двойной норов.',
  'company.orchid.tagline':
    'Результат испытаний каждые несколько секунд, и на каждый — движение в полную силу.',
  'company.clockwork.tagline':
    'Держит направление так же, как IRON COMPASS, и качается при этом вдвое сильнее.',
  'company.saltcandle.tagline': 'Дёшево и упрямо. Ниже 200 не пойдёт и почти не пробует.',
  'company.halo.tagline':
    'Стартовое окно на каждом закрытии квартала, и примерно раз в восемь матчей она в него уходит.',
  'company.tulip.tagline':
    'Медленный пузырь. Растёт дольше, чем YETI COIN, и приземляется так же жёстко.',
  'company.ironwood.tagline':
    'Проверенные аудитом деньги. Оба полугодия оттаскивают её назад к 900.',
  'company.garage.tagline':
    'Застряла в подвале. Каждое закрытие квартала — маленький шанс выбраться оттуда навсегда.',
  'company.meridian.tagline':
    'Государственная железная дорога. Оба полугодия возвращают её к 1200, что бы ни было между ними.',
  'company.obsidian.tagline':
    'Самое дорогое имя на доске и самый долгий путь вниз, когда на нём закрывается квартал.',
  'company.highwater.tagline':
    'Держит свой максимум весь квартал: 16 % от пика и ни процентом ниже, пока закрытие не сотрёт отметку.',
  'company.kraken.tagline':
    'Разлив, патент, иск. Каждые несколько секунд на ней что-нибудь ломается.',

  /* ---- what kind of company it is ---- */
  'trait.plain.label': 'ОБЫЧНАЯ',
  'trait.locked.label': 'В ТРЕНДЕ',
  'trait.regulated.label': 'ПОД НАДЗОРОМ',
  'trait.bubble.label': 'ПУЗЫРЬ',
  'trait.stall.label': 'РЫВКАМИ',
  'trait.floor.label': 'С ПОДДЕРЖКОЙ',
  'trait.moonshot.label': 'ДАЛЬНИЙ ВЫСТРЕЛ',
  'trait.luxury.label': 'ЛЮКС',
  'trait.dividend.label': 'ПЛАТИТ',
  'trait.headline.label': 'В НОВОСТЯХ',
  'trait.ratchet.label': 'ХРАПОВИК',

  /* The badge on a match row has one line and no room to spare, so these are
     the short forms and they stay short in Russian too. */
  'trait.plain.short': 'ОБЫЧН',
  'trait.locked.short': 'ТРЕНД',
  'trait.regulated.short': 'НАДЗОР',
  'trait.bubble.short': 'ПУЗЫРЬ',
  'trait.stall.short': 'ЗАМИРА',
  'trait.floor.short': 'ПОЛ',
  'trait.moonshot.short': 'ВЫСТРЕЛ',
  'trait.luxury.short': 'ЛЮКС',
  'trait.dividend.short': 'ДИВ',
  'trait.headline.short': 'НОВОСТИ',
  'trait.ratchet.short': 'ДЕРЖИТ',

  /* ---- the room ---- */
  'room.bg': 'СТЕНЫ И ПОЛ',
  'room.bed': 'КРОВАТЬ',
  'room.door': 'ДВЕРЬ',
  'room.window': 'ОКНО',
  'room.table': 'СТОЛ',
  'room.shelf': 'ПОЛКА',
  'room.rug': 'КОВЁР',
  'room.picture': 'КАРТИНА',

  /* ---- the wardrobe: what each slot is for ---- */
  'slot.hat.label': 'ГОЛОВА',
  'slot.neck.label': 'ШЕЯ',
  'slot.torso.label': 'ТЕЛО',
  'slot.hand.label': 'РУКИ',
  'slot.access.label': 'ПРОЧЕЕ',
  'slot.hat.theme': 'КАКАЯ ДОСТАНЕТСЯ ДОСКА',
  'slot.neck.theme': 'ЧТО ТЫ УМЕЕШЬ, ОДИН РАЗ',
  'slot.torso.theme': 'НАСКОЛЬКО ПЛОХО МОЖЕТ СТАТЬ',
  'slot.hand.theme': 'СКОЛЬКО СТОИТ ТОРГОВАТЬ',
  'slot.access.theme': 'ЧТО ТЫ ЗНАЕШЬ',

  'rarity.common': 'ОБЫЧНОЕ',
  'rarity.uncommon': 'НЕОБЫЧНОЕ',
  'rarity.rare': 'РЕДКОЕ',
  'rarity.mythic': 'МИФИЧЕСКОЕ',
  'rarity.legend': 'ЛЕГЕНДАРНОЕ',

  /* ---- the wardrobe: the items ---- */
  'item.hat.common.name': 'БАНДАНА',
  'item.hat.common.text': 'Видно, какие три компании тебе достались, и можно отказаться.',
  'item.hat.uncommon.name': 'КЕПКА',
  'item.hat.uncommon.text': 'Раз за матч можно попросить другую тройку.',
  'item.hat.rare.name': 'КЕПКА ЯМЫ',
  'item.hat.rare.text': 'Дважды за матч. И одну компанию можно навсегда убрать из этой лиги.',
  'item.hat.mythic.name': 'КОЗЫРЁК',
  'item.hat.mythic.text': 'Назови компанию, которую хочешь видеть всегда, — она будет на доске.',
  'item.hat.legend.name': 'СТЕТСОН',
  'item.hat.legend.text': 'Все три компании выбираешь сам.',

  'item.neck.common.name': 'БЕЙДЖ',
  'item.neck.common.text': 'STATIC — пять секунд соперник не может открыть ничего нового.',
  'item.neck.uncommon.name': 'ГАЛСТУК',
  'item.neck.uncommon.text':
    'HALT — десять секунд никто не торгует тем, во что соперник вложен глубже всего. Ты тоже.',
  'item.neck.rare.name': 'ШЁЛК',
  'item.neck.rare.text': 'DOSSIER — до конца матча видно, что держит соперник.',
  'item.neck.mythic.name': 'БАБОЧКА',
  'item.neck.mythic.text': 'MARGIN CALL — закрывает все позиции соперника там, где они стоят.',
  'item.neck.legend.name': 'КУЛОН',
  'item.neck.legend.text':
    'RUMOUR — шесть секунд рынок двигает твою крупнейшую позицию в твою сторону.',

  'item.torso.common.name': 'ЖИЛЕТ',
  'item.torso.common.text': 'Торгуешь, пока не уйдёшь в минус на 500, а не до нуля.',
  'item.torso.uncommon.name': 'РУБАШКА',
  'item.torso.uncommon.text':
    'Обнулиться нельзя. Как бы плохо ни стало, десятая часть денег остаётся.',
  'item.torso.rare.name': 'КОСТЮМ',
  'item.torso.rare.text': 'То же самое, и раз за матч позиция в минусе на 15 % закрывается сама.',
  'item.torso.mythic.name': 'СМОКИНГ',
  'item.torso.mythic.text': 'Дважды за матч. И первая закрытая в убыток сделка возвращает половину.',
  'item.torso.legend.name': 'ПЕНСИЯ',
  'item.torso.legend.text':
    'Раз за матч можно отменить последнюю сделку по цене, по которой она прошла.',

  'item.hand.common.name': 'БЛОКНОТ',
  'item.hand.common.text': 'Торговля обходится на 15 % дешевле.',
  'item.hand.uncommon.name': 'ПЛАНШЕТ',
  'item.hand.uncommon.text': 'Торговля обходится на 30 % дешевле.',
  'item.hand.rare.name': 'ПАЧКА',
  'item.hand.rare.text':
    'Торговля обходится на 45 % дешевле, и крупная заявка меньше двигает цену против тебя.',
  'item.hand.mythic.name': 'ТРУБКА',
  'item.hand.mythic.text':
    'Торговля обходится на 60 % дешевле, и крупные заявки почти не двигают цену.',
  'item.hand.legend.name': 'ТЕРМИНАЛ',
  'item.hand.legend.text':
    'Торгуешь бесплатно, и выход из позиции никогда не проходит по худшей цене.',

  'item.access.common.name': 'ОЧКИ',
  'item.access.common.text': 'Каждая компания на ряду показывает, какого она типа.',
  'item.access.uncommon.name': 'ТЁМНЫЕ ОЧКИ',
  'item.access.uncommon.text':
    'Все три компании и что каждая делает — видно до того, как согласиться на матч.',
  'item.access.rare.name': 'ГАРНИТУРА',
  'item.access.rare.text': 'За три секунды до новости слышно, на какую компанию она выйдет.',
  'item.access.mythic.name': 'НАУШНИК',
  'item.access.mythic.text': 'Компания, которую держишь, подсказывает, куда собирается пойти.',
  'item.access.legend.name': 'ОРАКУЛ',
  'item.access.legend.text':
    'Следующие две секунды компании, которую держишь, дорисованы впереди линии.',
};

/**
 * The Russian for a piece of content, or the English the data file already has.
 * `i18n.test.ts` fails on a missing id, so this fallback catches a language the
 * game does not have yet, not a translation somebody forgot.
 */
export function tr(id: string, english: string): string {
  if (current === 'en') return english;
  return RU_DATA[id] ?? english;
}

/** Ids this file has Russian for, so a test can check nothing was missed. */
export const translatedIds = (): string[] => Object.keys(RU_DATA);
