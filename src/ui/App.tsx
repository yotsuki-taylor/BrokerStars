import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, cloneConfig, type Config } from '../sim/config';
import { TRAIT_SHORT, pickCompanies, type PickOptions } from '../sim/companies';
import { segmentAt } from '../sim/market';
import { createMatch, resign, step } from '../sim/match';
import type { TraderPerks } from '../sim/perks';
import { Rng, hashSeed } from '../sim/rng';
import { applyAction, buyingPower, canUndo, isShortSide, plannedQty, undoLast } from '../sim/trading';
import type { MatchState } from '../sim/types';
import { drawChart } from './chart';
import {
  SizeSelector,
  StockRow,
  TraderCard,
  money,
  signed,
  tex,
  type FloatPnl,
} from './components';
import BoardScreen from './BoardScreen';
import Companies from './Companies';
import DevPanel from './DevPanel';
import LeagueSelect from './LeagueSelect';
import Menu from './Menu';
import ResultScreen from './ResultScreen';
import Shop from './Shop';
import VersusScreen from './VersusScreen';
import { NO_AWARD, awardFor, loadStars, saveStars, tradedWell, type Award } from './progress';
import { loadSeen, saveSeen, withSeen } from './archive';
import { loadPrefs, savePrefs, type BoardPrefs } from './board';
import { perksFor, wantsBoardScreen } from './perks';
import {
  LEAGUES,
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
  const name = String(u?.first_name ?? u?.username ?? '').trim();
  return name ? name.slice(0, 12).toUpperCase() : 'YOU';
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
): MatchState {
  const h = hashSeed(seed);
  return createMatch(h, cfg, {
    traders: [
      { name: playerName(), kind: 'human', preset: 'medium', perks },
      { name: 'RIVAL', kind: 'bot', preset },
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
      <h2>HOW TO PLAY</h2>
      <p>
        120 seconds. You and your rival trade the same three stocks. Whoever ends with the bigger
        net worth — cash plus positions — wins. Positions close automatically at the whistle, so
        the finish is never a race to sell.
      </p>
      <p>
        The three companies change from match to match, and each one has a habit of its own — one
        commits to a trend, one goes dead for seconds at a time, one climbs until the day it
        doesn&rsquo;t. COMPANIES on the menu keeps every one you have met and what it does.
      </p>
      <p>
        The year runs in four quarters, ruled off on the chart. Some companies only do their trick
        at a quarter close, so watch the line as one goes by.
      </p>
      <p>
        SIZE sets how much of your buying power one tap commits. BUY goes long. SELL closes a
        long, or opens a short when you hold nothing — then you profit when the price falls. Big
        orders move the price against you, so the rival feels every trade you make.
      </p>
      <p>
        Dashed line on the chart is your average entry: above it you are in profit. Win a match to
        earn stars — the tougher the league, the bigger the payout. Bank enough wins in a league
        and the next one opens.
      </p>
      <button className="big-btn" onClick={onClose}>
        GOT IT
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
  const prefsRef = useRef(boardPrefs);
  prefsRef.current = boardPrefs;
  const stateRef = useRef<MatchState>(
    makeMatch(baseCfg.current, seed, botPreset, league, perks.trader, {}),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);

  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const [speed, setSpeed] = useState(1);
  const [showTruth, setShowTruth] = useState(false);
  const [fraction, setFraction] = useState(0.25);
  const [devOpen, setDevOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [floats, setFloats] = useState<Record<number, FloatPnl[]>>({});
  const [newsFlash, setNewsFlash] = useState<string | null>(null);
  const [screen, setScreen] = useState<
    'menu' | 'shop' | 'equip' | 'archive' | 'leagues' | 'board' | 'vs' | 'match'
  >('menu');
  /** rerolls of the board still owed this match, and a board the player named */
  const [rerollsLeft, setRerollsLeft] = useState(0);
  const forcedRef = useRef<readonly string[] | null>(null);
  const [stars, setStars] = useState(loadStars);
  /** companies the player has met — filed by the match that put them up */
  const [seenCompanies, setSeenCompanies] = useState<Set<string>>(loadSeen);
  const [owned, setOwned] = useState<Set<string>>(loadOwned);
  const [roomDone, setRoomDone] = useState(loadRoom);
  const [freeMode, setFreeMode] = useState(loadFreeMode);
  const [rivalOutfit, setRivalOutfit] = useState<Outfit>(() => randomOutfit(Math.random));
  /** 3, 2, 1 before the first tick; the match is frozen while it runs */
  const [countdown, setCountdown] = useState<number | null>(null);
  const admin = isAdmin();
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
    devOpen || helpOpen || pauseOpen || countdown !== null || screen !== 'match';

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

      if (!st.finished && !ui.current.paused) {
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

      if (st.finished && !awarded.current) {
        awarded.current = true;
        const me = st.traders[HUMAN];
        const li = leagueRef.current;
        const mods = perksRef.current.ui;
        const a =
          st.resigned === HUMAN
            ? NO_AWARD
            : awardFor(
                st.winner === HUMAN,
                st.winner === null,
                tradedWell(me.netWorth, st.cfg.match.startingCash, mods.profitBar),
                LEAGUES[li].reward,
                { starMult: mods.starMult, lossPaysDraw: mods.lossPaysDraw },
              );
        setAward(a);
        if (a.total > 0) {
          setStars((prev) => {
            const next = prev + a.total;
            saveStars(next);
            return next;
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
          setUnlockedName(opened > unlockedCount(before) ? LEAGUES[opened - 1].name : null);
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
      const match = makeMatch(baseCfg.current, s, p, li, perksRef.current.trader, {
        pin: prefs.pin,
        ban: prefs.ban,
        force: forcedRef.current,
      });
      stateRef.current = match;
      // meeting a company in a match is what files it in the archive
      setSeenCompanies((prev) => {
        const next = withSeen(prev, match.cfg.stocks.map((x) => x.id));
        if (next !== prev) saveSeen(next);
        return next;
      });
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

  /** Take the last trade back, if the coat is still offering. */
  const takeBack = () => {
    if (!undoLast(stateRef.current, HUMAN)) return;
    haptic('heavy');
    setFloats({});
    rerender();
  };

  const floatId = useRef(1);
  const act = (stockIdx: number, side: 'buy' | 'sell') => {
    const st = stateRef.current;
    if (st.finished || st.traders[HUMAN].bankrupt) return;
    const trade = applyAction(st, { trader: HUMAN, stock: stockIdx, side, fraction });
    if (!trade) return;
    haptic(Math.abs(trade.realized) > 1 ? 'heavy' : 'light');
    const id = floatId.current++;
    const text =
      trade.realized !== 0
        ? `${signed(trade.realized)}`
        : `${trade.qty > 0 ? '+' : '-'}${Math.abs(trade.qty)} SH`;
    const item: FloatPnl = { id, text, good: trade.realized !== 0 ? trade.realized > 0 : true };
    setFloats((f) => ({ ...f, [stockIdx]: [...(f[stockIdx] ?? []), item] }));
    window.setTimeout(
      () =>
        setFloats((f) => ({
          ...f,
          [stockIdx]: (f[stockIdx] ?? []).filter((x) => x.id !== id),
        })),
      900,
    );
    rerender();
  };

  // Changing clothes changes the terms, but not for a match that already
  // exists: perks are read when restart() builds the next one.
  const equip = (slot: Slot, rarity: Rarity) => {
    setOutfit((prev) => {
      const next = { ...prev, [slot]: rarity };
      saveOutfit(next);
      return next;
    });
    haptic();
  };

  /** A slot is climbed a rung at a time, so only one rarity is ever for sale. */
  const buy = (slot: Slot, rarity: Rarity) => {
    if (!isBuyable(owned, slot, rarity)) return;
    const price = freeMode ? 0 : PRICES[rarity];
    if (stars < price) return;
    addStars(-price);
    setOwned((prev) => {
      const next = new Set(prev).add(itemId(slot, rarity));
      saveOwned(next);
      return next;
    });
    equip(slot, rarity);
    haptic('heavy');
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
    if (stars < price) return;
    addStars(-price);
    setRoomDone((prev) => {
      const next = prev + 1;
      saveRoom(next);
      return next;
    });
    haptic('heavy');
  };

  /** Dev only: step the room back and hand the stars back. */
  const undoRenovate = () => {
    if (!admin || roomDone === 0) return;
    addStars(ROOM_STEPS[roomDone - 1].price);
    setRoomDone((prev) => {
      const next = prev - 1;
      saveRoom(next);
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
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(Math.floor(remaining % 60)).padStart(2, '0');

  if (screen === 'leagues') {
    return (
      <div className="app">
        <LeagueSelect
          stars={stars}
          wins={leagueWins}
          initial={league}
          onBack={() => setScreen('menu')}
          onPlay={(i) => {
            setLeague(i);
            savePick(i);
            restart(String(Math.floor(Math.random() * 1e6)), LEAGUES[i].preset, i, null);
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
          leagueName={LEAGUES[league].name}
          leagueIndex={league}
          stocks={cfg.stocks}
          ui={perks.ui}
          prefs={boardPrefs}
          rerollsLeft={rerollsLeft}
          onReroll={() => {
            setRerollsLeft((n) => Math.max(0, n - 1));
            restart(String(Math.floor(Math.random() * 1e6)), undefined, league, null, true);
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
          onReady={() => {
            setScreen('match');
            setCountdown(3);
          }}
          onCancel={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'archive') {
    return (
      <div className="app">
        <Companies seen={seenCompanies} onBack={() => setScreen('menu')} />
      </div>
    );
  }

  if (screen === 'shop' || screen === 'equip') {
    return (
      <div className="app">
        <Shop
          mode={screen}
          stars={stars}
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
        <Menu
          stars={stars}
          outfit={outfit}
          roomDone={roomDone}
          admin={admin}
          freeMode={freeMode}
          onRenovate={renovate}
          onUndoRenovate={undoRenovate}
          onToggleFree={toggleFree}
          onOpenDev={() => setDevOpen(true)}
          onPlay={() => setScreen('leagues')}
          onShop={() => setScreen('shop')}
          onEquip={() => setScreen('equip')}
          onArchive={() => setScreen('archive')}
          onHelp={() => setHelpOpen(true)}
        />
        {pauseOpen && !st.finished && (
        <div className="overlay pause">
          <h2>PAUSED</h2>
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
            <button
              className="big-btn ghost"
              onClick={() => {
                resign(stateRef.current, HUMAN);
                setPauseOpen(false);
                rerender();
              }}
            >
              SURRENDER
            </button>
            <button className="big-btn" onClick={() => setPauseOpen(false)}>
              RESUME
            </button>
          </div>
        </div>
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
          startCash={cfg.match.startingCash}
          bankrupt={me.bankrupt}
        />
        <div className={`timer${remaining <= 15 ? ' urgent' : ''}`}>
          {mm}:{ss}
        </div>
        <TraderCard
          name={rival.name}
          outfit={rivalOutfit}
          netWorth={rival.netWorth}
          startCash={cfg.match.startingCash}
          bankrupt={rival.bankrupt}
        />
      </div>

      <SizeSelector
        value={fraction}
        power={buyingPower(st, me)}
        cheapestShare={Math.min(...st.stocks.map((s) => s.price))}
        onChange={setFraction}
      />

      {undoOffered && (
        <button className="undo-btn" onClick={takeBack}>
          TAKE THAT BACK
        </button>
      )}

      <div className="rows">
        {cfg.stocks.map((s, i) => {
          const price = st.stocks[i].price;
          const short = isShortSide(st, HUMAN, i);
          const buyQty = plannedQty(st, { trader: HUMAN, stock: i, side: 'buy', fraction });
          const sellQty = plannedQty(st, { trader: HUMAN, stock: i, side: 'sell', fraction });
          const held = me.positions[i] !== 0;
          return (
            <StockRow
              key={s.id}
              stock={s}
              price={price}
              changePct={(price / s.basePrice - 1) * 100}
              position={me.positions[i]}
              shortSide={short}
              canBuy={!st.finished && !me.bankrupt && buyQty > 0}
              canSell={!st.finished && !me.bankrupt && sellQty < 0}
              floats={floats[i] ?? []}
              kind={perks.ui.showKind ? TRAIT_SHORT[s.trait?.kind ?? 'plain'] : undefined}
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
          leagueName={LEAGUES[league].name}
          unlockedName={unlockedName}
          onRestart={() => {
            restart(String(Math.floor(Math.random() * 1e6)), LEAGUES[league].preset, league, null);
            setScreen(wantsBoardScreen(perks.ui) ? 'board' : 'vs');
          }}
          onMenu={() => setScreen('leagues')}
        />
      )}

      {pauseOpen && !st.finished && (
        <div className="overlay pause">
          <h2>PAUSED</h2>
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
            <button
              className="big-btn ghost"
              onClick={() => {
                resign(stateRef.current, HUMAN);
                setPauseOpen(false);
                rerender();
              }}
            >
              SURRENDER
            </button>
            <button className="big-btn" onClick={() => setPauseOpen(false)}>
              RESUME
            </button>
          </div>
        </div>
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
