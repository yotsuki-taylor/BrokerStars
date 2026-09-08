import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, cloneConfig, type Config } from '../sim/config';
import { TRAIT_SHORT, pickCompanies, type PickOptions } from '../sim/companies';
import { canUseAbility, isHit, useAbility, type AbilityId } from '../sim/abilities';
import { segmentAt } from '../sim/market';
import { createMatch, resign, step } from '../sim/match';
import type { TraderPerks } from '../sim/perks';
import { Rng, hashSeed } from '../sim/rng';
import {
  TRADE_FRACTION,
  applyAction,
  canUndo,
  isShortSide,
  plannedQty,
  positionValue,
  undoLast,
} from '../sim/trading';
import type { MatchState, Trade } from '../sim/types';
import { drawChart } from './chart';
import {
  AbilityBar,
  StockRow,
  TraderCard,
  money,
  signed,
  tex,
  type FloatPnl,
} from './components';
import BoardScreen from './BoardScreen';
import ArchiveScreen from './ArchiveScreen';
import DailyScreen from './DailyScreen';
import DuelScreen, { type DuelPhase } from './DuelScreen';
import DevPanel from './DevPanel';
import FriendsScreen from './FriendsScreen';
import LeagueSelect from './LeagueSelect';
import Menu from './Menu';
import RatingScreen from './RatingScreen';
import ResultScreen from './ResultScreen';
import Shop from './Shop';
import VersusScreen from './VersusScreen';
import { NO_AWARD, awardFor, loadStars, saveStars, tradedWell, type Award } from './progress';
import { loadSeen, saveSeen, withSeen } from './archive';
import {
  buyItem as buyItemOnServer,
  buyRoomStep,
  claimDailyBonus,
  claimDailyQuest,
  flushPending,
  mintToken,
  openProfile,
  refreshProfile,
  refundItem as refundItemOnServer,
  fetchMarket,
  refundRoomStep,
  submitResult,
  tradeShares,
  wearOutfit,
} from './api';
import { setOf, topsOf, type Profile } from '../profile/protocol';
import {
  DAILY_BONUS,
  bonusReady,
  countMatch,
  questDone,
  questReady,
  questsToday,
  rolled,
  worthATap,
  type DayFacts,
} from '../daily/protocol';
import { loadDaily, loadDollars, saveDaily, saveDollars } from './daily';
import {
  ORDERS_A_DAY,
  buyShares,
  ordersLeft,
  priceIn,
  sellShares,
  type Market,
} from '../market/protocol';
import {
  loadMarket,
  loadPortfolio,
  localMarket,
  saveMarket,
  savePortfolio,
} from './market';
import {
  DuelSocket,
  applySync,
  applyTick,
  buildMirror,
  copyLink,
  createInvite,
  duelCodeFromLaunch,
  duelsAvailable,
  shareInvite,
  type Link,
} from './duel';
import { apiBase } from './api';
import { friendCodeFromLaunch } from './friends';
import type { DuelError, DuelProfile, DuelTick, ServerMsg } from '../duel/protocol';
import { loadHeld, loadPrefs, saveHeld, savePrefs, type BoardPrefs } from './board';
import { LANGS, LANG_NAME, lang, setLang, t, tr, type Lang } from './i18n';
import { perksFor, wantsBoardScreen } from './perks';
import {
  LEAGUES,
  leagueName,
  loadPick,
  loadWins,
  savePick,
  saveWins,
  unlockedCount,
} from './leagues';
import { ROOM_DONE, ROOM_STEPS, loadRoom, saveRoom } from './renovation';
import { isAdmin, loadFreeMode, saveFreeMode } from './admin';
import {
  PRICES,
  highestOwned,
  isBuyable,
  itemId,
  loadOutfit,
  loadOwned,
  rarityBelow,
  saveOutfit,
  randomOutfit,
  saveOwned,
  type Outfit,
  type Rarity,
  type Slot,
} from './wardrobe';

const HUMAN = 0;

/**
 * The clock a duel's chart runs on, in ticks. See the game loop for why it
 * needs one of its own.
 *
 * `LAG` is how far behind the arriving ticks the line deliberately runs: a
 * reserve of about 220ms that a late tick is spent out of instead of the line
 * stopping. `GAIN` and `EASE` are the correction — how hard a frame reads the
 * error into the line's *speed*, and how quickly the speed itself may change.
 * Correcting the speed rather than the position is the whole trick: a line
 * moving 10% fast for half a second is invisible, and a line teleported 10%
 * forward is not.
 *
 * The bounds on the speed are what stop a catch-up from becoming a lurch.
 *
 * Simulated against half-second ticks arriving ±200ms out, which is a bad
 * mobile connection: the line never stops, and the worst single frame is 1.4x
 * the normal step. Reading the clock straight off the last arrival — which is
 * what this did at first — stalls a twelfth of the time and has single frames
 * ten times the normal step in it. That was the hitching.
 */
const RENDER_LAG = 0.45;
const RENDER_GAIN = 1.0;
const RENDER_EASE = 0.1;
const RENDER_SPEED_MIN = 0.7;
const RENDER_SPEED_MAX = 1.4;

/**
 * What the game is in the middle of, when it is in the middle of a duel.
 *
 * `phase` is where the invitation has got to; once the match exists it is
 * 'match' and this object is only carrying the two things the match screen
 * still needs from the socket — whether the connection is up, and whether the
 * other player is still on the end of it.
 */
interface DuelUi {
  phase: DuelPhase | 'match';
  code: string | null;
  link: string | null;
  expiresAt: number | null;
  league: number;
  rival: DuelProfile | null;
  error: DuelError | 'net' | null;
  /** the socket, which says nothing about `link` above — that is the invitation */
  conn: Link;
  rivalGone: boolean;
  /** the league the server actually paid at, once it has said */
  payLeague: number | null;
  /**
   * Called out by name from the friends list: who, and whether the bot managed
   * to put the invitation in front of them. Null when nobody was named, which
   * is DUEL on the menu and every duel before this existed.
   */
  invited: { name: string; sent: boolean } | null;
}

/** What the button says. The card in the wardrobe carries the long version. */
const ABILITY_NAME: Record<AbilityId, string> = {
  static: 'STATIC',
  halt: 'HALT',
  dossier: 'DOSSIER',
  margincall: 'MARGIN CALL',
  rumour: 'RUMOUR',
};
function haptic(kind: 'light' | 'heavy' = 'light') {
  const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
  if (tg?.impactOccurred) tg.impactOccurred(kind === 'heavy' ? 'medium' : 'light');
  else navigator.vibrate?.(kind === 'heavy' ? 25 : 10);
}

/**
 * Display name from Telegram when the game runs as a mini app. Cosmetic only —
 * initDataUnsafe is client-supplied and unverified, and nothing here trusts it.
 */
function playerName(): string {
  const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  // `||`, not `??`: Telegram sends an empty first_name rather than leaving it
  // out, and `??` only falls through on null, so the username was never reached
  const name = String(u?.first_name || u?.username || '').trim();
  return name ? name.slice(0, 12).toUpperCase() : t('match.you');
}

/**
 * One match, with its board drawn for the league being played. The draw runs
 * off the match seed too, so replaying a seed brings back the same three
 * companies as well as the same prices.
 */
function makeMatch(
  cfg: Config,
  seed: string,
  preset: string,
  league: number,
  perks: TraderPerks,
  board: PickOptions,
  ability: AbilityId | null,
): MatchState {
  const h = hashSeed(seed);
  return createMatch(h, cfg, {
    traders: [
      { name: playerName(), kind: 'human', preset: 'medium', perks, ability },
      // The rival brings the same one. Anything else moves the ladder: the
      // league win rates were measured with neither side holding an ability,
      // and handing one to the player alone quietly makes every rung easier.
      { name: t('match.rival'), kind: 'bot', preset, ability },
    ],
    stocks: pickCompanies(league, new Rng(h ^ 0x1b873593), 3, board),
  });
}

/**
 * The next headline the market has already scheduled, if it lands inside the
 * warning window. The schedule is generated up front, so this is a look at the
 * truth — which is exactly what the perk buys.
 */
function comingHeadline(state: MatchState, within: number): string | null {
  for (let i = 0; i < state.stocks.length; i++) {
    for (const seg of state.stocks[i].segments) {
      if (!seg.isNews) continue;
      const away = seg.start - state.tick;
      if (away > 0 && away <= within) return state.cfg.stocks[i].name;
    }
  }
  return null;
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <h2>{t('help.title')}</h2>
      <p>{t('help.match')}</p>
      <p>{t('help.companies')}</p>
      <p>{t('help.quarters')}</p>
      <p>{t('help.trading')}</p>
      <p>{t('help.entry')}</p>
      <button className="big-btn" onClick={onClose}>
        {t('help.gotIt')}
      </button>
    </div>
  );
}

/**
 * What the corner of the menu opens: help, and the language the game is in.
 * The language names are never translated — a player who has landed in the
 * wrong one needs to recognise their own, not read ours.
 */
function SettingsOverlay({
  onHelp,
  onPickLang,
  onClose,
}: {
  onHelp: () => void;
  onPickLang: (l: Lang) => void;
  onClose: () => void;
}) {
  const [langOpen, setLangOpen] = useState(false);
  return (
    <div className="overlay settings">
      <h2>{langOpen ? t('settings.language') : t('settings.title')}</h2>
      {langOpen ? (
        <div className="settings-list">
          {LANGS.map((l) => (
            <button
              key={l}
              className={`big-btn${l === lang() ? '' : ' ghost'}`}
              onClick={() => onPickLang(l)}
            >
              {LANG_NAME[l]}
            </button>
          ))}
        </div>
      ) : (
        <div className="settings-list">
          <button className="big-btn ghost" onClick={onHelp}>
            {t('settings.help')}
          </button>
          <button className="big-btn ghost" onClick={() => setLangOpen(true)}>
            {t('settings.language')}
          </button>
        </div>
      )}
      {/* One step up, whatever that is from here. Picking a language used to
          leave CLOSE as the only way out of it, so getting back to the settings
          list meant leaving the settings and opening them again. */}
      <button className="big-btn" onClick={() => (langOpen ? setLangOpen(false) : onClose())}>
        {langOpen ? t('common.back') : t('settings.close')}
      </button>
    </div>
  );
}

export default function App() {
  const baseCfg = useRef<Config>(cloneConfig(CONFIG));
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1e6)));
  const [leagueWins, setLeagueWins] = useState(loadWins);
  const [league, setLeague] = useState(() => loadPick(leagueWins));
  const [botPreset, setBotPreset] = useState(() => LEAGUES[league].preset);
  const [outfit, setOutfit] = useState<Outfit>(loadOutfit);
  const [boardPrefs, setBoardPrefs] = useState<BoardPrefs>(loadPrefs);
  /** everything the clothes change, rebuilt whenever the player changes them */
  const perks = useMemo(
    () => perksFor(outfit, baseCfg.current.match.startingCash),
    [outfit],
  );
  const perksRef = useRef(perks);
  perksRef.current = perks;
  const outfitRef = useRef(outfit);
  outfitRef.current = outfit;
  const prefsRef = useRef(boardPrefs);
  prefsRef.current = boardPrefs;
  /** the board each league is holding, until the match it was dealt for is played */
  const heldRef = useRef(loadHeld());
  /** Hand a league the board it will deal next, or forget the one it held. */
  const hold = (league: number, seedOrNull: string | null) => {
    if (seedOrNull === null) delete heldRef.current[league];
    else heldRef.current[league] = seedOrNull;
    saveHeld(heldRef.current);
  };
  const stateRef = useRef<MatchState>(
    makeMatch(baseCfg.current, seed, botPreset, league, perks.trader, {}, perks.ui.ability),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);

  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const [speed, setSpeed] = useState(1);
  const [showTruth, setShowTruth] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [floats, setFloats] = useState<Record<number, FloatPnl[]>>({});
  const [newsFlash, setNewsFlash] = useState<string | null>(null);
  const [screen, setScreen] = useState<
    | 'menu'
    | 'shop'
    | 'equip'
    | 'archive'
    | 'rating'
    | 'daily'
    | 'friends'
    | 'leagues'
    | 'board'
    | 'duel'
    | 'vs'
    | 'match'
  >('menu');
  /** rerolls of the board still owed this match, and a board the player named */
  const [rerollsLeft, setRerollsLeft] = useState(0);
  const forcedRef = useRef<readonly string[] | null>(null);
  const [coins, setStars] = useState(loadStars);
  /** the hard currency, and the day it is paid out by — see `src/daily/protocol.ts` */
  const [dollars, setDollars] = useState(loadDollars);
  const [daily, setDaily] = useState(loadDaily);
  /** the share book, and the prices it is drawn at — see `src/market/protocol.ts` */
  const [portfolio, setPortfolio] = useState(loadPortfolio);
  /**
   * Today's prices. The server's if there is one, and this end's own walk if
   * there is not — an unsalted market nobody's balance is settled at, which is
   * still better than a counter that does nothing in `npm run dev`.
   */
  const [market, setMarket] = useState<Market>(() => loadMarket() ?? localMarket());
  /** companies the player has met — filed by the match that put them up */
  const [seenCompanies, setSeenCompanies] = useState<Set<string>>(loadSeen);
  const [owned, setOwned] = useState<Set<string>>(loadOwned);
  /** the last thing the server said about this player, for the shelf to draw */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roomDone, setRoomDone] = useState(loadRoom);
  const [freeMode, setFreeMode] = useState(loadFreeMode);
  const [rivalOutfit, setRivalOutfit] = useState<Outfit>(() => randomOutfit(Math.random));
  /** 3, 2, 1 before the first tick; the match is frozen while it runs */
  const [countdown, setCountdown] = useState<number | null>(null);
  const admin = isAdmin();
  /**
   * The duel, if there is one. The socket is a ref because the game loop and
   * every button need it and none of them should re-render when it changes;
   * `duel` beside it is the part the screens draw.
   */
  const duelRef = useRef<DuelSocket | null>(null);
  const [duel, setDuel] = useState<DuelUi | null>(null);
  /** when the last tick landed, which is all the interpolation has to go on */
  const lastTickAt = useRef(0);
  /**
   * The last tick as it arrived. Two things on the match screen cannot be read
   * off the mirror in a duel, because the server does not send what they are
   * made of: what the rival is holding (their book is DOSSIER's to sell) and
   * whether the ability button is live (two of the five read that same book).
   */
  const lastTick = useRef<DuelTick | null>(null);
  /** where the chart line has got to, in ticks, and how fast — see the game loop */
  const renderPos = useRef(0);
  const renderSpeed = useRef(1);
  const [award, setAward] = useState<Award | null>(null);
  /** name of the league this match's win opened, shown once on the result screen */
  const [unlockedName, setUnlockedName] = useState<string | null>(null);
  const awarded = useRef(false);

  // The game loop is built once and never sees a re-render, so the league it
  // has to pay out and the wins it has to bank reach it through refs.
  const leagueRef = useRef(league);
  leagueRef.current = league;
  const winsRef = useRef(leagueWins);
  winsRef.current = leagueWins;

  // latest UI values for the animation loop, which is created only once
  const ui = useRef({ speed, showTruth, paused: false, peekTicks: 0 });
  ui.current.speed = speed;
  ui.current.showTruth = showTruth;
  ui.current.peekTicks = perks.ui.truthTicks;
  ui.current.paused =
    devOpen || helpOpen || pauseOpen || settingsOpen || countdown !== null || screen !== 'match';

  /* ------------------------------------------------------------ the profile */

  /**
   * What the server says the player owns, made true on this end.
   *
   * The `save*` calls are still made. `localStorage` stopped being where any of
   * this lives, but it is what the menu draws before the first answer comes
   * back, and it is all there is when the game is opened outside Telegram or
   * against a build with no server behind it.
   */
  const applyProfile = useCallback((p: Profile) => {
    // The whole answer is kept, not only the parts the menu draws: the shelf
    // screen reads the awards and the numbers they are judged against straight
    // off it, so there is no second request behind the ARCHIVE button.
    setProfile(p);
    setSeenCompanies(new Set(p.seen));
    saveSeen(new Set(p.seen));
    setStars(p.coins);
    saveStars(p.coins);
    setDollars(p.dollars);
    saveDollars(p.dollars);
    setPortfolio(p.portfolio);
    savePortfolio(p.portfolio);
    // The server has already rolled the day over; this end rolls it again only
    // for a game that was left open past midnight (see the render below).
    setDaily(p.daily);
    saveDaily(p.daily);
    setRoomDone(p.room);
    saveRoom(p.room);
    const bought = setOf(p.owned);
    setOwned(bought);
    saveOwned(bought);
    setOutfit(p.outfit);
    saveOutfit(p.outfit);
    saveWins(p.wins);
    winsRef.current = p.wins;
    setLeagueWins(p.wins);
    // The ladder can come back shorter than this end had it — a match played
    // while the server was unreachable and never handed in is a win nobody but
    // this phone saw. Standing in a league that just closed is not a state any
    // screen is written for, so step down to the top of what is open.
    setLeague((l) => Math.min(l, unlockedCount(p.wins) - 1));
  }, []);

  /**
   * Whatever the server answers replaces what this end drew in the meantime.
   * Every purchase is applied here first and sent second, so the shop never
   * waits on a network — and if the server disagrees, this is where the coins
   * snap back to what they really are.
   */
  const reconcile = useCallback(
    (answer: Promise<Profile | null>) => {
      void answer.then((p) => p && applyProfile(p));
    },
    [applyProfile],
  );

  /**
   * One handshake on the way in, carrying whatever this browser already had.
   * For everybody who was playing before any of this was kept on a server, that
   * save IS their progress, and this is the moment it is handed over — once,
   * and only while the server has nothing of its own for them.
   */
  useEffect(() => {
    // Matches played while the server was unreachable go up first. They are
    // coins on the board, and the balance is built out of the board — asking
    // for it before they land would answer short by exactly them.
    reconcile(
      flushPending().then(() =>
        openProfile({
          coins: loadStars(),
          room: loadRoom(),
          owned: topsOf(loadOwned()),
          outfit: loadOutfit(),
          wins: loadWins(),
          seen: [...loadSeen()],
        }),
      ),
    );
  }, [reconcile]);

  /**
   * Today's prices, asked for once on the way in.
   *
   * Public reading like the board — no signature, and it works in a plain
   * browser. What comes back replaces the walk this end computed for itself;
   * they will disagree, because the server salts its seed and this end cannot
   * (`src/market/protocol.ts`), and the server's is the one anything is settled
   * at.
   *
   * There is no polling. A price moves once a day, at the same midnight the
   * bonus comes back, so the answer is good for as long as the app is open —
   * and the one moment it is not, the day rolls and every screen is redrawn off
   * a fresh profile anyway.
   */
  useEffect(() => {
    void fetchMarket().then((m) => {
      if (!m) return;
      setMarket(m);
      saveMarket(m);
    });
  }, []);

  /**
   * One order at the share counter, drawn here and settled on the server.
   *
   * The same shape as a purchase in the shop: the book and the balance move at
   * once so the buttons feel like buttons, and whatever the server answers
   * replaces them. Everything checked here is checked again on the other side
   * against the price IT works out for today (`profiles.trade`), and the guards
   * here only stop a double tap.
   *
   * The two normally agree to the coin, because the price drawn here came from
   * the server in the first place (`/market`). They disagree in exactly one
   * case — that request failed and the fallback walk is on screen — and then
   * the answer is the truth and the balance snaps to it.
   */
  const tradeAtCounter = useCallback(
    (id: string, shares: number, sell: boolean) => {
      const today = rolled(daily, Date.now());
      if (ordersLeft(today) <= 0) return;
      const price = priceIn(market, id);
      if (price === null) return;

      const done = sell
        ? sellShares(portfolio, dollars, id, shares, price, market.day)
        : buyShares(portfolio, dollars, id, shares, price, market.day);
      if (!done.ok) return;

      setPortfolio(done.portfolio);
      savePortfolio(done.portfolio);
      setDollars(done.dollars);
      saveDollars(done.dollars);
      const next = { ...today, orders: Math.min(ORDERS_A_DAY, today.orders + 1) };
      setDaily(next);
      saveDaily(next);
      haptic('heavy');
      reconcile(tradeShares(id, shares, sell));
    },
    [daily, dollars, market, portfolio, reconcile],
  );

  /* ------------------------------------------------- simulation + render loop */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let watched: MatchState | null = null;
    let renderedTick = -1;
    let renderedNews = 0;

    const frame = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      const st = stateRef.current;

      // A restart swaps in a fresh state, and these counters are about the old
      // one. Left stale, the news check below would read past the end of an
      // empty array.
      if (st !== watched) {
        watched = st;
        renderedTick = -1;
        renderedNews = st.news.length;
        acc = 0;
      }

      if (duelRef.current) {
        // A duel is stepped by the object on the server, not here. All this end
        // does is slide the line along between the ticks it is sent, so the
        // chart moves at sixty frames on a market that arrives at two. Pausing
        // is not on offer either: the market goes on whether or not this phone
        // is looking at it.
        //
        // Reading the clock straight off the last arrival — which is what this
        // did at first — draws every wobble in the network. A tick 90ms late
        // pins the line against the newest price it has and holds it there for
        // 90ms; the next one arriving early throws it forward instead. That is
        // several visible hitches a second on a connection that is working
        // perfectly well, and it is what "everything was freezing" was.
        //
        // So the line keeps a clock of its own. It advances by itself, a tick
        // per tickMs, and the arrivals only bend its *speed* — never its
        // position — towards where they say it ought to be. It aims to sit
        // RENDER_LAG behind them, and that reserve is what a late tick is
        // spent out of. Nothing anybody taps is delayed by this: the tap goes
        // up the socket at once and the numbers move the moment the answer
        // lands. Only the line is held back, by about a fifth of a second.
        const tickMs = st.cfg.match.tickMs;
        if (st.finished) {
          renderPos.current = st.tick;
          progressRef.current = 1;
        } else {
          const target = st.tick - 1 + (now - lastTickAt.current) / tickMs - RENDER_LAG;
          const want = Math.min(
            RENDER_SPEED_MAX,
            Math.max(RENDER_SPEED_MIN, 1 + (target - renderPos.current) * RENDER_GAIN),
          );
          renderSpeed.current += (want - renderSpeed.current) * RENDER_EASE;
          // Never past the newest price we were sent — that would be drawing a
          // market we have not been told about. Behind it is fine: the chart
          // reads `progress` as where the right-hand edge has got to, and a
          // negative one simply keeps the latest point out of frame a moment
          // longer.
          renderPos.current = Math.min(
            st.tick,
            renderPos.current + (dt / tickMs) * renderSpeed.current,
          );
          progressRef.current = renderPos.current - (st.tick - 1);
        }
      } else if (!st.finished && !ui.current.paused) {
        acc += dt * ui.current.speed;
        const tickMs = st.cfg.match.tickMs;
        while (acc >= tickMs && !st.finished) {
          step(st);
          acc -= tickMs;
        }
        progressRef.current = st.finished ? 1 : acc / tickMs;
      }

      if (canvasRef.current) {
        drawChart(canvasRef.current, st, {
          progress: progressRef.current,
          showTruth: ui.current.showTruth,
          humanIdx: HUMAN,
          peekTicks: ui.current.peekTicks,
        });
      }

      // A duel is paid by the server, which watched it: the `end` message
      // brings the number, and none of the banking below applies. League wins
      // are not banked either — the ladder is climbed against the bots, or a
      // friend willing to lose ten times would be a lift to the crown.
      if (st.finished && !awarded.current && !duelRef.current) {
        awarded.current = true;
        const me = st.traders[HUMAN];
        const li = leagueRef.current;
        const a =
          st.resigned === HUMAN
            ? NO_AWARD
            : awardFor(
                st.winner === HUMAN,
                st.winner === null,
                tradedWell(me.netWorth, st.cfg.match.startingCash),
                LEAGUES[li].reward,
              );
        setAward(a);
        if (a.total > 0) {
          setStars((prev) => {
            const next = prev + a.total;
            saveStars(next);
            return next;
          });
        }
        // Both of these turn on the same thing: a match you played out. Giving
        // up is not playing it out, so it neither files the companies nor hands
        // the league a fresh board — otherwise surrendering would be the free
        // reroll again, four taps slower. The way to change a board you do not
        // like is a reroll, which is what the BALL CAP is sold for.
        if (st.resigned === null) {
          hold(li, null);

          // The board hears about the match, but not about what it was worth:
          // the server reads the outcome and works the coins out from its own
          // table. Fire and forget — a leaderboard that cannot be reached must
          // never be something the player has to wait for or notice.
          // ...and then asks what that came to. The award above is this end's
          // arithmetic and the server's is the one that counts; asking now
          // rather than at the shop door means the balance is already right by
          // the time anybody walks up to it.
          reconcile(
            submitResult({
              seed: st.seed.toString(36),
              league: li,
              outcome:
                st.winner === null ? 'draw' : st.winner === HUMAN ? 'win' : 'loss',
              netWorth: Math.round(me.netWorth),
              tradedWell: tradedWell(me.netWorth, st.cfg.match.startingCash),
              // minted here, once, and kept with the match if it has to be sent
              // again: the same match twice must not be paid for twice
              token: mintToken(),
              // what the shelf wants and the board does not
              bankrupt: me.bankrupt,
              trades: me.trades.length,
              companies: st.cfg.stocks.map((x) => x.id),
            }).then(refreshProfile),
          );

          setSeenCompanies((prev) => {
            const next = withSeen(prev, st.cfg.stocks.map((x) => x.id));
            if (next !== prev) saveSeen(next);
            return next;
          });

          // And the day's quests, on this end, from the same facts that went
          // up. Inside this branch rather than outside it on purpose: a
          // surrendered match is never handed in, so the server never counts
          // one, and counting it here would put the two out of step.
          countTowardsDay({
            outcome:
              st.winner === null ? 'draw' : st.winner === HUMAN ? 'win' : 'loss',
            netWorth: Math.round(me.netWorth),
            tradedWell: tradedWell(me.netWorth, st.cfg.match.startingCash),
            bankrupt: me.bankrupt,
            trades: me.trades.length,
            // this branch is the bot match; a duel is counted by the server
            // that ran it and arrives back on the refreshed profile
            duel: false,
          });
        }

        // A surrendered match is a loss, and a loss banks nothing: the ladder
        // is climbed by winning, not by starting matches.
        if (st.winner === HUMAN && st.resigned === null) {
          const before = winsRef.current;
          const after = before.slice();
          after[li] = (after[li] ?? 0) + 1;
          saveWins(after);
          winsRef.current = after;
          setLeagueWins(after);
          const opened = unlockedCount(after);
          setUnlockedName(
            opened > unlockedCount(before) ? leagueName(LEAGUES[opened - 1]) : null,
          );
        }
      }

      if (st.news.length !== renderedNews) {
        renderedNews = st.news.length;
        const n = st.news[st.news.length - 1];
        if (n) {
          setNewsFlash(n.text);
          window.setTimeout(() => setNewsFlash(null), 2200);
        }
      }
      if (st.tick !== renderedTick) {
        renderedTick = st.tick;
        setVersion((v) => v + 1);
      }
    };

    // An exception thrown inside the callback would skip the line that queues
    // the next frame, and the game would freeze with no way back. Never let one
    // frame's failure end the loop.
    const loop = (now: number) => {
      try {
        frame(now);
      } catch (err) {
        console.error('game loop frame failed', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 3, 2, 1 — the loop stays paused until this clears
  useEffect(() => {
    if (countdown === null) return;
    const t = window.setTimeout(() => setCountdown(countdown > 1 ? countdown - 1 : null), 800);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ----------------------------------------------------------------- dev panel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDevOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ------------------------------------------------------------------- actions */
  const restart = useCallback(
    (
      nextSeed?: string,
      nextPreset?: string,
      nextLeague?: number,
      /** a board the player named, or null to draw one */
      force?: readonly string[] | null,
      /** a reroll redraws without handing back another reroll */
      keepRerolls = false,
    ) => {
      const s = nextSeed ?? seed;
      const p = nextPreset ?? botPreset;
      // the league decides the board, and a restart from the dev panel names none
      const li = nextLeague ?? leagueRef.current;
      if (nextSeed) setSeed(s);
      if (nextPreset) setBotPreset(p);
      if (force !== undefined) forcedRef.current = force;
      if (!keepRerolls) setRerollsLeft(perksRef.current.ui.rerolls);
      const prefs = prefsRef.current;
      const match = makeMatch(
        baseCfg.current,
        s,
        p,
        li,
        perksRef.current.trader,
        { pin: prefs.pin, ban: prefs.ban, force: forcedRef.current },
        perksRef.current.ui.ability,
      );
      stateRef.current = match;
      // seeded off the match, so replaying a seed brings back the same opponent
      const look = new Rng(hashSeed(s) ^ 0x5bd1e995);
      setRivalOutfit(randomOutfit(() => look.next()));
      progressRef.current = 0;
      awarded.current = false;
      setAward(null);
      setUnlockedName(null);
      setPauseOpen(false);
      setCountdown(null);
      setFloats({});
      rerender();
    },
    [seed, botPreset, rerender],
  );

  /**
   * The number that floats off a row when a trade prints. Against a bot the
   * trade comes back from `applyAction` on the spot; in a duel it comes back
   * from the server a moment later. Same float either way.
   */
  const floatId = useRef(1);
  const showTrade = useCallback((trade: Trade) => {
    const id = floatId.current++;
    const text =
      trade.realized !== 0
        ? `${signed(trade.realized)}`
        : `${trade.qty > 0 ? '+' : '-'}${Math.abs(trade.qty)} SH`;
    const item: FloatPnl = { id, text, good: trade.realized !== 0 ? trade.realized > 0 : true };
    setFloats((f) => ({ ...f, [trade.stock]: [...(f[trade.stock] ?? []), item] }));
    window.setTimeout(
      () =>
        setFloats((f) => ({
          ...f,
          [trade.stock]: (f[trade.stock] ?? []).filter((x) => x.id !== id),
        })),
      900,
    );
  }, []);

  /* ------------------------------------------------------------------- duels */

  const closeDuel = useCallback(() => {
    duelRef.current?.close();
    duelRef.current = null;
  }, []);

  /**
   * Everything the object on the other end has to say.
   *
   * Note what `setup` does and does not do. It builds a mirror off the seed and
   * the board the server sent — which is what gives this end the news schedule,
   * the quarter lines and the perks the HUD reads — and then never steps it
   * again. Every tick after that is written over the mirror by `applyTick`.
   */
  const onDuelMessage = useCallback(
    (msg: ServerMsg) => {
      switch (msg.k) {
        case 'lobby':
          setDuel((d) =>
            d
              ? {
                  ...d,
                  phase: d.phase === 'match' ? d.phase : 'waiting',
                  rival: msg.rival,
                  league: msg.league,
                  expiresAt: msg.expiresAt,
                  error: null,
                }
              : d,
          );
          break;

        case 'setup': {
          stateRef.current = buildMirror(msg);
          lastTick.current = null;
          renderPos.current = 0;
          renderSpeed.current = 1;
          progressRef.current = 0;
          lastTickAt.current = performance.now();
          // The payout arrives as a message; nothing local is allowed to bank
          // one, and this is the flag the game loop checks.
          awarded.current = true;
          setAward(null);
          setUnlockedName(null);
          setFloats({});
          setPauseOpen(false);
          setRivalOutfit(msg.outfits[1]);
          setDuel((d) => (d ? { ...d, phase: 'match', league: msg.league, error: null } : d));
          if (msg.startsInMs === null) {
            // dropped back into a match already under way
            setCountdown(null);
            setScreen('match');
          } else {
            setScreen('vs');
          }
          rerender();
          break;
        }

        case 'sync':
          applySync(stateRef.current, msg.sync, msg.tick);
          lastTick.current = msg.tick;
          lastTickAt.current = performance.now();
          rerender();
          break;

        case 'tick': {
          const st = stateRef.current;
          const advanced = msg.tick.t !== st.tick;
          const trades = applyTick(st, msg.tick);
          lastTick.current = msg.tick;
          if (advanced) lastTickAt.current = performance.now();
          for (const trade of trades) {
            if (trade.trader !== HUMAN) continue;
            showTrade(trade);
            haptic(Math.abs(trade.realized) > 1 ? 'heavy' : 'light');
          }
          rerender();
          break;
        }

        case 'end': {
          const a: Award = {
            win: msg.award.win,
            profit: msg.award.profit,
            total: msg.award.total,
          };
          setAward(a);
          setDuel((d) => (d ? { ...d, payLeague: msg.award.league } : d));
          if (a.total > 0) {
            setStars((prev) => {
              const next = prev + a.total;
              saveStars(next);
              return next;
            });
          }
          // Asked for whatever the payout came to, and now asked for
          // unconditionally: the object that ran the match settled the day's
          // quests along with the coins, and a duel lost for nothing still
          // counted as a match played. Unlike a bot match, this end does not
          // keep its own tally of a duel — the mirror it draws is not where the
          // trades were made, and one honest answer beats two guesses.
          reconcile(refreshProfile());
          break;
        }

        case 'gone':
          setDuel((d) => (d ? { ...d, rivalGone: true } : d));
          break;

        case 'back':
          setDuel((d) => (d ? { ...d, rivalGone: false } : d));
          break;

        case 'error':
          closeDuel();
          setDuel((d) => (d ? { ...d, phase: 'error', error: msg.reason } : d));
          setScreen('duel');
          break;
      }
    },
    [closeDuel, reconcile, rerender, showTrade],
  );

  const connect = useCallback(
    (code: string, phase: DuelPhase, extra: Partial<DuelUi> = {}) => {
      closeDuel();
      setDuel({
        phase,
        code,
        link: null,
        expiresAt: null,
        league: leagueRef.current,
        rival: null,
        error: null,
        conn: 'connecting',
        rivalGone: false,
        payLeague: null,
        invited: null,
        ...extra,
      });
      setScreen('duel');
      duelRef.current = new DuelSocket(
        code,
        { name: playerName(), outfit: outfitRef.current },
        onDuelMessage,
        (state) => setDuel((d) => (d ? { ...d, conn: state } : d)),
      );
    },
    [closeDuel, onDuelMessage],
  );

  /** Say why there will be no duel, on the duel screen, where it was asked for. */
  const duelRefusal = useCallback((reason: DuelError | 'net') => {
    setDuel({
      phase: 'error',
      code: null,
      link: null,
      expiresAt: null,
      league: leagueRef.current,
      rival: null,
      error: reason,
      conn: 'lost',
      rivalGone: false,
      payLeague: null,
      invited: null,
    });
    setScreen('duel');
  }, []);

  /**
   * Open a duel. With a friend it is the same duel with one difference: the
   * server has the bot deliver the invitation to them by name, so nobody has
   * to carry a link anywhere. The link is minted either way and the screen
   * still shows it — a message that did not land must not end the duel.
   */
  const startDuel = useCallback(
    async (friend?: { id: string; name: string }) => {
      // Two things a duel cannot do without, and they fail differently: a build
      // with no server behind it, and a game opened outside Telegram, where
      // there is no signature and so no way to say who is playing.
      if (!apiBase()) return duelRefusal('noserver');
      if (!duelsAvailable()) return duelRefusal('badsig');

      setDuel({
        phase: 'opening',
        code: null,
        link: null,
        expiresAt: null,
        league: leagueRef.current,
        rival: null,
        error: null,
        conn: 'connecting',
        rivalGone: false,
        payLeague: null,
        invited: null,
      });
      setScreen('duel');
      const invite = await createInvite(leagueRef.current, outfitRef.current, friend?.id);
      if (!invite) return duelRefusal('net');
      connect(invite.code, 'waiting', {
        code: invite.code,
        link: invite.link,
        expiresAt: invite.expiresAt,
        invited: friend ? { name: friend.name, sent: invite.sent } : null,
      });
    },
    [connect, duelRefusal],
  );

  /** Out of the duel and back to a perfectly ordinary match against a bot. */
  const leaveDuel = useCallback(() => {
    closeDuel();
    setDuel(null);
    setScreen('menu');
    const li = leagueRef.current;
    const held = heldRef.current[li];
    const s = held ?? String(Math.floor(Math.random() * 1e6));
    if (!held) hold(li, s);
    restart(s, LEAGUES[li].preset, li, held ? undefined : null, Boolean(held));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeDuel, restart]);

  /** Opened on somebody's invitation: straight into it, whatever screen was next. */
  useEffect(() => {
    const code = duelCodeFromLaunch();
    if (code) connect(code, 'joining', { code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The other kind of invitation, and it opens a screen rather than a match:
   * the friends menu adds whoever the code belongs to as it appears, so the
   * player watches the name land in the list instead of being told about
   * something that happened out of sight.
   *
   * Read once, here, rather than in the screen — the address bar is wiped on
   * the way past (see `friendCodeFromLaunch`) and a screen that mounts twice
   * would find nothing the second time.
   */
  const [friendCode, setFriendCode] = useState<string | null>(null);
  useEffect(() => {
    const code = friendCodeFromLaunch();
    if (!code) return;
    setFriendCode(code);
    setScreen('friends');
  }, []);

  // the socket must not outlive the page that was watching it
  useEffect(() => closeDuel, [closeDuel]);

  /* ---------------------------------------------------------------- actions */

  /** Take the last trade back, if the coat is still offering. */
  const takeBack = () => {
    if (duelRef.current) {
      // The book lives on the server; an undo is a request for it to be put
      // back, not something this end can do to a mirror.
      if (canUndo(stateRef.current, HUMAN)) duelRef.current.send({ k: 'undo' });
      haptic('heavy');
      return;
    }
    if (!undoLast(stateRef.current, HUMAN)) return;
    haptic('heavy');
    setFloats({});
    rerender();
  };

  const fireAbility = () => {
    const st = stateRef.current;
    if (duelRef.current) {
      if (lastTick.current?.rdy) {
        duelRef.current.send({ k: 'ability' });
        haptic('heavy');
      }
      return;
    }
    if (!useAbility(st, HUMAN)) return;
    haptic('heavy');
    rerender();
  };

  /** Giving up. In a duel the server has to be told, or it goes on ticking. */
  const giveUp = () => {
    if (duelRef.current) duelRef.current.send({ k: 'resign' });
    else resign(stateRef.current, HUMAN);
    setPauseOpen(false);
    rerender();
  };

  const act = (stockIdx: number, side: 'buy' | 'sell') => {
    const st = stateRef.current;
    if (st.finished || st.traders[HUMAN].bankrupt) return;
    if (duelRef.current) {
      // Nothing is applied here on the way out. A tap that the server refuses —
      // frozen company, no cash, a STATIC still running — must not print a
      // trade on this screen that the other player never sees.
      duelRef.current.send({ k: 'act', stock: stockIdx, side });
      haptic();
      return;
    }
    const trade = applyAction(st, {
      trader: HUMAN,
      stock: stockIdx,
      side,
      fraction: TRADE_FRACTION,
    });
    if (!trade) return;
    haptic(Math.abs(trade.realized) > 1 ? 'heavy' : 'light');
    showTrade(trade);
    rerender();
  };

  /**
   * Put it on, here. Kept apart from `equip` because a purchase already dresses
   * the player on the server as part of the sale, and telling it twice would
   * race the sale it belongs to.
   */
  const putOn = (slot: Slot, rarity: Rarity) => {
    setOutfit((prev) => {
      const next = { ...prev, [slot]: rarity };
      saveOutfit(next);
      return next;
    });
  };

  // Changing clothes changes the terms, but not for a match that already
  // exists: perks are read when restart() builds the next one. The server is
  // told because a duel dresses each side out of the wardrobe it keeps, not out
  // of what the browser says it is wearing.
  const equip = (slot: Slot, rarity: Rarity) => {
    putOn(slot, rarity);
    reconcile(wearOutfit({ ...outfitRef.current, [slot]: rarity }));
    haptic();
  };

  /** A slot is climbed a rung at a time, so only one rarity is ever for sale. */
  const buy = (slot: Slot, rarity: Rarity) => {
    if (!isBuyable(owned, slot, rarity)) return;
    const price = freeMode ? 0 : PRICES[rarity];
    if (coins < price) return;
    addStars(-price);
    setOwned((prev) => {
      const next = new Set(prev).add(itemId(slot, rarity));
      saveOwned(next);
      return next;
    });
    putOn(slot, rarity);
    haptic('heavy');
    // The sale itself is the server's: it holds the balance, it knows what a
    // rung costs, and it decides whether this one was next. Everything above is
    // what this end expects to be told, drawn early so the shop feels instant.
    reconcile(buyItemOnServer(slot, rarity, freeMode));
  };

  /**
   * Dev only: hand the top item of a slot back and refund it. Only the top,
   * or the ladder would end up with a hole in it that nothing could fill.
   */
  const refund = (slot: Slot, rarity: Rarity) => {
    if (!admin || highestOwned(owned, slot) !== rarity) return;
    addStars(PRICES[rarity]);
    setOwned((prev) => {
      const next = new Set(prev);
      next.delete(itemId(slot, rarity));
      saveOwned(next);
      return next;
    });
    reconcile(refundItemOnServer(slot, rarity));
    if (outfit[slot] !== rarity) return;
    const below = rarityBelow(rarity);
    setOutfit((prev) => {
      const next = { ...prev };
      if (below) next[slot] = below;
      else delete next[slot];
      saveOutfit(next);
      return next;
    });
  };

  const addStars = (delta: number) =>
    setStars((prev) => {
      const next = Math.max(0, prev + delta);
      saveStars(next);
      return next;
    });

  const renovate = () => {
    if (roomDone >= ROOM_DONE) return;
    const price = freeMode ? 0 : ROOM_STEPS[roomDone].price;
    if (coins < price) return;
    addStars(-price);
    setRoomDone((prev) => {
      const next = prev + 1;
      saveRoom(next);
      return next;
    });
    haptic('heavy');
    reconcile(buyRoomStep(freeMode));
  };

  /** Dev only: step the room back and hand the coins back. */
  const undoRenovate = () => {
    if (!admin || roomDone === 0) return;
    addStars(ROOM_STEPS[roomDone - 1].price);
    setRoomDone((prev) => {
      const next = prev - 1;
      saveRoom(next);
      return next;
    });
    reconcile(refundRoomStep());
  };

  /**
   * Today's bonus, drawn here and settled on the server.
   *
   * Same shape as a purchase: the thousand appears at once so the button feels
   * like a button, and whatever the server answers replaces it. The guard is
   * this end's own picture of the day and is only there to stop a double tap —
   * a browser whose clock is a day out gets its answer from `/profile/daily`,
   * which counts days off its own.
   */
  const takeDailyBonus = () => {
    const today = rolled(daily, Date.now());
    if (!bonusReady(today)) return;
    setDollars((prev) => {
      const next = prev + DAILY_BONUS;
      saveDollars(next);
      return next;
    });
    setDaily(() => {
      const next = { ...today, bonus: true };
      saveDaily(next);
      return next;
    });
    haptic('heavy');
    reconcile(claimDailyBonus());
  };

  /**
   * One finished quest, cashed in.
   *
   * Same shape as the bonus and as a purchase: the coins appear at once and
   * whatever the server answers replaces them. The guard is this end's own
   * picture of the day and only stops a double tap — whether the quest is
   * really finished, and what it really pays, is settled by `claimQuest` on the
   * other side.
   */
  const takeQuest = (id: string) => {
    const today = rolled(daily, Date.now());
    const quest = questsToday(today.day).find((q) => q.id === id);
    if (!quest || !questReady(today, quest)) return;
    addStars(quest.coins);
    setDaily(() => {
      const next = { ...today, taken: [...today.taken, id] };
      saveDaily(next);
      return next;
    });
    haptic('heavy');
    reconcile(claimDailyQuest(id));
  };

  /**
   * One finished match, counted against the day — this end's copy of what
   * `settle` does on the server.
   *
   * Kept in step for the reason the coin count is: the screen has to be right
   * before the answer comes back, and it has to be right at all in a build with
   * no server behind it. The server's answer overwrites this the moment it
   * lands.
   */
  const countTowardsDay = (facts: DayFacts) => {
    setDaily((prev) => {
      const next = countMatch(prev, facts, Date.now());
      saveDaily(next);
      return next;
    });
  };

  const toggleFree = () => {
    if (!admin) return;
    setFreeMode((prev) => {
      saveFreeMode(!prev);
      return !prev;
    });
  };

  const patch = (fn: (c: Config) => void) => {
    fn(stateRef.current.cfg);
    fn(baseCfg.current);
    rerender();
  };

  // dev-only console handle: window.bs.step(60), window.bs.state(), window.bs.restart()
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).bs = {
      state: () => stateRef.current,
      step: (n = 1) => {
        for (let i = 0; i < n; i++) step(stateRef.current);
        rerender();
        return stateRef.current.tick;
      },
      restart,
    };
  }, [restart, rerender]);


  /* --------------------------------------------------------------------- render */
  const st = stateRef.current;
  const cfg = st.cfg;
  const me = st.traders[HUMAN];
  const rival = st.traders[1];
  const remaining = Math.max(0, (st.totalTicks - st.tick) * cfg.match.tickMs) / 1000;
  // three seconds of warning, in ticks, which is what the headset promises
  const warning = perks.ui.headlineWarning && !st.finished ? comingHeadline(st, 6) : null;
  const undoOffered = perks.ui.undos > 0 && canUndo(st, HUMAN);
  const cheapestShare = Math.min(...st.stocks.map((s) => s.price));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(Math.floor(remaining % 60)).padStart(2, '0');

  if (screen === 'leagues') {
    return (
      <div className="app">
        <LeagueSelect
          coins={coins}
          wins={leagueWins}
          initial={league}
          onBack={() => setScreen('menu')}
          onPlay={(i) => {
            setLeague(i);
            savePick(i);
            // The three companies stand until the match they were dealt for is
            // played out. Backing out of the board or the versus screen used to
            // deal a fresh three, and so did stepping into another league and
            // back — a free reroll, which is the whole of what the BALL CAP and
            // the BLACK BRIM are sold for. Redealing on the held seed brings
            // back the same three and picks up any clothes bought in between.
            const held = heldRef.current[i];
            const s = held ?? String(Math.floor(Math.random() * 1e6));
            if (!held) hold(i, s);
            restart(s, LEAGUES[i].preset, i, held ? undefined : null, Boolean(held));
            setScreen(wantsBoardScreen(perks.ui) ? 'board' : 'vs');
            haptic('heavy');
          }}
        />
      </div>
    );
  }

  if (screen === 'board') {
    return (
      <div className="app">
        <BoardScreen
          leagueName={leagueName(LEAGUES[league])}
          leagueIndex={league}
          stocks={cfg.stocks}
          ui={perks.ui}
          prefs={boardPrefs}
          rerollsLeft={rerollsLeft}
          onReroll={() => {
            setRerollsLeft((n) => Math.max(0, n - 1));
            const s = String(Math.floor(Math.random() * 1e6));
            hold(league, s);
            restart(s, undefined, league, null, true);
            haptic();
          }}
          onPrefs={(next) => {
            setBoardPrefs(next);
            prefsRef.current = next;
            savePrefs(next);
            // redraw at once, so the standing order is something you can see
            restart(undefined, undefined, league, null, true);
          }}
          onForce={(ids) => {
            restart(undefined, undefined, league, ids, true);
            haptic('heavy');
          }}
          onPlay={() => {
            setScreen('vs');
            haptic('heavy');
          }}
          onBack={() => setScreen('leagues')}
        />
      </div>
    );
  }

  if (screen === 'vs') {
    return (
      <div className="app">
        <VersusScreen
          playerName={me.name}
          playerOutfit={outfit}
          rivalName={rival.name}
          rivalOutfit={rivalOutfit}
          duel={Boolean(duel)}
          onReady={() => {
            setScreen('match');
            setCountdown(3);
          }}
          onCancel={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'duel' && duel) {
    return (
      <div className="app">
        <DuelScreen
          phase={duel.phase === 'match' ? 'waiting' : duel.phase}
          link={duel.link}
          code={duel.code}
          expiresAt={duel.expiresAt}
          leagueName={leagueName(LEAGUES[duel.league] ?? LEAGUES[0])}
          rivalName={duel.rival?.name ?? null}
          invited={duel.invited}
          error={duel.error}
          onSend={() => duel.link && shareInvite(duel.link, t('duel.inviteText'))}
          onCopy={() => (duel.link ? copyLink(duel.link) : Promise.resolve(false))}
          onBack={leaveDuel}
        />
      </div>
    );
  }

  if (screen === 'archive') {
    return (
      <div className="app">
        <ArchiveScreen
          seen={seenCompanies}
          profile={profile}
          counter={{
            market,
            portfolio,
            dollars,
            daily: rolled(daily, Date.now()),
            onTrade: tradeAtCounter,
          }}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'rating') {
    return (
      <div className="app">
        <RatingScreen onBack={() => setScreen('menu')} />
      </div>
    );
  }

  if (screen === 'friends') {
    return (
      <div className="app">
        <FriendsScreen
          joining={friendCode}
          onDuel={(friend) => {
            setFriendCode(null);
            void startDuel(friend);
          }}
          onBack={() => {
            // The invitation is spent the moment it has been shown its answer:
            // coming back to this screen later is a list, not the same piece of
            // news over again.
            setFriendCode(null);
            setScreen('menu');
          }}
        />
      </div>
    );
  }

  if (screen === 'daily') {
    return (
      <div className="app">
        <DailyScreen
          daily={daily}
          dollars={dollars}
          onClaimBonus={takeDailyBonus}
          onClaimQuest={takeQuest}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'shop' || screen === 'equip') {
    return (
      <div className="app">
        <Shop
          mode={screen}
          coins={coins}
          owned={owned}
          outfit={outfit}
          admin={admin}
          freeMode={freeMode}
          onBuy={buy}
          onEquip={equip}
          onRefund={refund}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'menu') {
    return (
      <div className="app">
        {/* `nudge` is rolled here rather than read straight off `daily`: a game
            left open past midnight is holding yesterday, and yesterday's taken
            bonus would leave the button dark on a day that owes one. */}
        <Menu
          coins={coins}
          dollars={dollars}
          nudge={worthATap(rolled(daily, Date.now()))}
          outfit={outfit}
          roomDone={roomDone}
          admin={admin}
          freeMode={freeMode}
          onRenovate={renovate}
          onUndoRenovate={undoRenovate}
          onToggleFree={toggleFree}
          onOpenDev={() => setDevOpen(true)}
          onPlay={() => setScreen('leagues')}
          onDuel={() => void startDuel()}
          onShop={() => setScreen('shop')}
          onEquip={() => setScreen('equip')}
          onArchive={() => setScreen('archive')}
          onRating={() => setScreen('rating')}
          onDaily={() => setScreen('daily')}
          onFriends={() => setScreen('friends')}
          onSettings={() => setSettingsOpen(true)}
        />
        {pauseOpen && !st.finished && (
        <div className="overlay pause">
          <h2>{t(duel ? 'match.stillRunning' : 'match.paused')}</h2>
          <div className="sub">
            {mm}:{ss} left · you {money(me.netWorth)} · rival {money(rival.netWorth)}
          </div>
          {admin && (
            <button
              className="admin-btn wide"
              onClick={() => {
                setPauseOpen(false);
                setDevOpen(true);
              }}
            >
              DEV · OPEN PANEL
            </button>
          )}
          <div className="result-actions">
            <button className="big-btn ghost" onClick={giveUp}>
              {t('match.surrender')}
            </button>
            <button className="big-btn" onClick={() => setPauseOpen(false)}>
              {t('match.resume')}
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <SettingsOverlay
          onHelp={() => {
            setSettingsOpen(false);
            setHelpOpen(true);
          }}
          onPickLang={(l) => {
            setLang(l);
            // module state, so every screen reads the new language on the next
            // render — and this is the render
            rerender();
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
        {devOpen && (
          <DevPanel
            cfg={cfg}
            seed={seed}
            speed={speed}
            showTruth={showTruth}
            botPreset={botPreset}
            onSeed={setSeed}
            onRestart={restart}
            onSpeed={setSpeed}
            onShowTruth={setShowTruth}
            onBotPreset={setBotPreset}
            onPatch={patch}
            onClose={() => setDevOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hdr">
        <span className="title">BROKER STARS</span>
        <span className="spacer" />
        <button className="icon-btn accent" onClick={() => setHelpOpen(true)} aria-label="help">
          <img src={tex('help.png')} alt="" />
        </button>
        <button
          className="icon-btn"
          onClick={() => setPauseOpen(true)}
          disabled={st.finished}
          aria-label="pause"
        >
          <img src={tex('options.png')} alt="" />
        </button>
      </header>

      {/* Neither of these stops the match: the market is on the server and it
          keeps going whether this phone is attached to it or the other player
          is still watching. Saying so is the whole job. */}
      {duel && duel.conn !== 'open' && !st.finished && (
        <div className="duel-banner bad">{t('duel.reconnecting')}</div>
      )}
      {duel && duel.conn === 'open' && duel.rivalGone && !st.finished && (
        <div className="duel-banner">{t('duel.rivalGone')}</div>
      )}

      <div className="chart-card">
        <div className="chart-wrap">
          <canvas ref={canvasRef} />
          {newsFlash ? (
            <div className="news-flash">{newsFlash}</div>
          ) : (
            warning && <div className="news-flash warning">{warning}: SOMETHING IS COMING</div>
          )}
        </div>
      </div>

      <div className="mid">
        <TraderCard
          name={me.name}
          outfit={outfit}
          netWorth={me.netWorth}
          cash={me.cash}
          held={positionValue(st, me)}
          startCash={cfg.match.startingCash}
          cheapestShare={cheapestShare}
          bankrupt={me.bankrupt}
          hit={isHit(st, HUMAN)}
        />
        <div className={`timer${remaining <= 15 ? ' urgent' : ''}`}>
          {mm}:{ss}
        </div>
        <TraderCard
          name={rival.name}
          outfit={rivalOutfit}
          netWorth={rival.netWorth}
          cash={rival.cash}
          held={duel ? (lastTick.current?.tr[1].hv ?? 0) : positionValue(st, rival)}
          startCash={cfg.match.startingCash}
          cheapestShare={cheapestShare}
          bankrupt={rival.bankrupt}
          hit={isHit(st, rival.idx)}
        />
      </div>

      <AbilityBar
        name={me.ability ? ABILITY_NAME[me.ability] : null}
        owned={highestOwned(owned, 'neck') !== null}
        ready={duel ? Boolean(lastTick.current?.rdy) : canUseAbility(st, HUMAN)}
        spent={me.abilityUsed}
        onUse={fireAbility}
      />

      {undoOffered && (
        <button className="undo-btn" onClick={takeBack}>
          {t('match.takeBack')}
        </button>
      )}

      <div className="rows">
        {cfg.stocks.map((s, i) => {
          const price = st.stocks[i].price;
          const short = isShortSide(st, HUMAN, i);
          const plan = (side: 'buy' | 'sell') =>
            plannedQty(st, { trader: HUMAN, stock: i, side, fraction: TRADE_FRACTION });
          const buyQty = plan('buy');
          const sellQty = plan('sell');
          const held = me.positions[i] !== 0;
          // a side that plans nothing while the match is still on is a side
          // with no money behind it: buying power is cash and nothing else
          const live = !st.finished && !me.bankrupt;
          return (
            <StockRow
              key={s.id}
              stock={s}
              price={price}
              changePct={(price / s.basePrice - 1) * 100}
              position={me.positions[i]}
              shortSide={short}
              canBuy={live && buyQty > 0}
              canSell={live && sellQty < 0}
              buyNeedsCash={live && buyQty === 0}
              sellNeedsCash={live && sellQty === 0}
              floats={floats[i] ?? []}
              kind={
                perks.ui.showKind
                  ? tr(
                      `trait.${s.trait?.kind ?? 'plain'}.short`,
                      TRAIT_SHORT[s.trait?.kind ?? 'plain'],
                    )
                  : undefined
              }
              hint={
                perks.ui.holdDirection && held
                  ? (segmentAt(st.stocks[i].segments, st.tick)?.dir ?? 0)
                  : undefined
              }
              onBuy={() => act(i, 'buy')}
              onSell={() => act(i, 'sell')}
            />
          );
        })}
      </div>

      {countdown !== null && (
        <div className="countdown" key={countdown}>
          <b>{countdown}</b>
        </div>
      )}

      {st.finished && (
        <ResultScreen
          state={st}
          humanIdx={HUMAN}
          award={award}
          /* A duel is paid at the ladder position the SERVER has for you, which
             is not always the league whose companies were dealt: beating a
             friend on the crown board is worth what your own rung is worth.
             Say which one it was, or the payout looks arbitrary. */
          leagueName={leagueName(
            LEAGUES[duel ? (duel.payLeague ?? duel.league) : league] ?? LEAGUES[0],
          )}
          unlockedName={unlockedName}
          onRestart={() => {
            if (duel) {
              void startDuel();
              return;
            }
            const s = String(Math.floor(Math.random() * 1e6));
            hold(league, s);
            restart(s, LEAGUES[league].preset, league, null);
            setScreen(wantsBoardScreen(perks.ui) ? 'board' : 'vs');
          }}
          onMenu={() => (duel ? leaveDuel() : setScreen('leagues'))}
        />
      )}

      {pauseOpen && !st.finished && (
        <div className="overlay pause">
          <h2>{t(duel ? 'match.stillRunning' : 'match.paused')}</h2>
          <div className="sub">
            {mm}:{ss} left · you {money(me.netWorth)} · rival {money(rival.netWorth)}
          </div>
          {admin && (
            <button
              className="admin-btn wide"
              onClick={() => {
                setPauseOpen(false);
                setDevOpen(true);
              }}
            >
              DEV · OPEN PANEL
            </button>
          )}
          <div className="result-actions">
            <button className="big-btn ghost" onClick={giveUp}>
              {t('match.surrender')}
            </button>
            <button className="big-btn" onClick={() => setPauseOpen(false)}>
              {t('match.resume')}
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <SettingsOverlay
          onHelp={() => {
            setSettingsOpen(false);
            setHelpOpen(true);
          }}
          onPickLang={(l) => {
            setLang(l);
            // module state, so every screen reads the new language on the next
            // render — and this is the render
            rerender();
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {devOpen && (
        <DevPanel
          cfg={cfg}
          seed={seed}
          speed={speed}
          showTruth={showTruth}
          botPreset={botPreset}
          onSeed={setSeed}
          onRestart={restart}
          onSpeed={setSpeed}
          onShowTruth={setShowTruth}
          onBotPreset={setBotPreset}
          onPatch={patch}
          onClose={() => setDevOpen(false)}
        />
      )}
    </div>
  );
}
