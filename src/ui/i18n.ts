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

import { platform } from '../platform';

export type Lang = 'en' | 'ru';

export const LANGS: Lang[] = ['en', 'ru'];

/** What each language calls itself. Never translated — that is the point. */
export const LANG_NAME: Record<Lang, string> = { en: 'ENGLISH', ru: 'РУССКИЙ' };

/**
 * Where the chosen language lives. Exported because it is the one thing a
 * deleted account does NOT take with it: language is a setting of the device,
 * not of the player, and `wipe` in ui/store.ts is told to leave it alone.
 */
export const LANG_KEY = 'brokerstars.lang';
const KEY = LANG_KEY;

/**
 * The last resort, when nobody has chosen and the host has no idea either.
 *
 * English rather than Russian, and only because something has to be: this is
 * reached by a player whose device says nothing useful, and English is the one
 * a stranger is likeliest to read. It used to be the whole answer, which was
 * the wrong shape of answer — see `pickLang`.
 */
const DEFAULT_LANG: Lang = 'en';

/**
 * Which language to open in, given what is remembered and what the host says.
 *
 * Three sources in a deliberate order.
 *
 * A STORED CHOICE ALWAYS WINS. Somebody who tapped a language in settings has
 * said what they want, and no amount of cleverness about their device is worth
 * more than that — including on a phone whose locale disagrees with them.
 *
 * THEN THE HOST'S GUESS. Telegram knows because the player set a language in
 * Telegram; a browser and a WebView know because the device does. A guess, but
 * a good one, and the whole reason a fixed default was always wrong for
 * somebody: Russian greeted the world wrongly, English greets Russian speakers
 * wrongly, and this greets both.
 *
 * THEN `DEFAULT_LANG`, for a host that says nothing.
 *
 * Only the primary subtag is read — `ru-RU`, `ru_RU` and `ru` are one language,
 * and `pt-BR` is a language this game does not have either way.
 */
export function pickLang(stored: string | null, host: string): Lang {
  if (stored === 'ru' || stored === 'en') return stored;
  const tag = host.trim().toLowerCase().split(/[-_]/)[0];
  return (LANGS as string[]).includes(tag) ? (tag as Lang) : DEFAULT_LANG;
}

/** Private browsing and locked-down webviews throw on access, so never assume. */
function loadLang(): Lang {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    /* a store we cannot read is a player who has never chosen */
  }
  let host = '';
  try {
    host = platform().language();
  } catch {
    /* a host that throws being asked is a host with no opinion */
  }
  return pickLang(stored, host);
}

/**
 * Keep <html lang> honest. The page ships as `en` and the language is chosen
 * after it loads, so without this a browser looking at Russian text is told it
 * is English — and offers to translate a page that is already in the reader's
 * language. Guarded because the balance runner and the tests import this file
 * with no document around.
 */
function markDocument(l: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

let current: Lang = loadLang();
markDocument(current);

export const lang = (): Lang => current;

export function setLang(next: Lang): void {
  current = next;
  markDocument(next);
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
  'menu.archive': 'ARCHIVE',
  'menu.duel': 'DUEL',
  'menu.nextUpgrade': 'NEXT UPGRADE · {n}/{of}',
  'menu.renovate': 'RENOVATE?',
  'menu.free': 'FREE',
  'menu.roomComplete': 'ROOM COMPLETE',
  'menu.daily': 'DAILY',

  'daily.bonusTitle': 'DAILY BONUS',
  'daily.bonusReady': 'Yours for turning up. Come back tomorrow for the next one.',
  'daily.bonusBackIn': 'Taken today. Back in {time}.',
  'daily.inHours': '{h}h {m}m',
  'daily.inMinutes': '{m}m',
  'daily.questsTitle': 'TODAY’S QUESTS',
  'daily.collect': 'COLLECT +{n}',
  'daily.questsRoll': 'Three of these a day, drawn fresh at midnight. Whatever is not collected goes with them.',

  // Being called out to a duel by name, collected from the server rather than
  // pushed to the phone — see worker/src/calls.ts.
  'call.from': '{name} CALLS YOU OUT',
  'call.accept': 'DUEL',
  'call.ignore': 'NOT NOW',

  // Shown on the duel intro to a player whose hat earns them a look at the
  // board. A bot match gets a screen of its own; a duel has six seconds.
  'versus.board': 'TODAY’S THREE',

  // The welcome present, after a first finished match. Its name and what it
  // does come out of the catalogue through `tr`, so this file holds only the
  // sentences around them.
  'gift.title': 'A PRESENT',
  'gift.why': 'For finishing your first match. It is yours, and you are wearing it.',
  'gift.more':
    'Everything in the wardrobe does something. Five slots, five grades each — abilities, a bigger board, a softer landing when it goes wrong.',
  'gift.shop': 'SEE THE SHOP',
  'gift.later': 'LATER',

  'settings.title': 'SETTINGS',
  'settings.help': 'HOW TO PLAY',
  'settings.tutorial': 'WATCH THE TUTORIAL',
  'settings.language': 'LANGUAGE',
  'settings.account': 'ACCOUNT',
  'settings.close': 'CLOSE',

  // The Android build only. A mini app never asks any of this: Telegram has
  // already said who is playing by the time the game draws.
  'account.title': 'ACCOUNT',
  'account.out': 'NOT SIGNED IN',
  'account.why':
    'The game plays without one. Signing in is what keeps the board, duels, friends and your office when you change phone.',
  'account.signIn': 'SIGN IN WITH GOOGLE',
  'account.signOut': 'SIGN OUT',
  'account.working': 'ONE MOMENT…',
  'account.failed': 'That did not work. Try again in a moment.',
  'account.noserver': 'This build has no server to sign in to.',
  'account.refused': 'Google said no to that account.',
  'account.delete': 'DELETE ACCOUNT',
  'account.deleteAsk': 'DELETE EVERYTHING?',
  'account.deleteWhat':
    'Your office, your wardrobe, your coins, your shares, your friends and your place on the board. This cannot be undone and nothing is kept.',
  'account.deleteGo': 'YES, DELETE IT',
  'account.keep': 'KEEP IT',
  'account.deleteDone': 'Gone. The game starts over from here.',

  // One person, two ways in. Shown in Telegram as well as in the app: it is the
  // Telegram save that is being kept, so that is where a code is minted.
  'link.title': 'GOOGLE',
  'link.why':
    'Link a Google account and this office, this wardrobe and these coins are waiting in the Android app too. Nothing is copied — it is one game with two doors.',
  'link.get': 'GET A CODE',
  'link.codeIs': 'TYPE THIS IN THE ANDROID APP',
  'link.minutes': 'Good for ten minutes.',
  'link.copy': 'COPY THE CODE',
  'link.enter': 'CODE FROM TELEGRAM',
  'link.do': 'LINK',
  'link.linked': 'LINKED TO GOOGLE',
  'link.undo': 'UNLINK',
  'link.undone': 'Unlinked. This game stays where it is.',
  'link.err.nosuch': 'That code is not one of ours, or it has run out.',
  'link.err.self': 'That code came from this same account.',
  'link.err.busy':
    'This Google account already has a game of its own. Delete it first, above, and then link.',
  'link.err.already': 'One of these two is linked to something already.',
  'link.err.noserver': 'This build has no server to link through.',

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
    'Dashed line on the chart is your average entry: a long is in profit above it, a short below. Win a match to earn coins — the tougher the league, the bigger the payout. Bank enough wins in a league and the next one opens.',
  'help.gotIt': 'GOT IT',

  /* The guided tour of the main menu. What it points at, in what order, and
     why there is one at all: src/ui/tutorial.ts. */
  'tut.step': '{n}/{of}',
  'tut.skip': 'SKIP',
  'tut.next': 'NEXT',
  'tut.done': 'LET ME IN',

  'tut.welcome.title': 'WELCOME TO BROKER STARS',
  'tut.welcome.body':
    'This office is the whole game, and every part of it is a button on this screen. Here is what each one is for. The buttons are locked while we go round, so nothing can be tapped by mistake.',

  'tut.play.title': 'PLAY',
  'tut.play.body':
    'A match against a bot. Eighty seconds, three companies, and the bigger net worth at the whistle wins. You choose the league first: the harder it is, the more coins a win pays, and enough wins in one opens the next. HOW TO PLAY, behind the gear, covers the trading itself.',

  'tut.duel.title': 'DUEL · AGAINST A FRIEND',
  'tut.duel.body':
    'The same eighty seconds with a real person on the other side of them. It opens an invitation link — send it, your friend taps it and lands straight in your match, and from there you are both trading the same market tick for tick.',

  'tut.friends.title': 'FRIENDS',
  'tut.friends.body':
    'Everybody you have swapped a link with lives here. Tap a name to call them into a duel there and then, or to visit their office and see how far their renovation has got. Sending your own link from this screen is what puts the two of you on each other’s list.',

  'tut.money.title': 'TWO CURRENCIES',
  'tut.money.body':
    'Coins are won by playing, and they buy clothes and the renovation. Dollars are paid for turning up, and they buy shares in the companies you play against. They are never spent on the same thing, so neither one is behind the other.',

  'tut.daily.title': 'THE DAY',
  'tut.daily.body':
    'Your daily bonus in dollars, and three quests drawn fresh at midnight — play so many matches, win one, trade well. Whatever is not collected goes at midnight with them. The case lights up on its own when something is waiting behind it.',

  'tut.archive.title': 'ARCHIVE',
  'tut.archive.body':
    'Every company you have traded against is filed here with the habit it has: one commits to a trend, one goes dead for seconds at a time, one climbs until the day it doesn’t. Knowing which is which is worth real money at the desk. The awards you have collected are on the same shelf.',

  'tut.shares.title': 'THE SHARE COUNTER',
  'tut.shares.body':
    'The second tab of the archive is a market of its own, and the reason dollars exist. They buy real shares in any company you have met — one price a day for everybody, drawn at midnight, so you buy today and look tomorrow. Three orders a day, which makes a position a decision rather than a habit, and the DOLLARS ladder ranks everyone by what their book is worth.',

  'tut.shop.title': 'SHOP',
  'tut.shop.body':
    'Coins buy clothes: five slots, five grades each, from common up to legend. A slot has to be climbed in order, so the cheap thing is never wasted — it is the way to the dear one.',

  'tut.equip.title': 'EQUIP · CLOTHES ARE PERKS',
  'tut.equip.body':
    'This is the part to take seriously: what you wear changes the match itself. More starting cash, cheaper trading, a look at what the market is about to do, an ability to fire at your rival. Owning a garment does nothing on its own — it has to be worn, and only what is worn counts.',

  'tut.room.title': 'THE RENOVATION',
  'tut.room.body':
    'The other thing coins buy: seven upgrades that turn a bare office into a good one. This one is purely for the look of it — not a single number in a match moves. It is what friends see when they visit, and finishing it has an award on it, and that is the whole of what it is for.',

  'tut.rating.title': 'RATING',
  'tut.rating.body':
    'Two ladders: coins earned by playing, and what everybody’s share book is worth at today’s prices. Open the game from the bot and your own matches count towards them.',

  'tut.settings.title': 'AND THAT IS THE MENU',
  'tut.settings.body':
    'The gear holds the language and HOW TO PLAY, which is the eighty seconds themselves — what buying, selling and shorting actually do. This tour is behind the same button whenever you want it again. Good luck out there.',

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
  'versus.waitingFriend': 'WAITING FOR YOUR FRIEND',

  'duel.title': 'DUEL A FRIEND',
  'duel.opening': 'OPENING A DUEL…',
  'duel.joining': 'JOINING THE DUEL…',

  // Asked of a browser on an Android phone, where this invitation may belong in
  // an app instead. Nothing can look, so the question is put to the player.
  'duel.handover':
    'You are on Android. If you have Broker Stars installed, the duel is better played there — your account and your wardrobe are in it.',
  'duel.inApp': 'OPEN IN THE APP',
  'duel.here': 'PLAY HERE',
  'duel.waiting': 'WAITING FOR THEM TO ACCEPT',
  'duel.rivalIn': '{name} IS IN',
  'duel.board': 'BOARD · {name}',
  'duel.expires': 'GOOD FOR {mm}:{ss}',
  'duel.how':
    'Send the link to a friend. It opens the bot, and the button there drops them straight into this match. Fifteen minutes and the invitation is dead — open another one, it costs nothing.',
  'duel.send': 'SEND TO A FRIEND',
  'duel.copy': 'COPY THE LINK',
  /* The third way off the duel screen, for the player who has nobody to send
     a link to: the bot says it in the game's own chat instead. */
  'duel.shout': 'CALL IT OUT IN THE CHAT',
  'duel.shouted': 'THE CHAT HAS BEEN TOLD',
  'duel.shoutWait': 'The chat heard from you a few minutes ago. Send the link yourself, or ask again shortly.',
  'duel.shoutFailed': 'Could not reach the chat. The link above still works.',
  'duel.copied': 'COPIED',
  'duel.invited': 'INVITATION SENT TO {name}',
  'duel.notInvited': '{name} COULD NOT BE MESSAGED — SEND THEM THE LINK YOURSELF',
  'duel.inviteText': 'Eighty seconds, three companies, one of us. Broker Stars — the link is good for 15 minutes.',
  'duel.reconnecting': 'RECONNECTING…',
  'duel.rivalGone': 'YOUR RIVAL DROPPED — THE MARKET DOES NOT WAIT',
  'duel.rivalBack': 'YOUR RIVAL IS BACK',
  'duel.err.notfound': 'THAT DUEL IS NOT THERE ANY MORE.',
  'duel.err.expired': 'THAT INVITATION HAS RUN OUT. ASK FOR ANOTHER.',
  'duel.err.full': 'SOMEBODY ELSE TOOK THAT SEAT.',
  // Was "open the game from the bot", written when Telegram was the only way
  // to be anybody. Guests mean this is now rare and no longer about Telegram:
  // it is a server that would not vouch for anybody at all.
  'duel.err.badsig': 'COULD NOT WORK OUT WHO YOU ARE. REOPEN THE GAME AND TRY AGAIN.',
  'duel.err.noserver': 'THE SERVER IS NOT SET UP FOR DUELS.',
  'duel.err.started': 'THAT DUEL IS ALREADY UNDER WAY.',
  'duel.err.nolink': 'THE SERVER COULD NOT NAME ITS BOT, SO THERE IS NO LINK TO SEND.',
  'duel.err.net': 'COULD NOT REACH THE DUEL.',

  'archive.empty': 'Nothing filed yet. Every company you trade against goes on this shelf.',
  'archive.everyLeague': 'EVERY LEAGUE',
  'archive.andUp': '{name} AND UP',
  'archive.unknown': 'UNKNOWN',
  'archive.listsAt': 'LISTS AT {price}',
  'archive.tabCompanies': 'COMPANIES',
  'archive.tabPortfolio': 'PORTFOLIO',
  'archive.tabAchievements': 'AWARDS',
  'archive.achievementsSoon': 'The things worth doing that nobody asked you to. Still being decided.',

  /* The share counter. Coins buy hats; dollars buy a piece of the companies
     you have already played against — see src/market/protocol.ts. */
  'market.noPrices': 'No prices today. The counter is shut.',
  'market.youHold': 'YOU HOLD {n}, IN AT {avg}',
  'market.max': 'MAX',
  'market.buy': 'BUY',
  'market.sell': 'SELL',
  'market.ordersLeft': '{n} of {of} orders left today',
  'market.ordersDone': 'That is the last of today’s orders. Three more tomorrow.',
  'market.bookValue': 'YOUR BOOK',
  'market.sinceYesterday': 'SINCE YESTERDAY',
  'market.cash': 'CASH',
  'market.sharesAt': '{n} at {avg}',
  'market.boughtToday': 'TRADED TODAY',
  'market.bookEmpty': 'Nothing bought yet. Open a company you have met and take a piece of it.',
  'market.pricesRoll': 'One price a day, drawn at midnight. Buy today, come back tomorrow and see what it did.',

  /* The leaderboard names itself once and the main menu reads the same key, so
     the button and the screen it opens can never drift apart. */
  'rating.title': 'RATING',
  'rating.tabCoins': 'COINS',
  'rating.tabDollars': 'DOLLARS',
  'rating.header': 'COINS EARNED',
  /* Not "dollars held": the board ranks cash plus shares at today's price, so
     buying something cannot cost anybody their place. See worker/src/board.ts. */
  'rating.headerDollars': 'WORTH AT THE COUNTER',
  'rating.inShares': '{n} in shares',
  'rating.allCash': 'all in cash',
  'rating.matches': 'MATCHES',
  'rating.loading': 'LOADING',
  'rating.offline': 'The board is not answering. Your coins are safe — they are kept on this device too.',
  'rating.noServer': 'This build has no board behind it.',
  'rating.empty': 'Nobody has finished a match yet. Be first.',
  'rating.onlyInTelegram': 'Open the game in Telegram and your own matches will count.',

  /* The friends menu names itself once and the round button on the main screen
     reads the same key, exactly as the rating pair above does. */
  'friends.title': 'FRIENDS',
  'friends.loading': 'LOADING',
  'friends.offline': 'The list is not answering. Try again in a moment.',
  // Same correction as duel.err.badsig: a friends list no longer needs
  // Telegram, it needs a server that will say who is asking — and a guest
  // session is enough for that everywhere.
  'friends.noServer': 'No server behind this build, so there is no list to keep.',
  'friends.emptyTitle': 'NOBODY YET',
  'friends.empty': 'Send somebody the link below. When they tap it you will both be on each other’s list.',
  'friends.add': 'ADD A FRIEND',

  // The card above that button. `{coins}` is what each side gets and
  // `{matches}` how many the friend must finish first -- both come from the
  // server, so neither is spelled out here.
  'invite.title': 'INVITE A FRIEND — {coins} COINS EACH',
  'invite.how': 'Paid to both of you once they have finished {matches} matches.',
  'invite.done': 'All of them claimed. Friends still pay in duels.',

  // Asked when an invitation to be somebody's friend is opened in a browser on
  // an Android phone. The reason it is asked BEFORE the code is redeemed is in
  // `canHandOver`: redeeming it here spends it on this page's guest account.
  'invite.handover':
    'Somebody wants to be your friend. If you have Broker Stars installed, add them in the app — that is where your account and your coins are.',
  'invite.here': 'ADD THEM HERE',
  'friends.added': 'YOU TWO ARE FRIENDS NOW',
  'friends.inviteText': 'Be my friend in Broker Stars — eighty seconds, three companies, and a table with both our names on it.',
  'friends.err.nosuch': 'THAT CODE DOES NOT BELONG TO ANYBODY.',
  'friends.err.yourself': 'THAT IS YOUR OWN CODE. GIVE IT TO SOMEBODY ELSE.',
  'friends.err.full': 'ONE OF YOU HAS AS MANY FRIENDS AS THE LIST HOLDS.',
  'friends.err.nolink': 'THE SERVER COULD NOT NAME ITS BOT, SO THERE IS NO LINK TO SEND.',
  // Typing a code instead of following a link. The only way in for a player
  // whose phone cannot be handed an invitation — see src/platform/android.ts.
  'friends.yourCode': 'YOUR CODE',
  'friends.enterCode': 'OR TYPE A FRIEND’S CODE',
  'friends.codeHint': 'CODE',
  'friends.addCode': 'ADD',

  'friends.visit': 'VISIT',
  'friends.roomAt': 'ROOM · {n}/{of}',
  /* Under the list, and the answer to the one thing this screen cannot fix on
     its own: a player with nobody has nobody to send their link to. */
  'friends.chatPitch': 'Nobody to play against? The game has a chat. People there are looking for a duel too — and a link sent in it comes back with a friend.',
  'friends.chatJoin': 'JOIN THE CHAT',

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
  // The row where an ability would be, for a trader wearing nothing round the
  // neck. Two of them, because the useful half of the sentence is different
  // when the thing is already bought and merely left in the wardrobe.
  /* ------------------------------------------------------------ the day */

  // One pair per quest in `src/daily/protocol.ts`, keyed the way the awards
  // are and read the same way (`questKey` in DailyScreen.tsx). `{n}` is the
  // catalogue's own goal, so the row cannot promise a number the counter is
  // not measured against.
  'quest.play-3.name': 'SHOW UP',
  'quest.play-3.text': 'Play {n} matches today.',
  'quest.play-5.name': 'A LONG SESSION',
  'quest.play-5.text': 'Play {n} matches today.',
  'quest.win-1.name': 'TAKE ONE',
  'quest.win-1.text': 'Win a match today.',
  'quest.win-2.name': 'TAKE TWO',
  'quest.win-2.text': 'Win {n} matches today.',
  'quest.gain.name': 'TRADE WELL',
  'quest.gain.text': 'Clear the profit bar in a match today.',
  'quest.trades-20.name': 'BUSY HANDS',
  'quest.trades-20.text': 'Make {n} trades today.',
  'quest.nw-15k.name': 'A GOOD EVENING',
  'quest.nw-15k.text': 'Finish a match holding {n}.',
  'quest.no-bust-3.name': 'STILL STANDING',
  'quest.no-bust-3.text': 'Finish {n} matches today without going broke.',
  'quest.duel-1.name': 'CALL SOMEBODY',
  'quest.duel-1.text': 'Play a duel today. Losing one still counts.',
  'quest.duel-win.name': 'SETTLE IT',
  'quest.duel-win.text': 'Win a duel today.',

  /* ---------------------------------------------------------------- awards */

  'award.group.money': 'ON THE WHISTLE',
  'award.group.duel': 'AGAINST PEOPLE',
  'award.group.league': 'THE LADDER',
  'award.group.style': 'THE GOOD LIFE',
  'award.group.secret': 'FOUND, NOT AIMED AT',
  // The four ladder awards are named after the league itself, so only the line
  // underneath is written here — see `awardName` in ArchiveScreen.tsx.
  'award.leaguePlayed': 'Play a match here.',
  'award.secretLeft': '{n} STILL OUT THERE',
  'award.secretHint': 'Not things to aim at. Things that happen to you.',
  'award.noServer': 'The shelf is kept on the server, and this game has none behind it.',

  'award.nw-20k.name': 'A BIG DAY',
  'award.nw-20k.text': 'Finish a match holding {n}.',
  'award.nw-30k.name': 'HOT HAND',
  'award.nw-30k.text': 'Finish a match holding {n}.',
  'award.nw-50k.name': 'THEY TALK ABOUT YOU',
  'award.nw-50k.text': 'Finish a match holding {n}.',
  'award.nw-75k.name': 'CLOSED THE YEAR',
  'award.nw-75k.text': 'Finish a match holding {n}. Nobody has yet.',

  'award.duel-1.name': 'FIRST BLOOD',
  'award.duel-1.text': 'Beat somebody who was actually there.',
  'award.duel-3.name': 'THREE FRIENDS',
  'award.duel-3.text': 'Win {n} duels.',
  'award.duel-10.name': 'NOBODY CALLS ANY MORE',
  'award.duel-10.text': 'Win {n} duels.',

  'award.dressed.name': 'DRESSED',
  'award.dressed.text': 'Own something in all five slots.',
  'award.legend-item.name': 'THE REAL THING',
  'award.legend-item.text': 'Take one slot all the way to legend.',
  'award.room-done.name': 'HOME',
  'award.room-done.text': 'Finish every last step of the renovation.',

  'award.bust.name': 'THAT IS THAT',
  'award.bust.text': 'You went broke.',
  'award.honest-loss.name': 'AT LEAST IT WAS HONEST',
  'award.honest-loss.text': 'You cleared the profit bar and lost anyway.',
  'award.pyrrhic.name': 'A PYRRHIC ONE',
  'award.pyrrhic.text': 'You won with less than you sat down with.',
  'award.no-trades.name': 'HANDS IN POCKETS',
  'award.no-trades.text': 'You won without making a single trade.',
  'award.streak-3.name': 'A RUN',
  'award.streak-3.text': 'You won three in a row.',
  'award.all-companies.name': 'THE WHOLE MARKET',
  'award.all-companies.text': 'You have met every company in the game.',

  'match.abilityNone': 'NOTHING TO USE · BUY A NECK ITEM',
  'match.abilityOff': 'NOTHING TO USE · WEAR YOUR NECK ITEM',
  'match.paused': 'PAUSED',
  'match.stillRunning': 'THE MARKET IS STILL RUNNING',
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
  'result.gainPay': '+{n}% GAIN +{coins}',
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
  'menu.archive': 'АРХИВ',
  'menu.duel': 'ДУЭЛЬ',
  'menu.nextUpgrade': 'СЛЕДУЮЩЕЕ · {n}/{of}',
  'menu.renovate': 'ОБНОВИТЬ?',
  'menu.free': 'ДАРОМ',
  'menu.roomComplete': 'КОМНАТА ГОТОВА',
  'menu.daily': 'ДЕНЬ',

  'daily.bonusTitle': 'ЕЖЕДНЕВНЫЙ БОНУС',
  'daily.bonusReady': 'Просто за то, что зашёл. Завтра будет ещё один.',
  'daily.bonusBackIn': 'Сегодня уже забран. Вернётся через {time}.',
  'daily.inHours': '{h} ч {m} мин',
  'daily.inMinutes': '{m} мин',
  'daily.questsTitle': 'ЗАДАНИЯ НА СЕГОДНЯ',
  'daily.collect': 'ЗАБРАТЬ +{n}',
  'daily.questsRoll':
    'Три штуки в день, новые каждую полночь. Что не забрал — уйдёт вместе с ними.',

  'call.from': '{name} ЗОВЁТ НА ДУЭЛЬ',
  'call.accept': 'ПРИНЯТЬ',
  'call.ignore': 'НЕ СЕЙЧАС',

  'versus.board': 'СЕГОДНЯШНЯЯ ТРОЙКА',

  'gift.title': 'ПОДАРОК',
  'gift.why': 'За первый доигранный матч. Он твой, и он уже надет.',
  'gift.more':
    'В гардеробе всё что-нибудь умеет. Пять слотов, по пять уровней — способности, доска побольше, мягкая посадка, когда всё пошло не так.',
  'gift.shop': 'В МАГАЗИН',
  'gift.later': 'ПОТОМ',

  'settings.title': 'НАСТРОЙКИ',
  'settings.help': 'СПРАВКА',
  'settings.tutorial': 'ПОСМОТРЕТЬ ТУТОРИАЛ',
  'settings.language': 'ЯЗЫК',
  'settings.account': 'АККАУНТ',
  'settings.close': 'ЗАКРЫТЬ',

  'account.title': 'АККАУНТ',
  'account.out': 'ВХОД НЕ ВЫПОЛНЕН',
  'account.why':
    'Играть можно и так. Вход нужен, чтобы рейтинг, дуэли, друзья и кабинет остались при смене телефона.',
  'account.signIn': 'ВОЙТИ ЧЕРЕЗ GOOGLE',
  'account.signOut': 'ВЫЙТИ',
  'account.working': 'СЕКУНДУ…',
  'account.failed': 'Не получилось. Попробуй ещё раз чуть позже.',
  'account.noserver': 'В этой сборке некуда входить — сервер не настроен.',
  'account.refused': 'Google не пропустил этот аккаунт.',
  'account.delete': 'УДАЛИТЬ АККАУНТ',
  'account.deleteAsk': 'УДАЛИТЬ ВСЁ?',
  'account.deleteWhat':
    'Кабинет, гардероб, монеты, акции, друзья и место в таблице. Отменить это нельзя, и ничего не сохранится.',
  'account.deleteGo': 'ДА, УДАЛИТЬ',
  'account.keep': 'ОСТАВИТЬ',
  'account.deleteDone': 'Готово. Игра начинается заново.',

  'link.title': 'GOOGLE',
  'link.why':
    'Привяжи аккаунт Google — и этот кабинет, этот гардероб и эти монеты будут ждать тебя в Android-приложении. Ничего не копируется: это одна игра с двумя входами.',
  'link.get': 'ПОЛУЧИТЬ КОД',
  'link.codeIs': 'ВВЕДИ ЭТОТ КОД В ПРИЛОЖЕНИИ',
  'link.minutes': 'Годен десять минут.',
  'link.copy': 'СКОПИРОВАТЬ КОД',
  'link.enter': 'КОД ИЗ TELEGRAM',
  'link.do': 'ПРИВЯЗАТЬ',
  'link.linked': 'АККАУНТ GOOGLE ПРИВЯЗАН',
  'link.undo': 'ОТВЯЗАТЬ',
  'link.undone': 'Отвязано. Эта игра остаётся на месте.',
  'link.err.nosuch': 'Такого кода нет, или он уже истёк.',
  'link.err.self': 'Этот код выдан этому же аккаунту.',
  'link.err.busy':
    'У этого аккаунта Google уже есть своя игра. Сначала удалите её кнопкой выше, потом привязывайте.',
  'link.err.already': 'Один из двух аккаунтов уже к чему-то привязан.',
  'link.err.noserver': 'В этой сборке нет сервера, через который можно связать.',

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
    'Пунктир на графике — твоя средняя цена входа: лонг в плюсе выше неё, шорт ниже. За победу дают монеты, и чем выше лига, тем больше. Набери достаточно побед в лиге — откроется следующая.',
  'help.gotIt': 'ПОНЯТНО',

  'tut.step': '{n}/{of}',
  'tut.skip': 'ПРОПУСТИТЬ',
  'tut.next': 'ДАЛЕЕ',
  'tut.done': 'НАЧАТЬ ИГРАТЬ',

  'tut.welcome.title': 'ДОБРО ПОЖАЛОВАТЬ В BROKER STARS',
  'tut.welcome.body':
    'Этот офис — вся игра, и каждая её часть спрятана за кнопкой на этом экране. Сейчас покажу, зачем нужна каждая. Пока идёт обучение, кнопки заблокированы — случайно ничего не нажмётся.',

  'tut.play.title': 'ИГРАТЬ',
  'tut.play.body':
    'Матч против бота. Восемьдесят секунд, три компании, побеждает тот, у кого к финалу больше капитал. Сначала выбираешь лигу: чем она сложнее, тем больше монет за победу, а набрав достаточно побед — откроешь следующую. Как торговать, подробно написано в СПРАВКЕ под шестерёнкой.',

  'tut.duel.title': 'ДУЭЛЬ · ИГРА С ДРУГОМ',
  'tut.duel.body':
    'Те же восемьдесят секунд, но с живым человеком напротив. Игра выдаёт ссылку-приглашение: отправь её другу, он нажмёт — и попадёт прямо в твой матч. Дальше вы оба торгуете на одном и том же рынке, тик в тик.',

  'tut.friends.title': 'ДРУЗЬЯ',
  'tut.friends.body':
    'Здесь все, с кем ты обменялся ссылкой. Нажми на имя — можно тут же позвать человека на дуэль или зайти к нему в гости и посмотреть, как далеко у него зашёл ремонт. Своя ссылка отсюда же: друг перейдёт по ней, и вы окажетесь в списках друг у друга.',

  'tut.money.title': 'ДВЕ ВАЛЮТЫ',
  'tut.money.body':
    'Монеты зарабатываются игрой и тратятся на одежду и ремонт. Доллары дают просто за то, что ты зашёл, и на них покупают акции тех самых компаний, против которых играешь. Они никогда не тратятся на одно и то же, так что одно другому не мешает.',

  'tut.daily.title': 'ДЕНЬ',
  'tut.daily.body':
    'Ежедневный бонус в долларах и три задания, новые каждую полночь: сыграть столько-то матчей, выиграть, хорошо оторговать. Что не забрал — уходит вместе с ними в полночь. Кейс сам загорается, когда за ним что-то есть.',

  'tut.archive.title': 'АРХИВ',
  'tut.archive.body':
    'Каждая компания, против которой ты играл, попадает сюда вместе со своей повадкой: одна держит тренд, другая замирает на несколько секунд, третья растёт до самого обвала. Знать, кто есть кто, стоит вполне реальных денег за столом. Там же полка с наградами.',

  'tut.shares.title': 'БИРЖА · ПОКУПКА АКЦИЙ',
  'tut.shares.body':
    'Вторая вкладка архива — отдельный рынок, ради которого доллары и придуманы. На них покупаются настоящие акции любой встреченной компании: одна цена в день на всех, новая в полночь, — купил сегодня, посмотрел завтра. Три заявки в сутки, поэтому позиция — это решение, а не привычка. А рейтинг ДОЛЛАРЫ считает, сколько стоит твой портфель.',

  'tut.shop.title': 'МАГАЗИН',
  'tut.shop.body':
    'На монеты покупается одежда: пять слотов, в каждом пять ступеней — от обычной до легендарной. Слот идёт только по порядку, так что дешёвая вещь не выброшенные деньги, а дорога к дорогой.',

  'tut.equip.title': 'НАДЕТЬ · ОДЕЖДА ДАЁТ ПЕРКИ',
  'tut.equip.body':
    'Вот это стоит воспринимать всерьёз: то, что на тебе надето, меняет сам матч. Больше стартовых денег, дешевле сделки, подсказки о том, куда пойдёт рынок, способность, которую можно применить против соперника. Просто купить вещь мало — она работает, только пока надета, и считается только надетое.',

  'tut.room.title': 'РЕМОНТ',
  'tut.room.body':
    'Второе, на что уходят монеты: семь улучшений, которые превращают пустой офис в приличный. Это чистая красота — в матче от него не меняется ни одна цифра. Его видят друзья, когда заходят в гости, а за полностью законченный ремонт дают награду. Больше он ни для чего.',

  'tut.rating.title': 'РЕЙТИНГ',
  'tut.rating.body':
    'Две таблицы: заработанные игрой монеты и то, сколько стоит портфель акций по сегодняшним ценам. Открой игру из бота — и твои матчи начнут в них попадать.',

  'tut.settings.title': 'ВОТ И ВСЁ МЕНЮ',
  'tut.settings.body':
    'Под шестерёнкой — язык и СПРАВКА про сами восемьдесят секунд: что делают покупка, продажа и шорт. Это обучение живёт за той же кнопкой — можно пересмотреть в любой момент. Удачи за столом.',

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
  'versus.waitingFriend': 'ЖДЁМ ДРУГА',

  'duel.title': 'ДУЭЛЬ С ДРУГОМ',
  'duel.opening': 'ОТКРЫВАЕМ ДУЭЛЬ…',
  'duel.joining': 'ПОДКЛЮЧАЕМСЯ К ДУЭЛИ…',

  'duel.handover':
    'У тебя Андроид. Если Broker Stars установлен, дуэль лучше играть там — твой аккаунт и гардероб в нём.',
  'duel.inApp': 'ОТКРЫТЬ В ПРИЛОЖЕНИИ',
  'duel.here': 'ИГРАТЬ ЗДЕСЬ',
  'duel.waiting': 'ЖДЁМ, ПОКА ОН ПРИМЕТ',
  'duel.rivalIn': '{name} НА МЕСТЕ',
  'duel.board': 'ДОСКА · {name}',
  'duel.expires': 'ДЕЙСТВУЕТ {mm}:{ss}',
  'duel.how':
    'Отправь ссылку другу. Она открывает бота, а кнопка там заводит его прямо в этот матч. Через пятнадцать минут приглашение мертво — откроешь новое, это ничего не стоит.',
  'duel.send': 'ОТПРАВИТЬ ДРУГУ',
  'duel.shout': 'ПОЗВАТЬ В ЧАТЕ',
  'duel.shouted': 'ОТПРАВЛЕНО В ЧАТ',
  'duel.shoutWait':
    'Ты звал в чат пару минут назад. Отправь ссылку сам или попробуй чуть позже.',
  'duel.shoutFailed': 'Не получилось написать в чат. Ссылка выше по-прежнему работает.',
  'duel.copy': 'СКОПИРОВАТЬ ССЫЛКУ',
  'duel.copied': 'СКОПИРОВАНО',
  'duel.invited': 'ПРИГЛАШЕНИЕ УШЛО К {name}',
  'duel.notInvited': '{name} НЕ ПОЛУЧАЕТ СООБЩЕНИЙ ОТ БОТА — ОТПРАВЬ ССЫЛКУ САМ',
  'duel.inviteText': 'Восемьдесят секунд, три компании, один из нас. Broker Stars — ссылка живёт 15 минут.',
  'duel.reconnecting': 'ПЕРЕПОДКЛЮЧАЕМСЯ…',
  'duel.rivalGone': 'СОПЕРНИК ОТВАЛИЛСЯ — РЫНОК НЕ ЖДЁТ',
  'duel.rivalBack': 'СОПЕРНИК ВЕРНУЛСЯ',
  'duel.err.notfound': 'ЭТОЙ ДУЭЛИ БОЛЬШЕ НЕТ.',
  'duel.err.expired': 'ПРИГЛАШЕНИЕ ИСТЕКЛО. ПОПРОСИ НОВОЕ.',
  'duel.err.full': 'МЕСТО УЖЕ ЗАНЯЛИ.',
  'duel.err.badsig': 'НЕ ВЫШЛО ПОНЯТЬ, КТО ТЫ. ПЕРЕОТКРОЙ ИГРУ И ПОПРОБУЙ СНОВА.',
  'duel.err.noserver': 'СЕРВЕР НЕ НАСТРОЕН НА ДУЭЛИ.',
  'duel.err.started': 'ЭТА ДУЭЛЬ УЖЕ ИДЁТ.',
  'duel.err.nolink': 'СЕРВЕР НЕ СМОГ НАЗВАТЬ СВОЕГО БОТА, ОТПРАВЛЯТЬ НЕЧЕГО.',
  'duel.err.net': 'НЕ ДОБРАЛИСЬ ДО ДУЭЛИ.',

  'archive.empty':
    'Пока пусто. Сюда попадает каждая компания, с которой ты доиграл матч.',
  'archive.everyLeague': 'В КАЖДОЙ ЛИГЕ',
  'archive.andUp': '{name} И ВЫШЕ',
  'archive.unknown': 'НЕИЗВЕСТНО',
  'archive.listsAt': 'ЦЕНА ОТ {price}',
  'archive.tabCompanies': 'КОМПАНИИ',
  'archive.tabPortfolio': 'ПОРТФЕЛЬ',
  'archive.tabAchievements': 'НАГРАДЫ',
  'archive.achievementsSoon': 'То, что стоит сделать, хотя никто не просил. Пока решаем, что именно.',

  'market.noPrices': 'Сегодня без котировок. Стойка закрыта.',
  'market.youHold': 'У ВАС {n}, СРЕДНЯЯ {avg}',
  'market.max': 'МАКС',
  'market.buy': 'КУПИТЬ',
  'market.sell': 'ПРОДАТЬ',
  'market.ordersLeft': 'Сегодня осталось заявок: {n} из {of}',
  'market.ordersDone': 'Заявки на сегодня кончились. Завтра будет ещё три.',
  'market.bookValue': 'ВАШ ПОРТФЕЛЬ',
  'market.sinceYesterday': 'СО ВЧЕРА',
  'market.cash': 'НАЛИЧНЫЕ',
  'market.sharesAt': '{n} шт по {avg}',
  'market.boughtToday': 'СДЕЛКА СЕГОДНЯ',
  'market.bookEmpty': 'Пока ничего не куплено. Откройте знакомую компанию и возьмите кусок.',
  'market.pricesRoll': 'Одна цена в день, новая в полночь. Купите сегодня — завтра зайдите и посмотрите, что вышло.',

  'rating.title': 'РЕЙТИНГ',
  'rating.tabCoins': 'МОНЕТЫ',
  'rating.tabDollars': 'ДОЛЛАРЫ',
  'rating.header': 'МОНЕТ ЗАРАБОТАНО',
  'rating.headerDollars': 'КАПИТАЛ НА СТОЙКЕ',
  'rating.inShares': '{n} в акциях',
  'rating.allCash': 'всё в наличных',
  'rating.matches': 'МАТЧЕЙ',
  'rating.loading': 'ЗАГРУЖАЕМ',
  'rating.offline': 'Таблица не отвечает. Монеты не потеряны — они хранятся и на этом устройстве.',
  'rating.noServer': 'В этой сборке таблицы нет.',
  'rating.empty': 'Никто ещё не доиграл ни одного матча. Будь первым.',
  'rating.onlyInTelegram': 'Открой игру в Telegram, и твои матчи начнут считаться.',

  'friends.title': 'ДРУЗЬЯ',
  'friends.loading': 'ЗАГРУЖАЕМ',
  'friends.offline': 'Список не отвечает. Попробуй через минуту.',
  'friends.noServer': 'За этой сборкой нет сервера, так что и списка нет.',
  'friends.emptyTitle': 'ПОКА НИКОГО',
  'friends.empty': 'Отправь кому-нибудь ссылку снизу. Он нажмёт — и вы оба окажетесь в списках друг у друга.',
  'friends.add': 'ДОБАВИТЬ ДРУГА',

  'invite.title': 'ПРИГЛАСИ ДРУГА — ПО {coins} МОНЕТ',
  'invite.how': 'Оба получите, когда он доиграет {matches} матча.',
  'invite.done': 'Все приглашения исчерпаны. Друзья всё ещё платят в дуэлях.',

  'invite.handover':
    'Тебя зовут в друзья. Если Broker Stars установлен, добавь в приложении — твой аккаунт и монеты там.',
  'invite.here': 'ДОБАВИТЬ ЗДЕСЬ',
  'friends.added': 'ТЕПЕРЬ ВЫ ДРУЗЬЯ',
  'friends.inviteText': 'Давай дружить в Broker Stars — восемьдесят секунд, три компании и таблица, где стоят оба наших имени.',
  'friends.err.nosuch': 'ТАКОГО КОДА НИ У КОГО НЕТ.',
  'friends.err.yourself': 'ЭТО ТВОЙ СОБСТВЕННЫЙ КОД. ДАЙ ЕГО КОМУ-НИБУДЬ.',
  'friends.err.full': 'У КОГО-ТО ИЗ ВАС ДРУЗЕЙ СТОЛЬКО, СКОЛЬКО ВМЕЩАЕТ СПИСОК.',
  'friends.err.nolink': 'СЕРВЕР НЕ СМОГ НАЗВАТЬ СВОЕГО БОТА, ТАК ЧТО ССЫЛКИ НЕТ.',
  'friends.yourCode': 'ТВОЙ КОД',
  'friends.enterCode': 'ИЛИ ВВЕДИ КОД ДРУГА',
  'friends.codeHint': 'КОД',
  'friends.addCode': 'ДОБАВИТЬ',

  'friends.visit': 'ПОСЕТИТЬ',
  'friends.chatPitch':
    'Не с кем играть? У игры есть чат. Там такие же ищут соперника — а ссылка, отправленная туда, возвращается с другом.',
  'friends.chatJoin': 'ВСТУПИТЬ В ЧАТ',
  'friends.roomAt': 'КОМНАТА · {n}/{of}',

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
  'quest.play-3.name': 'ПРИЙТИ',
  'quest.play-3.text': 'Сыграй сегодня {n} матча.',
  'quest.play-5.name': 'ДОЛГИЙ ВЕЧЕР',
  'quest.play-5.text': 'Сыграй сегодня {n} матчей.',
  'quest.win-1.name': 'ВЗЯТЬ СВОЁ',
  'quest.win-1.text': 'Выиграй сегодня матч.',
  'quest.win-2.name': 'ВЗЯТЬ ДВАЖДЫ',
  'quest.win-2.text': 'Выиграй сегодня {n} матча.',
  'quest.gain.name': 'ХОРОШО ПОТОРГОВАТЬ',
  'quest.gain.text': 'Возьми сегодня планку по прибыли в матче.',
  'quest.trades-20.name': 'БЕЗ ПЕРЕРЫВА',
  'quest.trades-20.text': 'Соверши сегодня {n} сделок.',
  'quest.nw-15k.name': 'ХОРОШИЙ ВЕЧЕР',
  'quest.nw-15k.text': 'Закончи матч с капиталом {n}.',
  'quest.no-bust-3.name': 'НА НОГАХ',
  'quest.no-bust-3.text': 'Закончи сегодня {n} матча, ни разу не разорившись.',
  'quest.duel-1.name': 'ПОЗВАТЬ ДРУГА',
  'quest.duel-1.text': 'Сыграй сегодня дуэль. Проигранная тоже считается.',
  'quest.duel-win.name': 'РАЗОБРАТЬСЯ',
  'quest.duel-win.text': 'Выиграй сегодня дуэль.',

  'award.group.money': 'НА СВИСТКЕ',
  'award.group.duel': 'ПРОТИВ ЛЮДЕЙ',
  'award.group.league': 'ЛЕСТНИЦА',
  'award.group.style': 'ХОРОШАЯ ЖИЗНЬ',
  'award.group.secret': 'НЕ ЦЕЛИЛСЯ, А НАШЁЛ',
  'award.leaguePlayed': 'Сыграть здесь матч.',
  'award.secretLeft': 'ЕЩЁ {n} НЕ НАЙДЕНО',
  'award.secretHint': 'Это не цели. Это то, что с тобой случается.',
  'award.noServer': 'Полка живёт на сервере, а у этой сборки его нет.',

  'award.nw-20k.name': 'БОЛЬШОЙ ДЕНЬ',
  'award.nw-20k.text': 'Закончить матч с капиталом {n}.',
  'award.nw-30k.name': 'ПОШЛА КАРТА',
  'award.nw-30k.text': 'Закончить матч с капиталом {n}.',
  'award.nw-50k.name': 'О ТЕБЕ ГОВОРЯТ',
  'award.nw-50k.text': 'Закончить матч с капиталом {n}.',
  'award.nw-75k.name': 'ЗАКРЫЛ ГОД',
  'award.nw-75k.text': 'Закончить матч с капиталом {n}. Пока не удавалось никому.',

  'award.duel-1.name': 'ПЕРВАЯ КРОВЬ',
  'award.duel-1.text': 'Обыграть того, кто и правда был по ту сторону.',
  'award.duel-3.name': 'ТРОЕ ДРУЗЕЙ',
  'award.duel-3.text': 'Выиграть {n} дуэли.',
  'award.duel-10.name': 'НИКТО БОЛЬШЕ НЕ ЗВОНИТ',
  'award.duel-10.text': 'Выиграть {n} дуэлей.',

  'award.dressed.name': 'ОДЕТ',
  'award.dressed.text': 'Занять все пять слотов.',
  'award.legend-item.name': 'НАСТОЯЩАЯ ВЕЩЬ',
  'award.legend-item.text': 'Довести один слот до легенды.',
  'award.room-done.name': 'ДОМ',
  'award.room-done.text': 'Закончить ремонт до последнего шага.',

  'award.bust.name': 'ВОТ И ВСЁ',
  'award.bust.text': 'Ты обанкротился.',
  'award.honest-loss.name': 'ЗАТО ЧЕСТНО',
  'award.honest-loss.text': 'Ты взял планку прибыли и всё равно проиграл.',
  'award.pyrrhic.name': 'ПИРРОВА',
  'award.pyrrhic.text': 'Ты выиграл, имея меньше, чем сел за стол.',
  'award.no-trades.name': 'РУКИ В КАРМАНАХ',
  'award.no-trades.text': 'Ты выиграл, не совершив ни одной сделки.',
  'award.streak-3.name': 'СЕРИЯ',
  'award.streak-3.text': 'Ты выиграл три матча подряд.',
  'award.all-companies.name': 'ВЕСЬ РЫНОК',
  'award.all-companies.text': 'Ты встретил все компании в игре.',

  'match.abilityNone': 'НЕЧЕГО ПРИМЕНИТЬ · КУПИ ВЕЩЬ НА ШЕЮ',
  'match.abilityOff': 'НЕЧЕГО ПРИМЕНИТЬ · НАДЕНЬ ВЕЩЬ НА ШЕЮ',
  'match.paused': 'ПАУЗА',
  'match.stillRunning': 'РЫНОК ПРОДОЛЖАЕТ ИДТИ',
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
  'result.gainPay': '+{n}% ПРИБЫЛИ +{coins}',
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
  'league.bronze.name': 'БРОНЗОВЫЙ РЯД',
  'league.bronze.blurb': 'Заходит поздно, мелко и паникует. Заканчивает примерно там же, где начал.',
  'league.silver.name': 'СЕРЕБРЯНЫЙ ЗАЛ',
  'league.silver.blurb': 'Берёт только то, чего не заметить нельзя, и сидит в позиции слишком долго.',
  'league.gold.name': 'ЗОЛОТОЙ СТОЛ',
  'league.gold.blurb': 'Реагирует меньше чем за секунду и выходит, как только движение кончилось.',
  'league.global.name': 'МИРОВОЙ ФОНД',
  'league.global.blurb': 'Ловит почти каждый тренд и наваливается на него. Заканчивает около 16 000.',
  'league.crown.name': 'КОРОНА БЫКА',
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
  'room.window': 'ОКНО',
  'room.table': 'СТОЛ',
  'room.comp': 'КОМПЬЮТЕР',
  'room.shelf': 'ШКАФ',
  'room.picture_1': 'ПЛАКАТ',
  'room.picture_2': 'ВТОРОЙ ПЛАКАТ',

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
