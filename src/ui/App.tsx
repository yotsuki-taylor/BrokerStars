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
import Character from './Character';
import { drawChart } from './chart';
import {
  AbilityBar,
  Check,
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
import TutorialOverlay from './TutorialOverlay';
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
  linkAvailable,
  linkStatus,
  mintLinkCode,
  onDuelCall,
  openProfile,
  redeemLinkCode,
  undoLink,
  pollDuelCall,
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
  appLink,
  buildMirror,
  canHandOver,
  copyText,
  linkToShare,
  createInvite,
  duelCodeFromLaunch,
  duelCodeIn,
  duelsAvailable,
  shareInvite,
  shoutInvite,
  type Link,
} from './duel';
import { apiBase, deleteAccount } from './api';
import { platform, type Account } from '../platform';
import { friendAppLink, friendCodeFromLaunch, friendCodeIn } from './friends';
import type { DuelCall, DuelError, DuelProfile, DuelTick, ServerMsg } from '../duel/protocol';
import { LINK_CODE_LENGTH, cleanLinkCode, type LinkState } from '../link/protocol';
import { loadHeld, loadPrefs, saveHeld, savePrefs, type BoardPrefs } from './board';
import { LANGS, LANG_KEY, LANG_NAME, lang, setLang, t, tr, type Lang } from './i18n';
import { wipe } from './store';
import { advance, progressOf, startLine, type Line } from './line';
import { ensureGuest, guestName } from './guest';
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
import { markTutorialSeen, tutorialSeen } from './tutorial';
import {
  PRICES,
  highestOwned,
  isBuyable,
  itemId,
  CATALOGUE,
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
  /** the same invitation as a plain web address; `linkToShare` picks between them */
  webLink: string | null;
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
  /**
   * This deployment has a group chat the bot can call the duel out in, so the
   * screen may offer that as well as the link. The server decides — see
   * `worker/src/chat.ts` — and says so when the invitation is minted.
   */
  chat: boolean;
}

/** What the button says. The card in the wardrobe carries the long version. */
/**
 * How often the menu asks whether anybody is calling. Half a minute: slow
 * enough to be nothing on a battery, quick enough that a friend tapping DUEL
 * on your name is not left staring at a lobby wondering.
 */
const CALL_POLL_MS = 30_000;

const ABILITY_NAME: Record<AbilityId, string> = {
  static: 'STATIC',
  halt: 'HALT',
  dossier: 'DOSSIER',
  margincall: 'MARGIN CALL',
  rumour: 'RUMOUR',
};
function haptic(kind: 'light' | 'heavy' = 'light') {
  platform().haptic(kind);
}

/**
 * Display name from the host, when the host has one to give. Cosmetic only —
 * it is client-supplied and unverified, and nothing here trusts it. A host with
 * no name for the player leaves the game calling them what it always called
 * them.
 */
function playerName(): string {
  const name = platform().userName();
  return name ? name.slice(0, 12).toUpperCase() : t('match.you');
}

/**
 * What to call this player on somebody else's screen.
 *
 * The same name, except for the fallback. ТЫ is the right word on your own HUD
 * and the wrong one on a rival's, where a player called YOU is nobody — and it
 * is the word every guest was going up under, since a guest has no host to ask
 * for a name. It has one of its own: the server names each guest as it mints it
 * (`mintGuest`), which is what that name is for.
 */
function duelName(): string {
  const name = platform().userName() || guestName();
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
 * What the corner of the menu opens: help, the tour, and the language the game
 * is in. The language names are never translated — a player who has landed in
 * the wrong one needs to recognise their own, not read ours.
 *
 * `onTutorial` is optional because the corner is on two screens. The tour
 * lights up buttons that only exist on the menu, so the match's own copy of
 * this overlay is handed nothing and simply does not offer it.
 */
/**
 * Signing in, signing out, and the one door that only goes one way.
 *
 * Drawn only where `platform().account` exists, which today means the Android
 * build and nowhere else — a mini app was opened by somebody Telegram had
 * already signed for, and there is nothing here for them to do.
 *
 * Nothing on this panel is required to play. The copy says so, because a sign-in
 * wall on a single-player game is a lie about what the game needs: matches,
 * coins, the office and the wardrobe all work signed out, and what an account
 * buys is the part a server has to keep.
 */
/**
 * The other door into this account, and how to open one.
 *
 * Two hosts meet here and they want opposite halves of the same exchange. In
 * the Android app the player IS a Google account and the question is which
 * Telegram save to join; in Telegram the player HAS the save and the question
 * is what code to give. So one side mints and the other types, and the section
 * below draws whichever half this host is.
 *
 * It appears at all only where a request can be signed — `linkAvailable` —
 * which on Android means after signing in. Before that there is no account to
 * link to anything, and offering it would be offering a door with no house.
 */
function LinkPanel({ canMint }: { canMint: boolean }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<LinkState | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void linkStatus().then((state) => {
      if (alive) setLinked(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Still asking. Drawing the unlinked state and then flipping it is worse than
  // drawing nothing for a moment.
  if (linked === null) return null;

  const undo = async () => {
    setBusy(true);
    setNote(null);
    const done = await undoLink();
    setBusy(false);
    if (!done) {
      setNote(t('account.failed'));
      return;
    }
    setLinked(false);
    setNote(t('link.undone'));
  };

  const getCode = async () => {
    setBusy(true);
    setNote(null);
    const state = await mintLinkCode();
    setBusy(false);
    if (!state) {
      setNote(t('account.failed'));
      return;
    }
    // The server answers `linked` rather than a code when there is nothing to
    // mint, which is an answer and not a failure.
    if (state.linked) setLinked(true);
    else setCode(state);
  };

  const redeem = async () => {
    const clean = cleanLinkCode(typed);
    if (!clean || busy) return;
    setBusy(true);
    setNote(null);
    const error = await redeemLinkCode(clean);
    setBusy(false);
    if (error) {
      setNote(t(LINK_ERROR[error]));
      return;
    }
    // The account this app speaks for has just become a different one. Every
    // screen reads its own corner of the game at mount, so the honest way to
    // show the save that has just arrived is to start again.
    window.location.reload();
  };

  if (linked) {
    return (
      <div className="settings-list">
        <p className="settings-note">{t('link.linked')}</p>
        <button className="big-btn ghost" disabled={busy} onClick={undo}>
          {busy ? t('account.working') : t('link.undo')}
        </button>
        {note && <p className="settings-note">{note}</p>}
      </div>
    );
  }

  if (canMint) {
    // Read out once. The check below happens in JSX and the copy happens inside
    // a callback, and narrowing in the first does not reach the second.
    const minted = code?.code ? code.code.toUpperCase() : null;
    return (
      <div className="settings-list">
        <p className="settings-note">{t('link.why')}</p>
        {minted ? (
          <>
            <p className="settings-note">{t('link.codeIs')}</p>
            <b className="friend-code-value">{minted}</b>
            {/* This code has to get from one device to another by hand, and
                eight characters read off a screen is exactly the length at
                which people start making mistakes. */}
            <button
              className="menu-btn"
              onClick={async () => {
                setCopied(await copyText(minted));
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? (
                <>
                  <Check size={16} /> {t('duel.copied')}
                </>
              ) : (
                t('link.copy')
              )}
            </button>
            <p className="settings-note">{t('link.minutes')}</p>
          </>
        ) : (
          <button className="big-btn" disabled={busy} onClick={getCode}>
            {busy ? t('account.working') : t('link.get')}
          </button>
        )}
        {note && <p className="settings-note">{note}</p>}
      </div>
    );
  }

  return (
    <div className="settings-list">
      <p className="settings-note">{t('link.enter')}</p>
      <form
        className="friend-code-row"
        onSubmit={(e) => {
          e.preventDefault();
          void redeem();
        }}
      >
        <input
          className="friend-code-input"
          value={typed}
          onChange={(e) => setTyped(keepLinkChars(e.target.value))}
          placeholder={t('friends.codeHint')}
          maxLength={LINK_CODE_LENGTH}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        <button className="menu-btn" type="submit" disabled={!cleanLinkCode(typed) || busy}>
          {busy ? t('account.working') : t('link.do')}
        </button>
      </form>
      {note && <p className="settings-note">{note}</p>}
    </div>
  );
}

/** One sentence per way it can go wrong, spelled out so the keys stay literal. */
const LINK_ERROR = {
  nosuch: 'link.err.nosuch',
  self: 'link.err.self',
  busy: 'link.err.busy',
  already: 'link.err.already',
  noserver: 'link.err.noserver',
} as const;

/** The code alphabet, filtered as it is typed. Same rule as a friend code. */
const keepLinkChars = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^0-9BCDFGHJKLMNPQRSTVWXYZ]/g, '')
    .slice(0, LINK_CODE_LENGTH);

/**
 * Signing in, signing out, the one door that only goes one way, and the second
 * door into the same account.
 *
 * `account` is absent on every host that already knows who is playing before
 * the game draws — a mini app is opened by somebody Telegram signed for — so
 * everything about signing in is drawn only where signing in is a thing that
 * happens. Linking is drawn on both, because it takes both.
 *
 * The copy says the game plays without signing in, because it does. Matches,
 * coins, the office and the wardrobe have always worked with no server behind
 * them; an account buys the part a server has to keep.
 */
function AccountPanel({
  account,
  onOwnFooter,
  onSignedIn,
}: {
  account?: Account;
  /**
   * Somebody just signed in, and the game is now a different player's.
   *
   * The profile is fetched once, on the way in (see the handshake in `App`),
   * and a sign-in happens long after that — so without this the office stays
   * empty, the coins stay at zero, and a player who has been playing for weeks
   * in Telegram concludes their save is gone. It is not: nobody asked for it.
   */
  onSignedIn?: () => void;
  /**
   * Told when this panel has taken over the overlay's bottom button.
   *
   * Confirming a deletion and finishing one both need a way out that is not
   * "one step up" — cancel, and a reload — and two buttons a step apart both
   * saying BACK is a screen asking the player to guess. So the panel draws its
   * own and the overlay draws none.
   */
  onOwnFooter: (own: boolean) => void;
}) {
  const [signed, setSigned] = useState(() => account?.signedIn() ?? false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    onOwnFooter(asking || gone);
    // leaving the panel hands the footer back, whatever state it was left in
    return () => onOwnFooter(false);
  }, [asking, gone, onOwnFooter]);

  async function doSignIn() {
    if (!account) return;
    setBusy(true);
    setNote(null);
    const err = await account.signIn();
    setBusy(false);
    // Backing out of the account picker is a decision, not a failure, and a
    // screen that apologises for it is a screen arguing with the player.
    if (err === 'cancelled') return;
    if (err) {
      setNote(t(err === 'refused' || err === 'noserver' ? `account.${err}` : 'account.failed'));
      return;
    }
    setSigned(true);
    onSignedIn?.();
  }

  async function doDelete() {
    setBusy(true);
    setNote(null);
    const done = await deleteAccount();
    setBusy(false);
    // Only when the server says it did it. Forgetting them here while the row
    // lived on would leave an account nobody can reach and nobody can delete.
    if (!done) {
      setNote(t('account.failed'));
      return;
    }
    account?.signOut();
    wipe([LANG_KEY]);
    setGone(true);
  }

  if (gone) {
    return (
      <div className="settings-list">
        <p className="settings-note">{t('account.deleteDone')}</p>
        {/* A reload rather than a state reset: every screen in this game reads
            its own corner of the store at mount, and starting over is exactly
            what reopening the app does. */}
        <button className="big-btn" onClick={() => window.location.reload()}>
          {t('settings.close')}
        </button>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="settings-list">
        <p className="settings-note">{t('account.deleteWhat')}</p>
        <button className="big-btn" disabled={busy} onClick={doDelete}>
          {busy ? t('account.working') : t('account.deleteGo')}
        </button>
        <button className="big-btn ghost" disabled={busy} onClick={() => setAsking(false)}>
          {t('account.keep')}
        </button>
        {note && <p className="settings-note">{note}</p>}
      </div>
    );
  }

  return (
    <>
      {account && (
        <div className="settings-list">
          <p className="settings-note">{signed ? platform().userName() : t('account.out')}</p>
          {signed ? (
            <>
              <button
                className="big-btn ghost"
                disabled={busy}
                onClick={() => {
                  account.signOut();
                  setSigned(false);
                }}
              >
                {t('account.signOut')}
              </button>
              <button className="big-btn ghost" disabled={busy} onClick={() => setAsking(true)}>
                {t('account.delete')}
              </button>
            </>
          ) : (
            <>
              <p className="settings-note">{t('account.why')}</p>
              <button className="big-btn" disabled={busy} onClick={doSignIn}>
                {busy ? t('account.working') : t('account.signIn')}
              </button>
            </>
          )}
          {note && <p className="settings-note">{note}</p>}
        </div>
      )}
      {/* Minting is for the side keeping its save, which is the side that is
          not itself a Google account. */}
      {linkAvailable() && <LinkPanel canMint={!account} />}
    </>
  );
}

/**
 * An invitation that arrived in a browser on a phone that may also have the app.
 *
 * The duel screen asks the same question in its own layout, because a duel
 * arriving has a screen of its own to ask on. A friend invitation does not: it
 * lands on the friends list, so the question goes over the top of it.
 *
 * An anchor rather than a button, for the reason written out in `canHandOver`:
 * a tap on a real link is what an Android browser hands to the system, and a
 * browser with nothing to hand it to simply stays here, where the other button
 * still works.
 */
function HandoverOverlay({ href, onHere }: { href: string; onHere: () => void }) {
  return (
    <div className="overlay handover">
      <h2>{t('friends.title')}</h2>
      <p>{t('invite.handover')}</p>
      <div className="settings-list">
        <a className="big-btn" href={href}>
          {t('duel.inApp')}
        </a>
        <button className="menu-btn" onClick={onHere}>
          {t('invite.here')}
        </button>
      </div>
    </div>
  );
}

/**
 * The welcome present, the one time it is given.
 *
 * A new player's first match is played on a board they were never shown,
 * because seeing it beforehand is what the first item in the wardrobe buys and
 * they have no wardrobe. So finishing a match earns them one
 * (`worker/src/profile.ts`), and this is where the game says so.
 *
 * Drawn on the trader rather than as a floating sprite: every item in this game
 * is a shape cut to sit on a head or a collar, and alone it reads as a prop
 * rather than as something somebody is wearing. Which is also the honest
 * picture — the server put it on as well as in the drawer.
 *
 * The nudge towards the shop is the point of the screen as much as the present
 * is. A player who has just been handed a thing that changes what they know is
 * the one moment they will believe that the rest of the wardrobe does too.
 */
function GiftOverlay({ onShop, onClose }: { onShop: () => void; onClose: () => void }) {
  const card = CATALOGUE.hat.common;
  return (
    <div className="overlay gift">
      <h2>{t('gift.title')}</h2>
      <div className="gift-art">
        <Character outfit={{ hat: 'common' }} />
      </div>
      <b className="gift-name">{tr('item.hat.common.name', card.name)}</b>
      <p className="gift-text">{tr('item.hat.common.text', card.text)}</p>
      <p className="settings-note gift-why">{t('gift.why')}</p>
      <p className="settings-note gift-more">{t('gift.more')}</p>
      <div className="settings-list">
        <button className="big-btn" onClick={onShop}>
          {t('gift.shop')}
        </button>
        <button className="menu-btn" onClick={onClose}>
          {t('gift.later')}
        </button>
      </div>
    </div>
  );
}

function SettingsOverlay({
  onHelp,
  onTutorial,
  onSignedIn,
  onPickLang,
  onClose,
}: {
  onHelp: () => void;
  onTutorial?: () => void;
  /** Passed straight to the account panel; see `AccountPanel`. */
  onSignedIn?: () => void;
  onPickLang: (l: Lang) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<'menu' | 'lang' | 'account'>('menu');
  const [ownFooter, setOwnFooter] = useState(false);
  const account = platform().account;
  // Drawn for a host where signing in happens, and also for one where it does
  // not but a second way in can still be arranged — which is Telegram.
  const hasAccount = Boolean(account) || linkAvailable();
  const title =
    view === 'lang'
      ? t('settings.language')
      : view === 'account'
        ? t('account.title')
        : t('settings.title');
  return (
    <div className="overlay settings">
      <h2>{title}</h2>
      {view === 'lang' ? (
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
      ) : view === 'account' && hasAccount ? (
        <AccountPanel account={account} onOwnFooter={setOwnFooter} onSignedIn={onSignedIn} />
      ) : (
        <div className="settings-list">
          <button className="big-btn ghost" onClick={onHelp}>
            {t('settings.help')}
          </button>
          {onTutorial && (
            <button className="big-btn ghost" onClick={onTutorial}>
              {t('settings.tutorial')}
            </button>
          )}
          <button className="big-btn ghost" onClick={() => setView('lang')}>
            {t('settings.language')}
          </button>
          {/* Signing in, or linking, or both. */}
          {hasAccount && (
            <button className="big-btn ghost" onClick={() => setView('account')}>
              {t('settings.account')}
            </button>
          )}
        </div>
      )}
      {/* One step up, whatever that is from here. Picking a language used to
          leave CLOSE as the only way out of it, so getting back to the settings
          list meant leaving the settings and opening them again.

          Gone entirely while the account panel is asking something: see
          `onOwnFooter`. */}
      {!ownFooter && (
        <button className="big-btn" onClick={() => (view === 'menu' ? onClose() : setView('menu'))}>
          {view === 'menu' ? t('settings.close') : t('common.back')}
        </button>
      )}
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
  const [tourOpen, setTourOpen] = useState(false);
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
  /** The duel chart's own clock — see `ui/line.ts`. */
  const line = useRef<Line>(startLine());
  const [award, setAward] = useState<Award | null>(null);
  /** name of the league this match's win opened, shown once on the result screen */
  const [unlockedName, setUnlockedName] = useState<string | null>(null);
  /** Null until the first profile answers; see `applyProfile`. */
  const hadHat = useRef<{ hat: boolean; spent: number } | null>(null);
  const [gifted, setGifted] = useState(false);
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
    devOpen ||
    helpOpen ||
    pauseOpen ||
    settingsOpen ||
    tourOpen ||
    countdown !== null ||
    screen !== 'match';

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
    /**
     * Did a hat just appear where there was none?
     *
     * That is the welcome present arriving (`giftFirstHat` on the server), and
     * noticing it this way means the server needs to say nothing extra: the
     * profile is refetched after every match anyway, and the thing simply is
     * not there and then is.
     *
     * The first profile of a session only records the state — `null` until then
     * — so a player who already owns a hat is never told they were given one.
     *
     * `spent` is what tells a present from a purchase. Both put a hat in the
     * drawer and both come back through here, but only one of them costs
     * something — so a hat that arrives while the balance stands still is the
     * one the server gave away. Otherwise somebody buying their first hat over
     * the counter would be congratulated for finishing a match.
     */
    const hasHat = Boolean(p.owned.hat);
    const before = hadHat.current;
    if (before && !before.hat && hasHat && p.spent <= before.spent) setGifted(true);
    hadHat.current = { hat: hasHat, spent: p.spent };

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
      // A guest session first, if this host has no identity of its own: without
      // one the handshake below is unsigned and the server refuses it, which is
      // how a browser tab and a fresh install used to be nobody (`ui/guest.ts`).
      ensureGuest(Boolean(platform().authToken()))
        .then(() => flushPending())
        .then(() =>
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
        // How the sliding works, and why it is not simply "draw the newest tick
        // that arrived", is `ui/line.ts`. What matters here is the one thing it
        // hands back: `progress` is where the right-hand edge has got to, and it
        // is regularly NEGATIVE — the edge sits about a tick behind the newest
        // price and sometimes further. Whatever reads it has to cope with that;
        // `headOf` in `ui/chart.ts` did not, and that was the chart jumping.
        const tickMs = st.cfg.match.tickMs;
        if (st.finished) {
          line.current = { pos: st.tick, speed: 1 };
          progressRef.current = 1;
        } else {
          line.current = advance(line.current, {
            tick: st.tick,
            sinceTick: now - lastTickAt.current,
            dt,
            tickMs,
          });
          progressRef.current = progressOf(line.current, st.tick);
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

  /**
   * The tour, the first time this device sees the menu.
   *
   * It waits for the menu rather than firing on mount: the game can open
   * straight into a duel somebody was invited to, and a tour of buttons that
   * are not on the screen would be pointing at nothing. The ref is what keeps
   * it to once — `tutorialSeen` is already false again on the next render if
   * the store is not writable, and nobody wants the tour back every time they
   * step out of the shop.
   */
  const tourChecked = useRef(false);
  useEffect(() => {
    if (tourChecked.current || screen !== 'menu') return;
    tourChecked.current = true;
    if (tutorialSeen()) return;
    markTutorialSeen();
    setTourOpen(true);
  }, [screen]);

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
          /**
           * The host's friend has turned up. If the host is looking at this
           * screen they can see that for themselves; if they are not, they are
           * almost certainly in the chat app they went to send the link from,
           * and the match has already started without them -- the object begins
           * the moment both seats are taken, whether or not either phone is
           * watching (`worker/src/duel.ts`).
           *
           * So this is the one thing in the game worth interrupting somebody
           * for, and only for the host: the guest arriving IS the guest, and
           * has this screen in front of them.
           */
          if (msg.you === 0 && msg.rival && document.hidden) {
            platform().notify?.(
              t('duel.notifyTitle'),
              t('duel.notifyBody', { name: msg.rival.name }),
            );
          }
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
          line.current = startLine();
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
        webLink: null,
        expiresAt: null,
        league: leagueRef.current,
        rival: null,
        error: null,
        conn: 'connecting',
        rivalGone: false,
        payLeague: null,
        invited: null,
        chat: false,
        ...extra,
      });
      setScreen('duel');
      duelRef.current = new DuelSocket(
        code,
        { name: duelName(), outfit: outfitRef.current },
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
      webLink: null,
      expiresAt: null,
      league: leagueRef.current,
      rival: null,
      error: reason,
      conn: 'lost',
      rivalGone: false,
      payLeague: null,
      invited: null,
      chat: false,
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
        webLink: null,
        expiresAt: null,
        league: leagueRef.current,
        rival: null,
        error: null,
        conn: 'connecting',
        rivalGone: false,
        payLeague: null,
        invited: null,
        chat: false,
      });
      setScreen('duel');
      const invite = await createInvite(leagueRef.current, outfitRef.current, friend?.id);
      if (!invite) return duelRefusal('net');
      // The invitation exists and the next thing the player does is leave the
      // app to send it. Asking now is asking while the reason is on screen --
      // and after this there is no screen to ask on (`askToNotify`).
      platform().askToNotify?.();
      connect(invite.code, 'waiting', {
        code: invite.code,
        link: invite.link,
        webLink: invite.webLink,
        expiresAt: invite.expiresAt,
        invited: friend ? { name: friend.name, sent: invite.sent } : null,
        chat: Boolean(invite.chat),
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

  /**
   * Opened on somebody's invitation: straight into it, whatever screen was next.
   *
   * Except on an Android phone outside the app, where the same invitation may
   * belong in an app this page cannot see. There it asks first — and asks
   * BEFORE connecting, because connecting takes the seat and the seat cannot be
   * handed on (`canHandOver` says why at length).
   */
  useEffect(() => {
    const code = duelCodeFromLaunch();
    if (!code) return;
    if (canHandOver()) {
      setDuel({
        phase: 'handover',
        code,
        link: null,
        webLink: null,
        expiresAt: null,
        league: leagueRef.current,
        rival: null,
        error: null,
        conn: 'connecting',
        rivalGone: false,
        payLeague: null,
        invited: null,
        chat: false,
      });
      setScreen('duel');
      return;
    }
    connect(code, 'joining', { code });
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
  /**
   * The same invitation, held rather than spent, while an Android browser asks
   * whether the app should have it instead. Null everywhere else, which is the
   * behaviour this screen has always had.
   */
  const [friendOffer, setFriendOffer] = useState<string | null>(null);
  useEffect(() => {
    const code = friendCodeFromLaunch();
    if (!code) return;
    if (canHandOver()) setFriendOffer(code);
    else setFriendCode(code);
    setScreen('friends');
  }, []);

  /**
   * Somebody calling this player out to a duel by name.
   *
   * Three ways it arrives and none of them is a push notification: clipped to
   * the session the game opens with, clipped to the friends list, or from the
   * timer below. Which was the point — the bot can only write to a player who
   * has Telegram, and half of them now do not (worker/src/calls.ts).
   *
   * The server hands a call over once and forgets it, so this is the only copy.
   * It is dropped on the floor when the player says NOT NOW, which is the right
   * amount of ceremony for an invitation that expires in a quarter of an hour.
   */
  const [call, setCall] = useState<DuelCall | null>(null);
  useEffect(() => onDuelCall(setCall), []);

  /**
   * It also expires on its own, without anybody tapping anything. A banner
   * offering a duel that has already closed is worse than no banner.
   */
  useEffect(() => {
    if (!call) return;
    const left = call.expiresAt - Date.now();
    if (left <= 0) {
      setCall(null);
      return;
    }
    const timer = window.setTimeout(() => setCall(null), left);
    return () => window.clearTimeout(timer);
  }, [call]);

  /**
   * Asking, while the player is standing in the menu and nowhere else.
   *
   * The menu is where a duel would be accepted from and the one screen nobody
   * is busy on. Asking during a match would be asking a phone to do something
   * else during the eighty seconds it has a job, and asking while the game is
   * in somebody's pocket would be asking for nothing at all — so the interval
   * is hung on the screen and dies with it.
   */
  useEffect(() => {
    if (screen !== 'menu') return;
    const timer = window.setInterval(() => void pollDuelCall(), CALL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [screen]);

  /**
   * The same two invitations, arriving at a game that is already running.
   *
   * Both effects above read once, before the first frame, which is the whole
   * story in a browser and in a mini app: a link there IS a page load. On
   * Android it is not. The app stays resident, the link wakes it, and nothing
   * reloads — so without this a friend's invitation would open the game and
   * then sit there doing nothing, which looks exactly like a broken link.
   *
   * Joining takes the player out of whatever they were doing, and that is the
   * right reading of a tap on an invitation: they asked to be somewhere else.
   */
  useEffect(
    () =>
      platform().onLink((param) => {
        const duelCode = duelCodeIn(param);
        if (duelCode) {
          connect(duelCode, 'joining', { code: duelCode });
          return;
        }
        const friend = friendCodeIn(param);
        if (friend) {
          setFriendCode(friend);
          setScreen('friends');
        }
      }),
    [connect],
  );

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
      // where the duel chart's right-hand edge is, which is the thing that has
      // been wrong twice now -- see ui/line.ts and `headOf` in ui/chart.ts
      line: () => ({
        tick: stateRef.current.tick,
        pos: line.current.pos,
        speed: line.current.speed,
        progress: progressRef.current,
      }),
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
          // Only in a duel: a match against a bot has already shown these on a
          // screen of their own, and showing them twice would be a screen that
          // says nothing new.
          stocks={duel && wantsBoardScreen(perks.ui) ? cfg.stocks : null}
          quirks={perks.ui.showQuirks}
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
          appHref={duel.phase === 'handover' && duel.code ? appLink(duel.code) : null}
          onPlayHere={() => {
            if (duel.code) connect(duel.code, 'joining', { code: duel.code });
          }}
          onSend={() => {
            const send = linkToShare(duel.link, duel.webLink);
            if (send) shareInvite(send, t('duel.inviteText'));
          }}
          onCopy={() => {
            const send = linkToShare(duel.link, duel.webLink);
            return send ? copyText(send) : Promise.resolve(false);
          }}
          // Only when the server said there is a chat to shout into: the button
          // is drawn from whether this prop is here at all.
          onShout={
            duel.chat && duel.code ? () => shoutInvite(duel.code as string) : undefined
          }
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
        {/* Over the friends screen rather than instead of it: the answer is
            about where this invitation should land, and the list underneath is
            what it lands in. */}
        {friendOffer && (
          <HandoverOverlay
            href={friendAppLink(friendOffer)}
            onHere={() => {
              setFriendCode(friendOffer);
              setFriendOffer(null);
            }}
          />
        )}
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
            setFriendOffer(null);
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
        {/* Over the menu rather than on a screen of its own: an invitation with
            fifteen minutes on it is not worth interrupting anybody for, and it
            is worth being unmissable while they are deciding what to play. */}
        {call && (
          <div className="duel-call">
            <span className="duel-call-who">{t('call.from', { name: call.from })}</span>
            <div className="duel-call-actions">
              <button className="menu-btn" onClick={() => setCall(null)}>
                {t('call.ignore')}
              </button>
              <button
                className="big-btn"
                onClick={() => {
                  const { code } = call;
                  setCall(null);
                  connect(code, 'joining', { code });
                }}
              >
                {t('call.accept')}
              </button>
            </div>
          </div>
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

      {/* Over whatever screen the player is on when the profile comes back with
          it, which is the result screen they just finished on. */}
      {gifted && (
        <GiftOverlay
          onShop={() => {
            setGifted(false);
            setScreen('shop');
          }}
          onClose={() => setGifted(false)}
        />
      )}

      {settingsOpen && (
        <SettingsOverlay
          // A sign-in makes this a different player's game; the handshake that
          // fetched a profile ran long before it, so ask again.
          onSignedIn={() => reconcile(refreshProfile())}
          onHelp={() => {
            setSettingsOpen(false);
            setHelpOpen(true);
          }}
          onTutorial={() => {
            setSettingsOpen(false);
            setTourOpen(true);
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
      {tourOpen && <TutorialOverlay onClose={() => setTourOpen(false)} />}
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

      {/* Over whatever screen the player is on when the profile comes back with
          it, which is the result screen they just finished on. */}
      {gifted && (
        <GiftOverlay
          onShop={() => {
            setGifted(false);
            setScreen('shop');
          }}
          onClose={() => setGifted(false)}
        />
      )}

      {settingsOpen && (
        <SettingsOverlay
          // A sign-in makes this a different player's game; the handshake that
          // fetched a profile ran long before it, so ask again.
          onSignedIn={() => reconcile(refreshProfile())}
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
