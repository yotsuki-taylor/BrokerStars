import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Coin, Dollar, Lock, Tower, money } from './components';
import {
  corpsAvailable,
  corpOwner,
  createCorp,
  fetchCorp,
  fetchCorpFeed,
  joinCorp,
  leaveCorp,
  listCorps,
  takeCorpDuel,
  type CorpAnswer,
} from './api';
import { AWARDS } from '../awards/catalogue';
import { copyText, shareInvite } from './friends';
import { LEAGUES, leagueName } from './leagues';
import { t } from './i18n';
import {
  FEED_POLL_MS,
  MAX_MEMBERS,
  MIN_RANKED,
  NAME_MAX,
  NAME_MIN,
  TAG_MAX,
  TAG_MIN,
  cleanName,
  cleanTag,
  nextSeasonAt,
  type Corp,
  type CorpError,
  type CorpMember,
  type CorpSummary,
  type FeedItem,
  type Policy,
} from '../corp/protocol';

/**
 * The corporation screen, which is two screens wearing one name.
 *
 * WITHOUT ONE it is a list: everybody's corporation, a box to search them by
 * name or tag, and a form to found your own. WITH ONE it is the corporation
 * itself — who is in it, what they have earned this season, and the feed.
 *
 * THE FEED IS THE PART TO UNDERSTAND. It is a chat with the typing taken out:
 * every line is the game reporting something that happened, and there is no box
 * anybody can put words in. The argument is in `src/corp/protocol.ts` and the
 * short version is that a text box open to strangers is a moderation duty that
 * cannot be switched off, while Telegram is one tap away and already good at
 * chat. What is left has a property a chat does not: no noise. Every line is
 * something real, so the screen is worth opening.
 *
 * It is polled rather than pushed — ten seconds, and stopped dead while the
 * screen is hidden. A duel holds a socket because it ticks twice a second; a
 * feed changes a few times an hour, and a socket for that is a connection held
 * open all evening on a phone to carry nothing.
 */

/* --------------------------------------------------------------- helpers */

/** How long is left, in the two units anybody reads a countdown in. */
function inWords(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return t('daily.inMinutes', { m: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 48) return t('daily.inHours', { h: hours, m: mins % 60 });
  return t('corp.inDays', { d: Math.floor(hours / 24), h: hours % 24 });
}

/**
 * What the screen says about an answer, and whether it is bad news.
 *
 * Two of the thirteen are not refusals at all: a closed corporation answers
 * `closed` because the request went in, and `pending` because it was already
 * in. Drawing those in the red the others use would tell somebody their
 * application had failed at the moment it succeeded.
 */
interface Note {
  text: string;
  good: boolean;
}

const GOOD: CorpError[] = ['closed', 'pending'];

/** A refusal, as a sentence. `wait` fills the countdown the two timed ones have. */
function refusal(error: CorpError, wait: number): Note {
  return {
    text: t(`corp.err.${error}` as Parameters<typeof t>[0], { time: inWords(wait) }),
    good: GOOD.includes(error),
  };
}

/**
 * What a feed line says.
 *
 * The league and the award are looked up rather than stored as words: the
 * server writes an id, and the id is read in whatever language the reader has
 * on. A feed written in the writer's language would be a feed half of a
 * corporation cannot read.
 */
function feedLine(item: FeedItem, mine: boolean): string {
  const who = mine ? t('corp.you') : item.who;
  switch (item.kind) {
    case 'league': {
      const league = LEAGUES[Number(item.detail)];
      return t('corp.feed.league', { who, what: league ? leagueName(league) : item.detail });
    }
    case 'award': {
      // Only an id this build knows becomes a name; anything else is drawn as
      // it arrived rather than as a raw dictionary key. A hidden award is named
      // here once somebody has earned it — the NAME is the celebration and the
      // CONDITION is what stays secret, so nobody's hunt is spoiled by being
      // told what somebody else found.
      const known = AWARDS.some((a) => a.id === item.detail);
      return t('corp.feed.award', {
        who,
        what: known ? t(`award.${item.detail}.name` as Parameters<typeof t>[0]) : item.detail,
      });
    }
    case 'joined':
      return t('corp.feed.joined', { who });
    case 'left':
      return t('corp.feed.left', { who });
    case 'duel':
      return mine ? t('corp.feed.duelYours') : t('corp.feed.duel', { who });
  }
}

/** Nothing to show, and which nothing it is. Never a spinner that never stops. */
function Notice({ line }: { line: string }) {
  return (
    <div className="arch-soon">
      <Lock size={30} />
      <b>{t('corp.title')}</b>
      <p>{line}</p>
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
      <div className="arch-count">{t('corp.title')}</div>
    </header>
  );
}

/** What a player may type into a name box: the alphabet, as it is typed. */
const keepLetters = (raw: string, max: number): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);

/* ------------------------------------------------------ having none yet */

function CorpLine({
  row,
  onJoin,
}: {
  row: CorpSummary;
  onJoin: (row: CorpSummary) => void;
}) {
  const full = row.members >= MAX_MEMBERS;
  return (
    <button className="corp-line" disabled={full} onClick={() => onJoin(row)}>
      <span className="corp-tag">{row.tag}</span>
      <span className="corp-line-text">
        <b>{row.name}</b>
        {row.motto && <i>{row.motto}</i>}
      </span>
      <span className="corp-line-at">
        <span className="corp-rank">
          {row.rank ? t('corp.place', { n: row.rank }) : t('corp.unranked')}
        </span>
        <span className={`corp-count${full ? ' full' : ''}`}>
          {/* The door before the count, on the same line rather than on a
              third one: tapping a closed corporation knocks instead of
              joining, and that is worth knowing before the tap and not
              after it. */}
          {row.policy === 'closed' && <em>{t('corp.closedMark')} · </em>}
          {full
            ? t('corp.fullMark')
            : t('corp.membersOf', { n: row.members, max: MAX_MEMBERS })}
        </span>
      </span>
    </button>
  );
}

/**
 * Founding one.
 *
 * The alphabet rule is on the form rather than behind the button: the box
 * simply will not take a character a name cannot have (`keepLetters`), so
 * nothing has to be explained after the fact. The sentence under it says what
 * the box is doing, because a keyboard that swallows what somebody typed is
 * worse than one that says why.
 */
function NewCorp({
  onDone,
  onCancel,
}: {
  onDone: (a: CorpAnswer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [motto, setMotto] = useState('');
  const [policy, setPolicy] = useState<Policy>('open');
  const [busy, setBusy] = useState(false);

  const ready = Boolean(cleanName(name) && cleanTag(tag)) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const answer = await createCorp(name, tag, motto, policy);
    setBusy(false);
    onDone(answer);
  };

  return (
    <form
      className="corp-new"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <b className="corp-new-title">{t('corp.newTitle')}</b>

      <label className="corp-field">
        <span>{t('corp.name')}</span>
        <input
          className="friend-code-input"
          value={name}
          onChange={(e) => setName(keepLetters(e.target.value, NAME_MAX))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <i>{t('corp.letters', { min: NAME_MIN, max: NAME_MAX })}</i>
      </label>

      <label className="corp-field">
        <span>{t('corp.tag')}</span>
        <input
          className="friend-code-input"
          value={tag}
          onChange={(e) => setTag(keepLetters(e.target.value, TAG_MAX).replace(/ /g, ''))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <i>{t('corp.tagLetters', { min: TAG_MIN, max: TAG_MAX })}</i>
      </label>

      <label className="corp-field">
        <span>
          {t('corp.motto')} · {t('corp.mottoHint')}
        </span>
        <input
          className="friend-code-input"
          value={motto}
          onChange={(e) => setMotto(keepLetters(e.target.value, 60))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      <div className="corp-field">
        <span>{t('corp.policy')}</span>
        <div className="corp-policy">
          {(['open', 'closed'] as Policy[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`slot-tab${p === policy ? ' on' : ''}`}
              onClick={() => setPolicy(p)}
            >
              {t(p === 'open' ? 'corp.policyOpen' : 'corp.policyClosed')}
            </button>
          ))}
        </div>
      </div>

      <div className="friend-actions">
        <button className="big-btn" type="submit" disabled={!ready}>
          {t('corp.found2')}
        </button>
        <button className="menu-btn" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

function NoCorp({
  onJoined,
  note,
  onTable,
}: {
  onJoined: (a: CorpAnswer) => void;
  note: Note | null;
  onTable: () => void;
}) {
  const [rows, setRows] = useState<CorpSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [founding, setFounding] = useState(false);

  /**
   * The list, refetched as the box is typed in.
   *
   * Debounced through the effect's own cleanup rather than through a timer of
   * its own: every keystroke starts a new one and cancels the last, so a name
   * typed at speed costs one request rather than eight.
   */
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(async () => {
      const found = await listCorps(query);
      if (alive) setRows(found ?? []);
    }, query ? 250 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (founding) {
    return (
      <>
        {/* Above the form, not below the list: a refusal here is nearly always
            "somebody has that name", and the next thing that happens is the
            player editing one word of what they typed. So the form keeps
            standing with their words in it and the sentence appears over it. */}
        {note && <div className="friend-note bad">{note.text}</div>}
        <NewCorp onDone={onJoined} onCancel={() => setFounding(false)} />
      </>
    );
  }

  return (
    <>
      <div className="corp-pitch">
        <Tower size={30} />
        <b>{t('corp.noneTitle')}</b>
        <p>{t('corp.none', { max: MAX_MEMBERS })}</p>
      </div>

      {note && <div className={`friend-note ${note.good ? 'good' : 'bad'}`}>{note.text}</div>}

      <div className="corp-search">
        <input
          className="friend-code-input"
          value={query}
          onChange={(e) => setQuery(keepLetters(e.target.value, NAME_MAX))}
          placeholder={t('corp.search')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {rows === null ? (
        <div className="arch-soon">
          <p>{t('corp.loading')}</p>
        </div>
      ) : rows.length ? (
        <div className="corp-rows">
          {rows.map((r) => (
            <CorpLine
              key={r.id}
              row={r}
              onJoin={async (row) => onJoined(await joinCorp({ id: row.id }))}
            />
          ))}
        </div>
      ) : (
        <div className="arch-soon">
          <p>{t('corp.found')}</p>
        </div>
      )}

      <div className="friend-actions">
        <button className="big-btn" onClick={() => setFounding(true)}>
          {t('corp.create')}
        </button>
        {/* Somebody choosing a corporation wants to see which of them is any
            good, and the list above is ordered by size rather than by place. */}
        <button className="menu-btn" onClick={onTable}>
          {t('corp.table')}
        </button>
      </div>

      {/* A code, for everybody a list cannot reach: a closed corporation is not
          joined by tapping it, and the code is the owner's permission handed
          over in advance. The same exchange the friends screen has, and it is
          here for the same reason — a link cannot be tapped inside the Android
          app. */}
      <form
        className="friend-code-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (code) onJoined(await joinCorp({ code }));
        }}
      >
        <input
          className="friend-code-input"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toLowerCase().replace(/[^0-9bcdfghjklmnpqrstvwxyz]/g, ''))
          }
          placeholder={t('corp.enterCode')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="menu-btn" type="submit" disabled={!code}>
          {t('corp.join')}
        </button>
      </form>
    </>
  );
}

/* ------------------------------------------------------------ having one */

function MemberLine({
  row,
  managing,
  onKick,
  onTransfer,
}: {
  row: CorpMember;
  managing: boolean;
  onKick: (id: string) => void;
  onTransfer: (id: string) => void;
}) {
  return (
    <div className={`corp-member${row.you ? ' you' : ''}`}>
      <span className="rating-who">
        {row.name}
        {row.owner && <em className="corp-owner-mark">{t('corp.owner')}</em>}
      </span>
      <span className="corp-member-earned">
        <Coin size={12} /> {row.coins}
        <Dollar size={12} /> {money(row.dollars)}
      </span>
      {managing && !row.you && (
        <span className="corp-member-acts">
          <button className="menu-btn" onClick={() => onTransfer(row.id)}>
            {t('corp.transfer')}
          </button>
          <button className="menu-btn" onClick={() => onKick(row.id)}>
            {t('corp.kick')}
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * One line of the feed, and the only one of them that does anything: a duel.
 *
 * The card carries its own countdown because the thing behind it is a seat
 * somebody is standing beside — fifteen minutes, the same quarter of an hour a
 * duel invitation has always had. Taken, it goes dark and says who took it,
 * which is the whole reason the server keeps a `taken_by` at all: thirty cards
 * going dark together is better than twenty-nine people tapping into a lobby
 * that is already full.
 */
function FeedLine({
  item,
  mine,
  now,
  onTake,
}: {
  item: FeedItem;
  mine: boolean;
  now: number;
  onTake: (item: FeedItem) => void;
}) {
  const live = item.kind === 'duel' && !item.takenBy;
  return (
    <div className={`corp-feed-line ${item.kind}${live ? ' live' : ''}`}>
      <span className="corp-feed-text">
        <b>{feedLine(item, mine)}</b>
        {item.kind === 'duel' && (
          <i>
            {item.takenBy
              ? t('corp.feed.taken', { who: item.takenBy })
              : t('corp.feed.left2', { time: inWords((item.expiresAt ?? now) - now) })}
          </i>
        )}
      </span>
      {live && (
        <button className="menu-btn duel" onClick={() => onTake(item)}>
          {t('corp.feed.join')}
        </button>
      )}
    </div>
  );
}

/** The owner's panel: everything that is done rarely and cannot be undone. */
function Manage({
  corp,
  onAnswer,
  onDone,
}: {
  corp: Corp;
  onAnswer: (a: CorpAnswer) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(corp.name);
  const [motto, setMotto] = useState(corp.motto);
  const [policy, setPolicy] = useState<Policy>(corp.policy);
  const [sure, setSure] = useState(false);
  const waiting = Math.max(0, corp.renameAt - Date.now());

  return (
    <div className="corp-manage">
      <label className="corp-field">
        <span>{t('corp.name')}</span>
        <input
          className="friend-code-input"
          value={name}
          onChange={(e) => setName(keepLetters(e.target.value, NAME_MAX))}
          autoComplete="off"
          spellCheck={false}
        />
        {waiting > 0 && <i>{t('corp.renameWait', { time: inWords(waiting) })}</i>}
      </label>

      <label className="corp-field">
        <span>{t('corp.motto')}</span>
        <input
          className="friend-code-input"
          value={motto}
          onChange={(e) => setMotto(keepLetters(e.target.value, 60))}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="corp-field">
        <span>{t('corp.policy')}</span>
        <div className="corp-policy">
          {(['open', 'closed'] as Policy[]).map((p) => (
            <button
              key={p}
              className={`slot-tab${p === policy ? ' on' : ''}`}
              onClick={() => setPolicy(p)}
            >
              {t(p === 'open' ? 'corp.policyOpen' : 'corp.policyClosed')}
            </button>
          ))}
        </div>
      </div>

      <div className="friend-actions">
        <button
          className="big-btn"
          onClick={async () => onAnswer(await corpOwner('edit', { name, motto, policy }))}
        >
          {t('corp.save')}
        </button>
        <button className="menu-btn" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>

      {/* Last, and behind a second tap: everybody else loses their season too,
          which is the one consequence on this screen that lands on other
          people. */}
      {sure ? (
        <div className="corp-danger">
          <b>{t('corp.disbandSure')}</b>
          <div className="confirm-pair">
            <button className="menu-btn" onClick={() => setSure(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="menu-btn danger"
              onClick={async () => onAnswer(await corpOwner('disband', { confirm: 'disband' }))}
            >
              {t('corp.disband')}
            </button>
          </div>
        </div>
      ) : (
        <button className="menu-btn danger" onClick={() => setSure(true)}>
          {t('corp.disband')}
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- the screen */

export default function CorpScreen({
  onCallOut,
  onJoinDuel,
  onTable,
  onBack,
}: {
  /** open a duel and leave the invitation in the feed — the App's to do */
  onCallOut: () => void;
  /** sit down at one somebody else left */
  onJoinDuel: (code: string) => void;
  /**
   * Off to the table. The id goes with it and is not a detail: the table is a
   * public read that highlights one row, and this screen is the only place
   * that knows which row is yours — null for somebody who is in none, which is
   * a table with nothing lit in it rather than a table they cannot see.
   */
  onTable: (mine: string | null) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [corp, setCorp] = useState<Corp | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [managing, setManaging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  /** redrawn on a timer so the countdowns on the cards actually count down */
  const [now, setNow] = useState(Date.now());

  const settle = useCallback((answer: CorpAnswer) => {
    setState(answer.reached ? 'ready' : 'offline');
    setCorp(answer.corp);
    setNote(answer.error ? refusal(answer.error, answer.wait) : null);
    if (answer.corp) setManaging(false);
  }, []);

  useEffect(() => {
    if (!corpsAvailable()) {
      setState('offline');
      return;
    }
    let alive = true;
    void fetchCorp().then((a) => alive && settle(a));
    return () => {
      alive = false;
    };
  }, [settle]);

  /**
   * The poll, and the two rules that make it cheap.
   *
   * It asks for the feed and nothing else — thirty members and two ranking
   * queries are not what changes between one ten-second tick and the next. And
   * it stops dead when the screen is hidden: a game left open in a background
   * tab, or a phone in a pocket, costs nothing at all. `visibilitychange` is
   * the whole of that, and it also kicks a fetch on the way back, so returning
   * to the screen is current rather than up to ten seconds stale.
   */
  const corpId = corp?.id ?? null;
  const feedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!corpId) return;

    const tick = async () => {
      const fresh = await fetchCorpFeed();
      // Null is the network having nothing to say, which is not the same as an
      // empty feed and must not blank the screen.
      if (fresh) setCorp((c) => (c ? { ...c, feed: fresh } : c));
      setNow(Date.now());
    };

    const start = () => {
      if (feedRef.current === null) feedRef.current = window.setInterval(tick, FEED_POLL_MS);
    };
    const stop = () => {
      if (feedRef.current !== null) window.clearInterval(feedRef.current);
      feedRef.current = null;
    };
    const onVisible = () => {
      if (document.hidden) stop();
      else {
        void tick();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [corpId]);

  const take = async (item: FeedItem) => {
    const out = await takeCorpDuel(item.id);
    if (typeof out === 'string') {
      setNote(refusal(out, 0));
      // Whoever took it, the card is stale now; ask for the truth rather than
      // leaving a live-looking button on the screen.
      const fresh = await fetchCorpFeed();
      if (fresh) setCorp((c) => (c ? { ...c, feed: fresh } : c));
      return;
    }
    onJoinDuel(out.code);
  };

  if (state === 'loading') {
    return (
      <div className="archive">
        <Head onBack={onBack} />
        <div className="arch-soon">
          <p>{t('corp.loading')}</p>
        </div>
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div className="archive">
        <Head onBack={onBack} />
        <Notice line={corpsAvailable() ? t('corp.offline') : t('corp.noServer')} />
      </div>
    );
  }

  if (!corp) {
    return (
      <div className="archive">
        <Head onBack={onBack} />
        <NoCorp note={note} onJoined={settle} onTable={() => onTable(null)} />
      </div>
    );
  }

  const you = corp.members.find((m) => m.you);
  const owner = corp.ownerId === (you?.id ?? '');
  const seasonLeft = nextSeasonAt(now) - now;

  return (
    <div className="archive corp">
      <Head onBack={onBack} />

      {/* The header: who this is, where they stand, and how long the season
          has left. The two places are side by side because the two tables
          reward opposite habits — one is what the corporation earned playing,
          the other what it earned turning up. */}
      <div className="corp-head">
        <div className="corp-head-name">
          <span className="corp-tag big">{corp.tag}</span>
          <b>{corp.name}</b>
        </div>
        {corp.motto && <i className="corp-motto">{corp.motto}</i>}
        <div className="corp-ranks">
          <button className="corp-rank-chip" onClick={() => onTable(corp.id)}>
            {t('corp.coinRank', {
              place: corp.coinRank ? t('corp.place', { n: corp.coinRank }) : t('corp.unranked'),
            })}
          </button>
          <button className="corp-rank-chip" onClick={() => onTable(corp.id)}>
            {t('corp.dollarRank', {
              place: corp.dollarRank
                ? t('corp.place', { n: corp.dollarRank })
                : t('corp.unranked'),
            })}
          </button>
        </div>
        <span className="corp-season">{t('corp.seasonEnds', { time: inWords(seasonLeft) })}</span>
      </div>

      {note && <div className={`friend-note ${note.good ? 'good' : 'bad'}`}>{note.text}</div>}

      {/* One row rather than two stacked: the screen below this is long, and
          the table is a place to go rather than a thing to do — so it takes the
          width of its own word and the duel button keeps the rest. */}
      <div className="friend-actions corp-acts">
        <button className="big-btn" onClick={onCallOut}>
          {t('corp.callOut')}
        </button>
        <button className="menu-btn" onClick={() => onTable(corp.id)}>
          {t('corp.table')}
        </button>
      </div>

      {/* Waiting at the door, and only the owner is ever sent them. */}
      {corp.requests.length > 0 && (
        <div className="corp-requests">
          <b>{t('corp.requests')}</b>
          {corp.requests.map((r) => (
            <div key={r.id} className="corp-request">
              <span className="rating-who">{r.name}</span>
              <button
                className="menu-btn"
                onClick={async () => settle(await corpOwner('accept', { player: r.id }))}
              >
                {t('corp.accept')}
              </button>
              <button
                className="menu-btn"
                onClick={async () => settle(await corpOwner('refuse', { player: r.id }))}
              >
                {t('corp.refuse')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="corp-section">
        <b className="corp-section-title">{t('corp.feedTitle')}</b>
        {corp.feed.length ? (
          <div className="corp-feed">
            {corp.feed.map((item) => (
              <FeedLine
                key={item.id}
                item={item}
                mine={item.whoId === you?.id}
                now={now}
                onTake={take}
              />
            ))}
          </div>
        ) : (
          <p className="corp-empty">{t('corp.feedEmpty')}</p>
        )}
      </div>

      <div className="corp-section">
        <b className="corp-section-title">
          {t('corp.membersTitle')} · {t('corp.membersOf', { n: corp.members.length, max: MAX_MEMBERS })}
          <em>{t('corp.thisSeason')}</em>
        </b>
        <div className="corp-members">
          {/* Best first, because the table ranks the average and a member list
              in joining order hides the thing the average is made of. */}
          {[...corp.members]
            .sort((a, b) => b.coins - a.coins || a.joinedAt - b.joinedAt)
            .map((m) => (
              <MemberLine
                key={m.id}
                row={m}
                managing={managing}
                onKick={async (id) => settle(await corpOwner('kick', { player: id }))}
                onTransfer={async (id) => settle(await corpOwner('transfer', { player: id }))}
              />
            ))}
        </div>
      </div>

      {/* The invitation code. A standing one like a friend code rather than a
          minted one like a duel's: it goes in a group chat and is tapped by
          four people, which is exactly what a corporation wants and exactly
          what a duel must not have. */}
      <div className="friend-code">
        <div className="friend-code-mine">
          <span className="friend-code-label">{t('corp.yourCode')}</span>
          <b className="friend-code-value">{corp.code.toUpperCase()}</b>
        </div>
        <div className="friend-actions">
          <button
            className="menu-btn"
            onClick={() => shareInvite('', `${t('corp.inviteText')} — ${corp.code.toUpperCase()}`)}
          >
            {t('corp.invite')}
          </button>
          <button
            className="menu-btn"
            onClick={async () => {
              setCopied(await copyText(corp.code.toUpperCase()));
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? (
              <>
                <Check size={16} /> {t('duel.copied')}
              </>
            ) : (
              t('corp.copyCode')
            )}
          </button>
        </div>
      </div>

      {owner &&
        (managing ? (
          <Manage corp={corp} onAnswer={settle} onDone={() => setManaging(false)} />
        ) : (
          <button className="menu-btn" onClick={() => setManaging(true)}>
            {t('corp.manage')}
          </button>
        ))}

      {/* Leaving is last and takes two taps. The season stays behind, and
          somebody who finds that out afterwards has lost a month. */}
      {leaving ? (
        <div className="corp-danger">
          <b>{t('corp.leaveSure')}</b>
          <div className="confirm-pair">
            <button className="menu-btn" onClick={() => setLeaving(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="menu-btn danger"
              onClick={async () => {
                setLeaving(false);
                settle(await leaveCorp());
              }}
            >
              {t('corp.leave')}
            </button>
          </div>
        </div>
      ) : (
        <button className="menu-btn corp-leave" onClick={() => setLeaving(true)}>
          {t('corp.leave')}
        </button>
      )}

      {/* The floor under the table, said once where somebody is looking at
          their own place in it. */}
      <p className="corp-foot">{t('corp.topWhy', { min: MIN_RANKED })}</p>
    </div>
  );
}
