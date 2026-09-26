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
  'menu.archive': 'MARKET',
  'menu.duel': 'DUEL',
  'menu.nextUpgrade': 'NEXT UPGRADE · {n}/{of}',
  'menu.renovate': 'RENOVATE?',
  'menu.free': 'FREE',
  'menu.roomComplete': 'ROOM COMPLETE',
  /**
   * What the step pays, and it is deliberately the word START rather than a
   * bare number: the gain is cash on the table at the opening bell of every
   * match from now on, not a one-off and not a coin balance.
   */
  'menu.roomCash': '+${n} STARTING CASH',
  'menu.roomCashTotal': '+${n} TO EVERY MATCH',
  'menu.daily': 'DAILY',

  'daily.bonusTitle': 'DAILY BONUS',
  'daily.bonusReady': 'Yours for turning up. Come back tomorrow for the next one.',
  'daily.bonusBackIn': 'Taken today. Back in {time}.',
  /** What the same tap collects, once there are shares to collect it from. */
  'daily.bonusSplit': '{bonus} for turning up · {div} from your shares.',
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

  'profile.title': 'PROFILE',
  // The career, in the six numbers the server has been keeping all along and
  // has never shown anybody in one place.
  'profile.wins': 'WINS',
  'profile.duelWins': 'DUELS WON',
  'profile.best': 'BEST BOOK',
  'profile.league': 'HIGHEST LEAGUE',
  'profile.earned': 'COINS EARNED',
  'profile.met': 'COMPANIES MET',
  'profile.awards': 'AWARDS',
  'profile.friendsN': '{n} on the list',
  // Before the list has been asked for, or in a build with no server to ask.
  'profile.friendsUnknown': 'Who you know, and the link that adds one',

  'settings.title': 'SETTINGS',
  'settings.help': 'HOW TO PLAY',
  'settings.tutorial': 'WATCH THE TUTORIAL',
  'settings.language': 'LANGUAGE',
  'settings.soundOn': 'SOUND: ON',
  'settings.soundOff': 'SOUND: OFF',
  'settings.account': 'ACCOUNT',
  'settings.feedback': 'FEEDBACK',

  /**
   * WHAT THIS DELIBERATELY DOES NOT SAY: where the message goes. The server
   * carries it to the developer over Telegram today and will carry it to
   * brokerstarsupport@gmail.com when there is a sender for one
   * (`worker/src/feedback.ts`). Naming the channel here would be either a lie
   * now or a string to rewrite later; "we read all of it" survives the change,
   * and is the part the player actually wants to know.
   */
  'feedback.lead':
    'A bug, an idea, something that reads wrong in your language — write it here. Every one of these is read. Leave an address if you want an answer: without one there is nowhere to send it.',
  'feedback.placeholder': 'What happened, or what should be different…',
  /**
   * Short enough to fit its own field at 16px, which the sentence it used to be
   * was not — it was cut off mid-word on a 375pt screen. What it lost is in
   * `feedback.lead` above, where there is room for prose.
   */
  'feedback.replyTo': 'EMAIL FOR A REPLY',
  'feedback.send': 'SEND',
  'feedback.sending': 'SENDING…',
  'feedback.sent': 'Sent. Thank you — this is how the game gets fixed.',
  'feedback.err.noserver': 'No connection. Try again in a moment.',
  'feedback.err.empty': 'The box is empty.',
  'feedback.err.short': 'A little more than that, so it can be acted on.',
  'feedback.err.long': 'Too long — shorten it a little.',
  'feedback.err.wait': 'Just sent one. Try again in {n} s.',
  'feedback.err.refused': 'This message cannot be sent.',
  'feedback.err.failed': 'It did not go. Your text is still here — try again.',

  'settings.privacy': 'PRIVACY POLICY',
  'settings.close': 'CLOSE',

  // A name of one's own, in the account drawer.
  'nick.change': 'CHANGE YOUR NAME',
  'nick.what':
    'What other players will call you. {min} to {max} characters: letters, digits, spaces and . - _ &',
  'nick.placeholder': 'YOUR NAME',
  'nick.save': 'TAKE IT',
  'nick.badname': 'NOT A NAME THIS GAME WILL SHOW.',
  'nick.taken': 'SOMEBODY HAS THAT NAME.',
  'nick.renamed': 'A NAME IS CHANGED ONCE A WEEK. NOT YET.',
  'nick.busy': 'THAT DID NOT GO THROUGH. TRY AGAIN.',
  /** The wall a package below `MIN_BUILD` puts up. See `ui/update.ts`. */
  'update.title': 'TIME TO UPDATE',
  'update.body': 'This version of the game can no longer play. The new one is waiting in the store.',
  'update.go': 'GET THE NEW ONE',

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



  'tut.duel.title': 'PLAY · DUEL',
  'tut.duel.body':
    'PLAY is eighty seconds against a bot. DUEL is the same match against a person — you send them a link.',

  'tut.friends.title': 'YOUR PROFILE',
  'tut.friends.body':
    'Your awards, what you have won, and the friends you can call in for a game.',

  'tut.money.title': 'TWO CURRENCIES',
  'tut.money.body':
    'Coins are won in matches and buy clothes and the office. Dollars come from the daily case.',



  'tut.shares.title': 'THE MARKET',
  'tut.shares.body':
    'Every company you have played against, and the counter where dollars buy real shares in them.',


  'tut.equip.title': 'CLOTHES ARE PERKS',
  'tut.equip.body':
    'They change the match itself: cheaper trading, a floor under a ruined book, a look at the board. Only what you wear counts.',

  'tut.room.title': 'THE OFFICE',
  'tut.room.body':
    '7 upgrades, +25 cash at the first and +175 at the last. A finished office opens every match 700 up.',



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

  // Shown to whoever accepted, while the object holds the whistle for a host
  // who is not looking at their screen. The countdown is how long that lasts.
  'duel.holding': 'WAITING FOR {name}',
  'duel.holdingNote':
    'They are probably still in the chat they sent this from. The market opens either way when the count runs out.',

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
  /* The other way in: the friend opened a duel first and sent the code. */
  'duel.codeHint': 'FRIEND’S CODE OR LINK',
  'duel.join': 'JOIN',
  'duel.ownCode': 'That is your own invitation. Send it to a friend — or enter the one they sent you.',
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
  'market.bookValue': 'YOUR BOOK',
  'market.sinceYesterday': 'SINCE YESTERDAY',
  'market.cash': 'CASH',
  'market.paysDaily': 'SHARES PAY',
  'market.rowPays': '{n} A DAY',
  'market.pays': 'PAYS {pct}% A DAY · {n} ON THAT MANY',
  'market.paysNothing': 'PAYS NOTHING — THIS ONE PAYS IN THE PRICE',
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

  /* ---------------------------------------------------- the corporations */

  /* The screen names itself once and the round button on the main screen reads
     the same key, exactly as the rating and friends pairs above do.

     A corporation's own NAME, TAG and MOTTO are never translated. They are
     what a player typed, like a company ticker — and the alphabet they are
     allowed in (`src/corp/protocol.ts`) is the same in both languages. */
  'corp.title': 'CORPORATIONS',
  'corp.loading': 'LOADING',
  'corp.offline': 'Not answering. Try again in a moment.',
  'corp.noServer': 'No server behind this build, so there are no corporations.',

  // The empty screen: no corporation, and the two ways out of it.
  'corp.noneTitle': 'NO CORPORATION',
  'corp.none':
    'Up to {max} traders under one name, ranked on what the average one earns in a month. Join one, or start your own — it costs nothing.',
  'corp.search': 'NAME OR TAG',
  'corp.found': 'NOTHING BY THAT NAME',
  'corp.create': 'FOUND ONE',
  'corp.join': 'JOIN',
  'corp.ask': 'ASK TO JOIN',
  'corp.fullMark': 'FULL',
  'corp.closedMark': 'CLOSED',
  'corp.membersOf': '{n}/{max}',
  'corp.unranked': 'UNRANKED',
  'corp.place': '#{n}',

  // The card a row opens into, before anybody is in anything.
  'corp.cardTraders': 'TRADERS',
  'corp.cardCoins': 'COINS A SEASON',
  'corp.cardDollars': 'DOLLARS A SEASON',
  'corp.cardAverage': 'Per trader, averaged over the season — not the total.',
  'corp.cardClosed': 'This one is joined by asking. The owner decides.',
  'corp.joinSure': 'JOIN {name}?',
  'corp.askSure': 'ASK TO JOIN {name}?',
  'corp.joinWhy': 'One corporation at a time. If you leave, the next one has to wait a day.',

  // Founding one.
  'corp.newTitle': 'FOUND A CORPORATION',
  'corp.name': 'NAME',
  'corp.tag': 'TAG',
  'corp.motto': 'MOTTO',
  'corp.mottoHint': 'OPTIONAL',
  // Choosing a mark and a colour. Both are closed sets, and the heading over
  // the second half of the grid is what stops a company's mark from reading as
  // an accident.
  'corp.emblem': 'MARK AND COLOUR',
  'corp.emblemOwn': 'MARKS',
  'corp.emblemCompanies': 'COMPANY MARKS',

  'corp.policy': 'WHO CAN JOIN',
  'corp.policyOpen': 'ANYBODY',
  'corp.policyClosed': 'BY REQUEST',
  /* The alphabet, said plainly rather than as a rule. It is the one piece of
     this feature a player runs into without being told, and "letters and
     numbers" is the whole of it — the reason (there is nobody here to moderate
     a name) is not the player's problem. */
  'corp.letters': 'Letters, digits, spaces and . - _ & — {min}–{max} characters.',
  'corp.tagLetters': '{min}–{max} characters, no spaces.',
  'corp.found2': 'FOUND IT',

  // Being in one.
  'corp.membersTitle': 'TRADERS',
  'corp.feedTitle': 'WHAT HAS BEEN HAPPENING',
  'corp.feedEmpty': 'Nothing yet. Play a match, or call somebody out.',
  'corp.seasonEnds': 'SEASON ENDS IN {time}',
  'corp.inDays': '{d}d {h}h',
  'corp.thisSeason': 'THIS SEASON',
  'corp.coinRank': 'COINS · {place}',
  'corp.dollarRank': 'DOLLARS · {place}',
  'corp.table': 'THE TABLE',
  'corp.callOut': 'CALL A DUEL',
  'corp.invite': 'INVITE SOMEBODY',
  'corp.inviteText':
    'Join my corporation in Broker Stars. Thirty traders, one table, one month to climb it.',
  'corp.yourCode': 'INVITATION CODE',
  // Not `duel.copy`, which says LINK: this is a code, and a button that offers
  // a link and hands over eight characters is a button that lied.
  'corp.copyCode': 'COPY THE CODE',
  'corp.enterCode': 'OR TYPE A CODE',
  'corp.leave': 'LEAVE',
  'corp.leaveSure': 'LEAVE? YOUR SEASON STAYS BEHIND.',
  'corp.owner': 'OWNER',
  'corp.you': 'YOU',

  // What the owner can do. All of it behind one button, because none of it is
  // done often and all of it is dangerous.
  'corp.manage': 'MANAGE',
  'corp.rename': 'RENAME',
  'corp.renameWait': 'RENAMED RECENTLY · AGAIN IN {time}',
  'corp.kick': 'REMOVE',
  'corp.transfer': 'MAKE OWNER',
  'corp.disband': 'DISBAND',
  'corp.disbandSure': 'DISBAND? EVERYBODY LOSES THE SEASON.',
  'corp.requests': 'WAITING AT THE DOOR',
  'corp.accept': 'LET IN',
  'corp.refuse': 'NO',
  'corp.save': 'SAVE',

  // The feed. One line per kind, and the game is the only thing that writes
  // them — there is no free text in this feature at all.
  'corp.feed.joined': '{who} JOINED',
  'corp.feed.left': '{who} LEFT',
  'corp.feed.league': '{who} REACHED {what}',
  'corp.feed.award': '{who} EARNED {what}',
  'corp.feed.duel': '{who} WANTS A DUEL',
  'corp.feed.duelYours': 'YOUR DUEL IS OPEN',
  'corp.feed.taken': 'TAKEN BY {who}',
  'corp.feed.join': 'SIT DOWN',
  'corp.feed.left2': '{time} LEFT',

  // The table of corporations, which is its own screen with two tabs.
  'corp.topTitle': 'CORPORATIONS',
  'corp.tabCoins': 'COINS',
  'corp.tabDollars': 'DOLLARS',
  /* The heading says AVERAGE out loud, because the number under it is the one
     thing about this table somebody will otherwise get wrong. */
  'corp.headCoins': 'COINS PER TRADER THIS MONTH',
  'corp.headDollars': 'DOLLARS PER TRADER THIS MONTH',
  'corp.topEmpty': 'No corporation has {min} traders in it yet. Found one.',
  'corp.topWhy':
    'The average, not the total — a corporation of thirty does not beat one of five by being thirty. Under {min} traders it is not in the table. Earned dollars only: nothing bought counts.',

  // What can go wrong, in the one sentence the screen draws.
  'corp.err.nosuch': 'THERE IS NO CORPORATION BY THAT NAME.',
  'corp.err.full': 'THAT ONE IS FULL.',
  'corp.err.already': 'YOU ARE ALREADY IN ONE.',
  'corp.err.notmember': 'YOU ARE NOT IN A CORPORATION.',
  'corp.err.notowner': 'ONLY THE OWNER CAN DO THAT.',
  'corp.err.badname': 'NOT A NAME THIS GAME WILL SHOW.',
  'corp.err.taken': 'SOMEBODY HAS THAT NAME.',
  'corp.err.renamed': 'RENAMED TOO RECENTLY.',
  'corp.err.cooldown': 'YOU LEFT A CORPORATION TODAY. TRY AGAIN IN {time}.',
  'corp.err.closed': 'ASKED. THE OWNER DECIDES.',
  'corp.err.pending': 'ALREADY ASKED. THE OWNER DECIDES.',
  'corp.err.gone': 'SOMEBODY TOOK THAT DUEL FIRST.',
  'corp.err.busy': 'SOMEBODY CHANGED IT WHILE YOU WERE LOOKING. TRY AGAIN.',
  'corp.err.noserver': 'NO SERVER BEHIND THIS BUILD.',

  'shop.tryingOn': 'TRYING ON',
  'shop.worn': 'WORN',
  'shop.owned': 'OWNED',
  'shop.wear': 'WEAR',
  'shop.wearing': 'WEARING',
  'duel.shoutSignIn':
    'Sign in under SETTINGS · ACCOUNT to have the bot call your duel out in the group chat.',
  'shop.today': 'FIVE A DAY · NEW STOCK AT MIDNIGHT',
  'shop.cleanedOut': 'BOUGHT THE LOT · NEW STOCK AT MIDNIGHT',
  'shop.comeBack': "Today's shelf is all yours. Come back tomorrow.",
  'shop.nothingOwned': 'Nothing bought yet. The shop has five things a day.',
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
  /* What DOSSIER opens: the rival's holding in one company, under its card. */
  'match.rivalHolds': 'RIVAL {n}',
  'match.buy': 'BUY',
  'match.sell': 'SELL',
  'match.short': 'SHORT',
  'match.noCash': 'NO CASH',
  /* Why a trade button is dead when it is not money: HALT froze the company, or
     STATIC is stopping anything new being opened. */
  'match.frozen': 'FROZEN',
  'match.jammed': 'JAMMED',
  /* The headline banner over the chart, and the headset's warning before it. */
  'match.breaking': '{name}: BREAKING',
  'match.headlineSoon': '{name}: SOMETHING IS COMING',
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
  'menu.archive': 'РЫНОК',
  'menu.duel': 'ДУЭЛЬ',
  'menu.nextUpgrade': 'СЛЕДУЮЩЕЕ · {n}/{of}',
  'menu.renovate': 'ОБНОВИТЬ?',
  'menu.free': 'ДАРОМ',
  'menu.roomComplete': 'КОМНАТА ГОТОВА',
  'menu.roomCash': '+${n} К СТАРТУ',
  'menu.roomCashTotal': '+${n} К СТАРТУ КАЖДОГО МАТЧА',
  'menu.daily': 'ДЕНЬ',

  'daily.bonusTitle': 'ЕЖЕДНЕВНЫЙ БОНУС',
  'daily.bonusReady': 'Просто за то, что зашёл. Завтра будет ещё один.',
  'daily.bonusBackIn': 'Сегодня уже забран. Вернётся через {time}.',
  'daily.bonusSplit': '{bonus} за приход · {div} с ваших акций.',
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

  'profile.title': 'ПРОФИЛЬ',
  'profile.wins': 'ПОБЕД',
  'profile.duelWins': 'ПОБЕД В ДУЭЛЯХ',
  'profile.best': 'ЛУЧШИЙ КАПИТАЛ',
  'profile.league': 'ВЫСШАЯ ЛИГА',
  'profile.earned': 'МОНЕТ ЗАРАБОТАНО',
  'profile.met': 'ВСТРЕЧЕНО КОМПАНИЙ',
  'profile.awards': 'НАГРАДЫ',
  'profile.friendsN': 'в списке: {n}',
  'profile.friendsUnknown': 'Кого ты знаешь и ссылка, которая добавит ещё',

  'settings.title': 'НАСТРОЙКИ',
  'settings.help': 'СПРАВКА',
  'settings.tutorial': 'ПОСМОТРЕТЬ ТУТОРИАЛ',
  'settings.language': 'ЯЗЫК',
  'settings.soundOn': 'ЗВУК: ВКЛ',
  'settings.soundOff': 'ЗВУК: ВЫКЛ',
  'settings.account': 'АККАУНТ',
  'settings.feedback': 'ОБРАТНАЯ СВЯЗЬ',
  'feedback.lead':
    'Баг, идея, криво переведённая фраза — напиши сюда. Это читают, все до одного. Оставь почту, если ждёшь ответа: без неё отвечать некуда.',
  'feedback.placeholder': 'Что случилось или что стоит сделать иначе…',
  'feedback.replyTo': 'ПОЧТА ДЛЯ ОТВЕТА',
  'feedback.send': 'ОТПРАВИТЬ',
  'feedback.sending': 'ОТПРАВЛЯЕМ…',
  'feedback.sent': 'Отправлено. Спасибо — так игра и чинится.',
  'feedback.err.noserver': 'Нет связи. Попробуй через минуту.',
  'feedback.err.empty': 'Поле пустое.',
  'feedback.err.short': 'Чуть подробнее, иначе с этим нечего делать.',
  'feedback.err.long': 'Слишком длинно — немного сократи.',
  'feedback.err.wait': 'Только что отправляли. Попробуй через {n} с.',
  'feedback.err.refused': 'Это сообщение отправить нельзя.',
  'feedback.err.failed': 'Не ушло. Текст на месте — попробуй ещё раз.',

  'settings.privacy': 'КОНФИДЕНЦИАЛЬНОСТЬ',
  'settings.close': 'ЗАКРЫТЬ',

  'nick.change': 'ИЗМЕНИТЬ НИКНЕЙМ',
  'nick.what':
    'Как вас будут звать другие игроки. От {min} до {max} символов: буквы, цифры, пробелы и . - _ &',
  'nick.placeholder': 'ВАШЕ ИМЯ',
  'nick.save': 'ЗАНЯТЬ',
  'nick.badname': 'ТАКОЕ ИМЯ ИГРА НЕ ПОКАЖЕТ.',
  'nick.taken': 'ТАКОЕ ИМЯ УЖЕ ЗАНЯТО.',
  'nick.renamed': 'ИМЯ МЕНЯЮТ РАЗ В НЕДЕЛЮ. ЕЩЁ РАНО.',
  'nick.busy': 'НЕ ПРОШЛО. ПОПРОБУЙТЕ ЕЩЁ РАЗ.',
  'update.title': 'ПОРА ОБНОВИТЬСЯ',
  'update.body': 'Эта версия игры больше не может играть. Новая уже лежит в магазине.',
  'update.go': 'ЗАБРАТЬ НОВУЮ',

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



  'tut.duel.title': 'ИГРАТЬ · ДУЭЛЬ',
  'tut.duel.body':
    'ИГРАТЬ — восемьдесят секунд против бота. ДУЭЛЬ — тот же матч против человека: ему отправляется ссылка.',

  'tut.friends.title': 'ТВОЙ ПРОФИЛЬ',
  'tut.friends.body':
    'Награды, что ты выиграл, и друзья, которых можно позвать играть.',

  'tut.money.title': 'ДВЕ ВАЛЮТЫ',
  'tut.money.body':
    'Монеты выигрываются в матчах и идут на одежду и ремонт. Доллары приходят из ежедневного кейса.',



  'tut.shares.title': 'РЫНОК',
  'tut.shares.body':
    'Все компании, против которых ты играл, и стойка, где на доллары покупаются их настоящие акции.',


  'tut.equip.title': 'ОДЕЖДА ДАЁТ ПЕРКИ',
  'tut.equip.body':
    'Она меняет сам матч: дешевле сделки, страховка от разорения, видно доску. Считается только надетое.',

  'tut.room.title': 'ОФИС',
  'tut.room.body':
    '7 улучшений: +25 к капиталу на первом и +175 на последнем. Законченный офис начинает каждый матч на 700 впереди.',



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

  'duel.holding': 'ЖДЁМ {name}',
  'duel.holdingNote':
    'Он, скорее всего, ещё в чате, откуда отправил вызов. Когда счёт закончится, рынок откроется в любом случае.',

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
  'duel.codeHint': 'КОД ИЛИ ССЫЛКА ДРУГА',
  'duel.join': 'ВОЙТИ',
  'duel.ownCode': 'Это твоё собственное приглашение. Отправь его другу — или введи то, что прислал он.',
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
  'market.bookValue': 'ВАШ ПОРТФЕЛЬ',
  'market.sinceYesterday': 'СО ВЧЕРА',
  'market.cash': 'НАЛИЧНЫЕ',
  'market.paysDaily': 'АКЦИИ ПЛАТЯТ',
  'market.rowPays': '{n} В ДЕНЬ',
  'market.pays': 'ПЛАТИТ {pct}% В ДЕНЬ · {n} ЗА СТОЛЬКО',
  'market.paysNothing': 'НЕ ПЛАТИТ — ЭТА ЗАРАБАТЫВАЕТ ЦЕНОЙ',
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

  /* ---------------------------------------------------- корпорации */

  'corp.title': 'КОРПОРАЦИИ',
  'corp.loading': 'ЗАГРУЗКА',
  'corp.offline': 'Не отвечает. Попробуй через минуту.',
  'corp.noServer': 'За этой сборкой нет сервера, так что нет и корпораций.',

  'corp.noneTitle': 'НЕТ КОРПОРАЦИИ',
  'corp.none':
    'До {max} трейдеров под одним именем. В таблице считается не сумма, а сколько зарабатывает средний за месяц. Вступи в чужую или основай свою — это бесплатно.',
  'corp.search': 'НАЗВАНИЕ ИЛИ ТЕГ',
  'corp.found': 'ТАКИХ НЕТ',
  'corp.create': 'ОСНОВАТЬ',
  'corp.join': 'ВСТУПИТЬ',
  'corp.ask': 'ПОДАТЬ ЗАЯВКУ',
  'corp.fullMark': 'МЕСТ НЕТ',
  'corp.closedMark': 'ПО ЗАЯВКЕ',
  'corp.membersOf': '{n}/{max}',
  'corp.unranked': 'ВНЕ ТАБЛИЦЫ',
  'corp.place': '#{n}',

  'corp.cardTraders': 'ТРЕЙДЕРОВ',
  'corp.cardCoins': 'МОНЕТ ЗА СЕЗОН',
  'corp.cardDollars': 'ДОЛЛАРОВ ЗА СЕЗОН',
  'corp.cardAverage': 'На трейдера, в среднем за сезон, — не сумма.',
  'corp.cardClosed': 'Сюда вступают по заявке. Решает владелец.',
  'corp.joinSure': 'ВСТУПИТЬ В {name}?',
  'corp.askSure': 'ПОДАТЬ ЗАЯВКУ В {name}?',
  'corp.joinWhy': 'Корпорация может быть только одна. Если выйти, следующей придётся ждать сутки.',

  'corp.newTitle': 'ОСНОВАТЬ КОРПОРАЦИЮ',
  'corp.name': 'НАЗВАНИЕ',
  'corp.tag': 'ТЕГ',
  'corp.motto': 'ДЕВИЗ',
  'corp.mottoHint': 'МОЖНО БЕЗ НЕГО',
  'corp.emblem': 'ЗНАК И ЦВЕТ',
  'corp.emblemOwn': 'ЗНАКИ',
  'corp.emblemCompanies': 'ЗНАКИ КОМПАНИЙ',

  'corp.policy': 'КТО МОЖЕТ ВСТУПИТЬ',
  'corp.policyOpen': 'ЛЮБОЙ',
  'corp.policyClosed': 'ПО ЗАЯВКЕ',
  // Про латиницу сказано прямо: это единственное место, где игрок упрётся в
  // правило, ничего о нём не зная, и «латиница и цифры» — весь ответ.
  'corp.letters': 'Буквы, цифры, пробелы и . - _ & — {min}–{max} символа.',
  'corp.tagLetters': '{min}–{max} символа, без пробелов.',
  'corp.found2': 'ОСНОВАТЬ',

  'corp.membersTitle': 'ТРЕЙДЕРЫ',
  'corp.feedTitle': 'ЧТО ПРОИСХОДИЛО',
  'corp.feedEmpty': 'Пока ничего. Сыграй матч или позови кого-нибудь на дуэль.',
  'corp.seasonEnds': 'СЕЗОН ЗАКАНЧИВАЕТСЯ ЧЕРЕЗ {time}',
  'corp.inDays': '{d}д {h}ч',
  'corp.thisSeason': 'ЗА СЕЗОН',
  'corp.coinRank': 'МОНЕТЫ · {place}',
  'corp.dollarRank': 'ДОЛЛАРЫ · {place}',
  'corp.table': 'ТАБЛИЦА',
  'corp.callOut': 'ПОЗВАТЬ НА ДУЭЛЬ',
  'corp.invite': 'ПОЗВАТЬ К СЕБЕ',
  'corp.inviteText':
    'Вступай в мою корпорацию в Broker Stars. Тридцать трейдеров, одна таблица и месяц, чтобы её взять.',
  'corp.yourCode': 'КОД ПРИГЛАШЕНИЯ',
  'corp.copyCode': 'СКОПИРОВАТЬ КОД',
  'corp.enterCode': 'ИЛИ ВВЕДИ КОД',
  'corp.leave': 'ВЫЙТИ',
  'corp.leaveSure': 'ВЫЙТИ? СЕЗОН ОСТАНЕТСЯ ЗДЕСЬ.',
  'corp.owner': 'ВЛАДЕЛЕЦ',
  'corp.you': 'ТЫ',

  'corp.manage': 'УПРАВЛЕНИЕ',
  'corp.rename': 'ПЕРЕИМЕНОВАТЬ',
  'corp.renameWait': 'НЕДАВНО ПЕРЕИМЕНОВАНА · СНОВА ЧЕРЕЗ {time}',
  'corp.kick': 'ИСКЛЮЧИТЬ',
  'corp.transfer': 'СДЕЛАТЬ ВЛАДЕЛЬЦЕМ',
  'corp.disband': 'РАСПУСТИТЬ',
  'corp.disbandSure': 'РАСПУСТИТЬ? СЕЗОН ПОТЕРЯЮТ ВСЕ.',
  'corp.requests': 'СТОЯТ У ДВЕРИ',
  'corp.accept': 'ВПУСТИТЬ',
  'corp.refuse': 'НЕТ',
  'corp.save': 'СОХРАНИТЬ',

  'corp.feed.joined': '{who} ВСТУПИЛ',
  'corp.feed.left': '{who} ВЫШЕЛ',
  'corp.feed.league': '{who} ДОБРАЛСЯ ДО {what}',
  'corp.feed.award': '{who} ПОЛУЧИЛ НАГРАДУ {what}',
  'corp.feed.duel': '{who} ЗОВЁТ НА ДУЭЛЬ',
  'corp.feed.duelYours': 'ТВОЯ ДУЭЛЬ ОТКРЫТА',
  'corp.feed.taken': 'ЗАНЯТО · {who}',
  'corp.feed.join': 'СЕСТЬ',
  'corp.feed.left2': 'ЕЩЁ {time}',

  'corp.topTitle': 'КОРПОРАЦИИ',
  'corp.tabCoins': 'МОНЕТЫ',
  'corp.tabDollars': 'ДОЛЛАРЫ',
  'corp.headCoins': 'МОНЕТ НА ТРЕЙДЕРА ЗА МЕСЯЦ',
  'corp.headDollars': 'ДОЛЛАРОВ НА ТРЕЙДЕРА ЗА МЕСЯЦ',
  'corp.topEmpty': 'Ни в одной корпорации ещё нет {min} трейдеров. Основай свою.',
  'corp.topWhy':
    'Среднее, а не сумма: корпорация из тридцати не обгоняет корпорацию из пяти тем, что их тридцать. Меньше {min} трейдеров — в таблицу не попадает. Доллары считаются только заработанные: купленное не в счёт.',

  'corp.err.nosuch': 'ТАКОЙ КОРПОРАЦИИ НЕТ.',
  'corp.err.full': 'ТАМ НЕТ МЕСТ.',
  'corp.err.already': 'ТЫ УЖЕ В КОРПОРАЦИИ.',
  'corp.err.notmember': 'ТЫ НЕ СОСТОИШЬ В КОРПОРАЦИИ.',
  'corp.err.notowner': 'ЭТО МОЖЕТ ТОЛЬКО ВЛАДЕЛЕЦ.',
  'corp.err.badname': 'ТАКОЕ ИМЯ ИГРА НЕ ПОКАЖЕТ.',
  'corp.err.taken': 'ТАКОЕ НАЗВАНИЕ УЖЕ ЗАНЯТО.',
  'corp.err.renamed': 'ПЕРЕИМЕНОВЫВАЛИ СЛИШКОМ НЕДАВНО.',
  'corp.err.cooldown': 'ТЫ СЕГОДНЯ ВЫШЕЛ ИЗ КОРПОРАЦИИ. ПОПРОБУЙ ЧЕРЕЗ {time}.',
  'corp.err.closed': 'ЗАЯВКА ПОДАНА. РЕШАЕТ ВЛАДЕЛЕЦ.',
  'corp.err.pending': 'ЗАЯВКА УЖЕ ПОДАНА. РЕШАЕТ ВЛАДЕЛЕЦ.',
  'corp.err.gone': 'ЭТУ ДУЭЛЬ УЖЕ ЗАБРАЛИ.',
  'corp.err.busy': 'ПОКА ТЫ СМОТРЕЛ, ЕЁ ИЗМЕНИЛИ. ПОПРОБУЙ ЕЩЁ РАЗ.',
  'corp.err.noserver': 'ЗА ЭТОЙ СБОРКОЙ НЕТ СЕРВЕРА.',

  'shop.tryingOn': 'ПРИМЕРКА',
  'shop.worn': 'НАДЕТО',
  'shop.owned': 'ЕСТЬ',
  'shop.wear': 'НАДЕТЬ',
  'shop.wearing': 'НАДЕТО',
  'duel.shoutSignIn':
    'Войди в НАСТРОЙКИ · АККАУНТ, и бот позовёт на твою дуэль в общий чат.',
  'shop.today': 'ПЯТЬ ВЕЩЕЙ В ДЕНЬ · НОВЫЙ ЗАВОЗ В ПОЛНОЧЬ',
  'shop.cleanedOut': 'ВСЁ РАСКУПЛЕНО · НОВЫЙ ЗАВОЗ В ПОЛНОЧЬ',
  'shop.comeBack': 'Сегодняшняя витрина уже твоя. Заходи завтра.',
  'shop.nothingOwned': 'Пока ничего не куплено. В магазине пять вещей в день.',
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
  'match.rivalHolds': 'СОПЕРНИК {n}',
  'match.buy': 'КУПИТЬ',
  'match.sell': 'ПРОДАТЬ',
  'match.short': 'ШОРТ',
  'match.noCash': 'НЕТ ДЕНЕГ',
  'match.frozen': 'ЗАМОРОЖЕНО',
  'match.jammed': 'ПОМЕХИ',
  'match.breaking': '{name}: СРОЧНАЯ НОВОСТЬ',
  'match.headlineSoon': '{name}: СКОРО НОВОСТЬ',
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
  'trait.stall.short': 'ПАУЗЫ',
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
  'item.hat.uncommon.text':
    'Три компании видно до матча, и один раз можно отправить их обратно и попросить другие.',
  'item.hat.rare.name': 'КЕПКА ЯМЫ',
  'item.hat.rare.text':
    'Три компании видно до матча, дважды можно попросить другие, и одну компанию можно навсегда убрать из этой лиги.',
  'item.hat.mythic.name': 'КОЗЫРЁК',
  'item.hat.mythic.text':
    'Назови компанию, которую хочешь видеть всегда, — она будет на доске. Плюс две замены тройки и одна компания в бане навсегда.',
  'item.hat.legend.name': 'СТЕТСОН',
  'item.hat.legend.text': 'Все три компании выбираешь сам, каждый матч.',

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
  'item.torso.rare.text':
    'Обнулиться нельзя, и раз за матч позиция, ушедшая в минус на 15 %, закрывается сама.',
  'item.torso.mythic.name': 'СМОКИНГ',
  'item.torso.mythic.text':
    'Обнулиться нельзя, дважды за матч тонущая позиция закрывается сама, и первая закрытая в убыток сделка возвращает половину.',
  'item.torso.legend.name': 'ПЕНСИЯ',
  'item.torso.legend.text':
    'Всё, чем можно смягчить плохой день, и раз за матч можно отменить последнюю сделку по её же цене.',

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
  'item.access.rare.text':
    'Доска расписана до матча, и за три секунды до новости слышно, на какую компанию она выйдет.',
  'item.access.mythic.name': 'НАУШНИК',
  'item.access.mythic.text':
    'Доска расписана, новости приходят с предупреждением, а компания, которую держишь, подсказывает, куда собирается пойти.',
  'item.access.legend.name': 'ОРАКУЛ',
  'item.access.legend.text':
    'Всё, в чём рынок готов признаться, и следующие две секунды компании, которую держишь, дорисованы впереди линии.',
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
