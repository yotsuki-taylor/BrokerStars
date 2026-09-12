import React, { useCallback, useEffect, useState } from 'react';
import { Check, Coin, Lock, People } from './components';
import { addFriend, fetchFriends } from './api';
import { FRIEND_CODE_LENGTH, cleanCode } from '../friends/protocol';

/**
 * Keep only what a code can be made of, as it is typed.
 *
 * The alphabet is base32 without vowels, so a code can never spell anything and
 * never contains a pair a phone keyboard confuses — and a character that cannot
 * be in one is a character that will not be missed. Refusing it here rather
 * than at the button means the box never holds something that cannot work, so
 * there is nothing to explain afterwards.
 *
 * Uppercase on the way in and lowercase on the way out (`cleanCode`): a code
 * reads better shouted, and the server only ever sees the quiet version.
 */
const keepCodeChars = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^0-9BCDFGHJKLMNPQRSTVWXYZ]/g, '')
    .slice(0, FRIEND_CODE_LENGTH);
import { copyText, friendsAvailable, linkToShare, openChat, shareInvite } from './friends';
import { t } from './i18n';
import VisitScreen from './VisitScreen';
import type { Friend, FriendError, FriendList, InviteStanding } from '../friends/protocol';

/**
 * What an invitation is worth, drawn like a thing on the shelf rather than like
 * an advertisement.
 *
 * It sits directly above the button that sends one, because that is the moment
 * it is worth knowing, and it borrows the archive's award row wholesale: the
 * same box, mark, title and small print. A player has seen that shape before
 * and knows what it means -- something with a condition on it and a number that
 * fills up.
 *
 * The condition is on the card rather than in a footnote. Finding out that the
 * coins wait for the friend's third match AFTER sending the link would be the
 * kind of surprise that makes somebody think the game cheated them.
 *
 * Null standing -- a server too old to know about any of this -- draws nothing
 * at all rather than a card with zeroes in it.
 */
function InviteCard({ standing }: { standing: InviteStanding | null }) {
  if (!standing || standing.cap <= 0) return null;
  const { paid, cap, coins, matches } = standing;
  const done = paid >= cap;
  return (
    <div className={`award invite-card${done ? ' got' : ''}`}>
      <span className="award-mark">{done ? '★' : <Coin size={15} />}</span>
      <span className="award-text">
        <b>{t('invite.title', { coins })}</b>
        <i>{t(done ? 'invite.done' : 'invite.how', { matches })}</i>
        {/* Five pips rather than a filled track: the number that matters is
            how many invitations are left, and five things you can count beats
            a bar you have to measure. */}
        <span className="invite-pips" role="img" aria-label={`${paid}/${cap}`}>
          {Array.from({ length: cap }, (_, i) => (
            <i key={i} className={`invite-pip${i < paid ? ' lit' : ''}`} />
          ))}
        </span>
      </span>
      <span className="award-bar">
        {paid}/{cap}
      </span>
    </div>
  );
}

/**
 * Everybody the player knows, and the button that makes one more.
 *
 * The list is the friends' own standing rather than anything about the
 * friendship: coins earned, best first, which is the rating screen's table cut
 * down to the people whose names mean something. Nobody is thirtieth among
 * their own friends.
 *
 * ADD A FRIEND opens Telegram's share sheet with a link on it. The link is a
 * standing one — it does not expire and is not used up, so it can go to a group
 * chat and be tapped by four people (`src/friends/protocol.ts` says why that is
 * the right trade for this and the wrong one for a duel).
 *
 * Under all of it, the chat. This screen is the one place in the game that can
 * be empty through nobody's fault — a player with no friends is offered a link
 * and nobody to send it to — so the last thing on it is a room full of people
 * in exactly that position. It is a plain link out of the game and not a
 * feature: no list to load, nothing to go wrong, and it is there whether the
 * list came back or not.
 *
 * A row is a button, and what it opens is two: VISIT, which is their room, and
 * DUEL, which calls them out by name. The little menu is anchored to the row
 * it came from and closes on a tap anywhere else — the scrim under it is the
 * whole of that, and it is what makes the menu dismissable without a cancel
 * button taking up a third of it.
 */

/** Where a row's menu sits, worked out from the row at the moment it is tapped. */
interface Popup {
  friend: Friend;
  /** viewport coordinates: the menu is fixed, so the list can never clip it */
  x: number;
  y: number;
  /** not enough room underneath, so it hangs off the top edge of the row */
  above: boolean;
}

/**
 * The menu is about 115 tall — two buttons, the gap and the padding — and this
 * is that with a margin on it. Only used to decide which way to open, so being
 * generous costs nothing and being short costs a menu touching the bottom of
 * the screen.
 */
const POPUP_H = 132;

/**
 * The way out of an empty screen: the game's own chat.
 *
 * Drawn under the list and under the notice that stands in for one, because
 * those are the two screens a player with nobody actually sees — a list that
 * came back empty and a list that did not come back at all. It is a link and
 * nothing else, so unlike everything above it there is no state in which it
 * has nothing to offer.
 */
function ChatCall() {
  return (
    <div className="friend-chat">
      <p>{t('friends.chatPitch')}</p>
      <button className="menu-btn" onClick={openChat}>
        {t('friends.chatJoin')}
      </button>
    </div>
  );
}

/** Nothing to show, and which nothing it is. Never a spinner that never stops. */
function Notice({ line }: { line: string }) {
  return (
    <div className="arch-soon">
      <Lock size={30} />
      <b>{t('friends.title')}</b>
      <p>{line}</p>
    </div>
  );
}

function FriendLine({
  row,
  rank,
  onOpen,
}: {
  row: Friend;
  rank: number;
  onOpen: (row: Friend, at: DOMRect) => void;
}) {
  return (
    <button
      className="friend-line"
      onClick={(e) => onOpen(row, e.currentTarget.getBoundingClientRect())}
    >
      <span className="rating-rank">{rank}</span>
      <span className="rating-who">{row.name}</span>
      <span className="rating-matches">
        {row.matches} {t('rating.matches')}
      </span>
      <span className="rating-coins">
        <Coin size={12} /> {row.coins}
      </span>
    </button>
  );
}

export default function FriendsScreen({
  /**
   * A code the game was opened on. Added the moment the screen appears, which
   * is why the screen is what an invitation opens: the player sees the name
   * land in the list rather than a message about a thing that happened
   * somewhere they cannot see.
   */
  joining,
  onDuel,
  onBack,
}: {
  joining: string | null;
  /** calling one of them out: the duel is the App's to open, as PLAY is */
  onDuel: (friend: Friend) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [list, setList] = useState<FriendList | null>(null);
  const [error, setError] = useState<FriendError | null>(null);
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [visiting, setVisiting] = useState<Friend | null>(null);
  const [typed, setTyped] = useState('');
  const [adding, setAdding] = useState(false);

  const settle = useCallback((next: FriendList | null) => {
    setList(next);
    setState(next ? 'ready' : 'offline');
  }, []);

  useEffect(() => {
    if (!friendsAvailable()) {
      setState('offline');
      return;
    }
    let alive = true;
    const run = async () => {
      // One request, not two: adding answers with the list as it stands
      // afterwards, exactly like every other write this game makes.
      if (joining) {
        const res = await addFriend(joining);
        if (!alive) return;
        setError(res.error);
        setAdded(!res.error && Boolean(res.list));
        if (res.list) {
          settle(res.list);
          return;
        }
      }
      const fresh = await fetchFriends();
      if (alive) settle(fresh);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [joining, settle]);

  /**
   * Anchor the menu to the row that was tapped, in viewport coordinates. Fixed
   * rather than absolute inside the row: the list scrolls, and a menu that is
   * a child of a scrolling box gets cut off at its edge.
   */
  const openPopup = (friend: Friend, at: DOMRect) => {
    const above = at.bottom + POPUP_H > window.innerHeight;
    setPopup({ friend, x: at.left + at.width / 2, y: above ? at.top - 6 : at.bottom + 6, above });
  };

  /** Whichever of the server's two links is the right one to send from here. */
  const invite = list ? linkToShare(list.link, list.webLink) : null;

  /**
   * Add whoever the typed code belongs to.
   *
   * The same request the link takes — adding answers with the list as it stands
   * afterwards, so there is nothing to fetch again — and the same two pieces of
   * state the link path sets, so a code and a link produce the same screen.
   *
   * The box is cleared only on success. A code that was refused is one the
   * player is about to correct a character of, and taking it away from them
   * means asking for the whole thing again.
   */
  const submitCode = async () => {
    const code = cleanCode(typed);
    if (!code || adding) return;
    setAdding(true);
    setError(null);
    setAdded(false);
    const res = await addFriend(code);
    setAdding(false);
    setError(res.error);
    setAdded(!res.error && Boolean(res.list));
    if (res.list) settle(res.list);
    if (!res.error) setTyped('');
  };

  const copy = async () => {
    if (!invite) return;
    setCopied(await copyText(invite));
    window.setTimeout(() => setCopied(false), 1600);
  };

  // A visit is the whole screen rather than a layer over the list: it is
  // somebody's room, and a room with a list of names across it is neither.
  // The list is still mounted underneath, so coming back costs no request.
  if (visiting) return <VisitScreen friend={visiting} onBack={() => setVisiting(null)} />;

  if (state === 'loading') {
    return (
      <div className="archive">
        <Head onBack={onBack} />
        <div className="arch-soon">
          <p>{t('friends.loading')}</p>
        </div>
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div className="archive">
        <Head onBack={onBack} />
        <Notice line={friendsAvailable() ? t('friends.offline') : t('friends.noServer')} />
        <ChatCall />
      </div>
    );
  }

  const rows = list?.friends ?? [];

  return (
    <div className="archive">
      <Head onBack={onBack} />

      {/* What just happened, when the screen was opened on an invitation. The
          good news names nobody: the server does not say whose code it was,
          and the name is in the list underneath anyway. */}
      {added && (
        <div className="friend-note good">
          <Check size={18} />
          <span>{t('friends.added')}</span>
        </div>
      )}
      {error && (
        <div className="friend-note bad">{t(`friends.err.${error}` as Parameters<typeof t>[0])}</div>
      )}

      {rows.length ? (
        <div className="rating-rows friend-rows">
          {rows.map((r, i) => (
            <FriendLine key={r.id} row={r} rank={i + 1} onOpen={openPopup} />
          ))}
        </div>
      ) : (
        <div className="arch-soon">
          <People size={30} />
          <b>{t('friends.emptyTitle')}</b>
          <p>{t('friends.empty')}</p>
        </div>
      )}

      {/* Under the list, where the player is already looking once they have
          read it — and the only thing on this screen that does anything. */}
      <InviteCard standing={list?.invite ?? null} />

      <div className="friend-actions">
        <button className="big-btn" onClick={() => invite && shareInvite(invite, t('friends.inviteText'))} disabled={!invite}>
          {t('friends.add')}
        </button>
        <button className="menu-btn" onClick={copy} disabled={!invite}>
          {copied ? (
            <>
              <Check size={16} /> {t('duel.copied')}
            </>
          ) : (
            t('duel.copy')
          )}
        </button>
      </div>

      {!invite && <div className="friend-note bad">{t('friends.err.nolink')}</div>}

      {/*
        Typing a code, for everybody a link cannot reach.
        
        A friendship used to be made one way: follow a link. That works inside
        Telegram, where a link is a message, and it does not work in the Android
        app at all — a `?f=` address opens the browser, not the game, and there
        is no domain of ours for Android to bind the app to (see the manifest).
        Which left an Android player unable to become anybody's friend, and so
        unable to be called out to a duel by name.
        
        A code is the same invitation with nothing carrying it. It survives being
        read aloud, screenshotted, or typed into a phone that has never heard of
        this game. Both halves are here because they are one exchange: the code
        to give, and the box to put somebody else's in.
      */}
      {list && (
        <div className="friend-code">
          <div className="friend-code-mine">
            <span className="friend-code-label">{t('friends.yourCode')}</span>
            <b className="friend-code-value">{list.code.toUpperCase()}</b>
          </div>
          <label className="friend-code-label" htmlFor="friend-code-input">
            {t('friends.enterCode')}
          </label>
          <form
            className="friend-code-row"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <input
              id="friend-code-input"
              className="friend-code-input"
              value={typed}
              onChange={(e) => setTyped(keepCodeChars(e.target.value))}
              placeholder={t('friends.codeHint')}
              maxLength={FRIEND_CODE_LENGTH}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="done"
            />
            <button className="menu-btn" type="submit" disabled={!cleanCode(typed) || adding}>
              {t('friends.addCode')}
            </button>
          </form>
        </div>
      )}

      {/* Last, and quieter than the two buttons above it: somebody who has
          friends should be sending them a link, not reading an advert. */}
      <ChatCall />

      {/* The scrim is the dismissal: one tap anywhere that is not the menu
          lands on it and closes. It also stops the tap reaching whatever was
          underneath, so closing the menu never does something else as well. */}
      {popup && (
        <>
          <div className="friend-scrim" onClick={() => setPopup(null)} />
          <div
            className={`friend-pop${popup.above ? ' above' : ''}`}
            style={{ left: popup.x, top: popup.y }}
          >
            <button
              className="menu-btn"
              onClick={() => {
                setVisiting(popup.friend);
                setPopup(null);
              }}
            >
              {t('friends.visit')}
            </button>
            <button
              className="menu-btn duel"
              onClick={() => {
                setPopup(null);
                onDuel(popup.friend);
              }}
            >
              {t('menu.duel')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Head({ onBack }: { onBack: () => void }) {
  return (
    <header className="menu-top">
      <button className="menu-btn back" onClick={onBack}>
        {t('common.back')}
      </button>
      <span className="spacer" />
      <div className="arch-count">{t('friends.title')}</div>
    </header>
  );
}
