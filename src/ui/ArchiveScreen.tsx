import React, { useEffect, useState } from 'react';
import { COMPANIES, TRAIT_LABEL, companyById, type Company } from '../sim/companies';
import { AWARDS, GROUPS, type Award, type AwardGroup } from '../awards/catalogue';
import type { Daily } from '../daily/protocol';
import {
  ORDERS_A_DAY,
  affordable,
  askOf,
  bidOf,
  costOf,
  ordersLeft,
  overnight,
  prevPriceIn,
  priceIn,
  sharesOf,
  tradedOn,
  valueOf,
  type Holding,
  type Market,
  type Portfolio,
} from '../market/protocol';
import type { Profile } from '../profile/protocol';
import { Dollar, LogoMask, Lock, money, signed } from './components';
import { LEAGUES, leagueName } from './leagues';
import { t, tr, type Key } from './i18n';

/**
 * The archive: what the player has collected, under three tabs.
 *
 * COMPANIES is everything the game can put on a board, unlocked by playing a
 * match out against it — nothing bought, and nothing spoiled in advance. It is
 * also the shop window for the share counter: under the company you are looking
 * at is what a piece of it costs today and the two buttons that trade it. A
 * company you have not met is locked here, so it cannot be bought either —
 * which is the whole of what ties the counter to the game rather than leaving
 * it beside it.
 *
 * PORTFOLIO is the other half of the same thing: what is held, what it cost and
 * what it did overnight. See `src/market/protocol.ts` for where a price comes
 * from and why none of them is stored anywhere.
 *
 * AWARDS is the shelf. Half of it is published — those are goals, and a goal
 * you cannot see is not one — and half is not: a hidden award is a thing that
 * happened to you, and printing the condition would turn each into a chore to
 * farm. The hidden ones are drawn as a row of question marks with a count, so
 * it is clear there is something there without saying what.
 *
 * Who has earned what is the server's answer (`worker/src/awards.ts`), and it
 * arrives on the profile. Without one — a build with no server, or the game
 * opened outside Telegram — the shelf is drawn unearned and says why.
 *
 * The leaderboard used to be a third tab. It is its own screen off the main
 * menu now — see RatingScreen.tsx — because the one part of the game other
 * people are in should not sit two taps behind a shelf of companies.
 */

type Tab = 'companies' | 'portfolio' | 'achievements';

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'companies', label: () => t('archive.tabCompanies') },
  { id: 'portfolio', label: () => t('archive.tabPortfolio') },
  { id: 'achievements', label: () => t('archive.tabAchievements') },
];

/**
 * Everything the share counter needs, handed down rather than fetched: the
 * prices as the server last sent them, the book, the balance, and the day the
 * order count lives on.
 */
export interface CounterProps {
  market: Market;
  portfolio: Portfolio;
  dollars: number;
  daily: Daily;
  onTrade: (id: string, shares: number, sell: boolean) => void;
}

/** The change from one price to the next, as a percentage. Zero when unknown. */
function movePct(now: number | null, before: number | null): number {
  if (now === null || before === null || before <= 0) return 0;
  return ((now - before) / before) * 100;
}

/**
 * A fortnight of one company's price, drawn small.
 *
 * Its own SVG rather than anything out of `chart.ts`: that one draws a match on
 * a canvas with axes, quarter rules and a legend, and none of it survives being
 * shrunk to the size of a word. Fourteen points and a line is the whole of what
 * a row here has room to say.
 */
function Spark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const w = 100;
  const h = 28;
  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * w;
      // 2px of padding at each end, so a flat line is not drawn on the border
      const y = h - 2 - ((p - lo) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The counter under one company: what it costs today, what it did overnight,
 * what is held, and the two buttons.
 *
 * The size is this end's own state and nothing else is. Whether the order goes
 * through, at what price, and how many are left today are all settled on the
 * other side (`worker/src/profile.ts`) — everything here is drawing.
 */
function TradeRow({
  company,
  market,
  portfolio,
  dollars,
  daily,
  onTrade,
}: { company: Company } & CounterProps) {
  const [size, setSize] = useState(1);
  // a company changed under the stepper leaves the old size standing, which is
  // how somebody ends up buying five of something they meant to buy one of
  useEffect(() => setSize(1), [company.id]);

  const price = priceIn(market, company.id);
  const held = sharesOf(portfolio, company.id);
  const left = ordersLeft(daily);

  if (price === null) return <p className="arch-empty">{t('market.noPrices')}</p>;

  const move = movePct(price, prevPriceIn(market, company.id));
  const ask = askOf(price);
  const bid = bidOf(price);
  const most = Math.max(affordable(dollars, price), held, 1);
  const canBuy = left > 0 && ask * size <= dollars;
  const canSell = left > 0 && held >= size;
  const avg = held > 0 ? Math.round((portfolio[company.id]?.cost ?? 0) / held) : 0;

  return (
    <div className="trade">
      <div className="trade-top">
        <span className="trade-price">
          <Dollar size={14} />
          <b>{money(price)}</b>
          <em className={move > 0 ? 'up' : move < 0 ? 'down' : 'flat'}>{signed(move, 1)}%</em>
        </span>
        <Spark series={market.prices[company.id] ?? []} color={company.color} />
      </div>

      {held > 0 && (
        <div className="trade-held">
          {t('market.youHold', { n: money(held), avg: money(avg) })}
        </div>
      )}

      <div className="trade-size">
        <button
          className="step"
          onClick={() => setSize((n) => Math.max(1, n - 1))}
          disabled={size <= 1}
          aria-label="one fewer"
        >
          −
        </button>
        <b>{money(size)}</b>
        <button
          className="step"
          onClick={() => setSize((n) => Math.min(most, n + 1))}
          disabled={size >= most}
          aria-label="one more"
        >
          +
        </button>
        <button className="step wide" onClick={() => setSize(most)} disabled={most <= 1}>
          {t('market.max')}
        </button>
      </div>

      <div className="trade-actions">
        <button className="menu-btn buy" disabled={!canBuy} onClick={() => onTrade(company.id, size, false)}>
          {t('market.buyFor', { price: money(ask * size) })}
        </button>
        <button className="menu-btn sell" disabled={!canSell} onClick={() => onTrade(company.id, size, true)}>
          {t('market.sellFor', { price: money(bid * size) })}
        </button>
      </div>

      <div className="trade-note">
        {left > 0
          ? t('market.ordersLeft', { n: left, of: ORDERS_A_DAY })
          : t('market.ordersDone')}
      </div>
    </div>
  );
}

function whereFound(c: Company): string {
  if (c.staple) return t('archive.everyLeague');
  const league = LEAGUES[c.fromLeague];
  return league ? t('archive.andUp', { name: leagueName(league) }) : t('archive.unknown');
}

function CompaniesTab({ seen, counter }: { seen: Set<string>; counter: CounterProps }) {
  const first = COMPANIES.find((c) => seen.has(c.id));
  const [pickedId, setPickedId] = useState<string | null>(first?.id ?? null);
  const picked = COMPANIES.find((c) => c.id === pickedId && seen.has(c.id)) ?? null;

  return (
    <>
      <div className="arch-detail">
        {picked ? (
          <>
            <LogoMask file={picked.logo} color={picked.color} className="arch-big" />
            <div className="arch-text">
              <div className="arch-name" style={{ color: picked.color }}>
                {picked.name}
              </div>
              <div className="arch-chips">
                <span className="arch-chip" style={{ borderColor: picked.color }}>
                  {tr(`trait.${picked.trait.kind}.label`, TRAIT_LABEL[picked.trait.kind])}
                </span>
                <span className="arch-chip">
                  {t('archive.listsAt', { price: money(picked.basePrice) })}
                </span>
              </div>
              <p className="arch-blurb">{tr(`company.${picked.id}.tagline`, picked.tagline)}</p>
              <div className="arch-where">{whereFound(picked)}</div>
            </div>
          </>
        ) : (
          <p className="arch-empty">{t('archive.empty')}</p>
        )}
      </div>

      {/* The counter sits under the company it is about rather than on a screen
          of its own: what a share is worth is another fact about the company,
          and the quirk two lines above it is the best advice anybody is going
          to get about which way it will move. */}
      {picked && <TradeRow company={picked} {...counter} />}

      <div className="arch-grid">
        {COMPANIES.map((c) => {
          const found = seen.has(c.id);
          return (
            <button
              key={c.id}
              className={`arch-card${found ? '' : ' locked'}${
                c.id === pickedId && found ? ' picked' : ''
              }`}
              style={found ? { borderColor: c.color } : undefined}
              disabled={!found}
              onClick={() => setPickedId(c.id)}
            >
              {found ? (
                <>
                  <LogoMask file={c.logo} color={c.color} className="arch-thumb" />
                  <span className="arch-tag">{c.name}</span>
                </>
              ) : (
                <>
                  <i className="arch-thumb hidden">
                    <Lock size={22} />
                  </i>
                  <span className="arch-tag">???</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The book: every position, what it cost, what it is worth now, and the one
 * number the whole counter exists to produce — what it did overnight.
 *
 * "Overnight" is today's price of what is held now against YESTERDAY's price of
 * the same shares (`overnight`). Anything bought this morning therefore enters
 * at nothing and starts counting tomorrow, which is the honest answer to "how
 * did my portfolio do since yesterday" — and it is exactly the loop the counter
 * was built for: buy today, come back tomorrow and look.
 */
function PortfolioTab({ market, portfolio, dollars, daily }: CounterProps) {
  const rows = Object.entries(portfolio)
    .map(([id, held]) => ({ id, held, company: companyById(id) }))
    .filter((r): r is { id: string; held: Holding; company: Company } => Boolean(r.company));

  const value = valueOf(portfolio, (id) => priceIn(market, id));
  const cost = costOf(portfolio);
  const since = overnight(portfolio, market);
  const left = ordersLeft(daily);

  return (
    <div className="folio">
      <div className="folio-top">
        <span className="folio-total">
          <i>{t('market.bookValue')}</i>
          <b>
            <Dollar size={17} /> {money(value)}
          </b>
        </span>
        <span className={`folio-move ${since > 0 ? 'up' : since < 0 ? 'down' : 'flat'}`}>
          <b>{signed(since)}</b>
          <i>{t('market.sinceYesterday')}</i>
        </span>
      </div>

      <div className="folio-cash">
        <span>
          {t('market.cash')} <b>{money(dollars)}</b>
        </span>
        <span>
          {left > 0
            ? t('market.ordersLeft', { n: left, of: ORDERS_A_DAY })
            : t('market.ordersDone')}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="arch-empty">{t('market.bookEmpty')}</p>
      ) : (
        <div className="folio-list">
          {rows.map(({ id, held, company }) => {
            const price = priceIn(market, id);
            const worth = price === null ? 0 : price * held.shares;
            const pnl = worth - held.cost;
            const pct = held.cost > 0 ? (pnl / held.cost) * 100 : 0;
            return (
              <div className="folio-row" key={id} style={{ borderColor: company.color }}>
                <LogoMask file={company.logo} color={company.color} className="folio-logo" />
                <span className="folio-text">
                  <b style={{ color: company.color }}>{company.name}</b>
                  <i>
                    {t('market.sharesAt', {
                      n: money(held.shares),
                      avg: money(Math.round(held.cost / held.shares)),
                    })}
                    {/* Why this row added nothing to the number at the top:
                        it was bought at today's price, so the overnight move
                        happened without it. */}
                    {tradedOn(portfolio, id, market.day) && (
                      <em className="folio-new">{t('market.boughtToday')}</em>
                    )}
                  </i>
                </span>
                <span className="folio-worth">
                  <b>{money(worth)}</b>
                  <em className={pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'flat'}>
                    {signed(pnl)} ({signed(pct, 1)}%)
                  </em>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="empty-note">{t('market.pricesRoll')}</p>
    </div>
  );
}

/**
 * What an award is called and what it asks for. The four ladder ones take
 * their name from the league itself rather than carrying a copy of it: one
 * name, one place to rename it, and no way for the two to drift apart.
 */
/**
 * The key for one award's own strings. Built rather than listed, and cast
 * because of it: TypeScript cannot see that every id in the catalogue has a
 * pair of entries in the table. What keeps that true is `i18n.test.ts`, which
 * fails on a key that is in one language and not the other, and the fact that
 * a missing one shows up as the raw key on screen the first time anybody looks.
 */
const awardKey = (a: Award, part: 'name' | 'text') => `award.${a.id}.${part}` as Key;

function awardName(a: Award): string {
  const league = a.league === undefined ? null : LEAGUES[a.league];
  return league ? leagueName(league) : t(awardKey(a, 'name'));
}

function awardLine(a: Award): string {
  // The four ladder rows are titled with the league's own name, so the line
  // under it has no business repeating it.
  if (a.league !== undefined) return t('award.leaguePlayed');
  // money is written the way the game writes money everywhere else, so 20000
  // reads as 20 000 rather than as a phone number
  const n = a.group === 'money' ? money(a.goal ?? 0) : (a.goal ?? 0);
  return t(awardKey(a, 'text'), { n });
}

/** How far along, for the awards that count towards something. */
function progressOf(a: Award, p: Profile | null): { at: number; of: number } | null {
  if (!p || !a.goal) return null;
  if (a.group === 'money') return { at: p.bestNetWorth, of: a.goal };
  if (a.group === 'duel') return { at: p.duelWins, of: a.goal };
  if (a.id === 'dressed') return { at: Object.keys(p.owned).length, of: a.goal };
  return null;
}

function AwardsTab({ profile }: { profile: Profile | null }) {
  const earned = profile?.awards ?? {};
  const has = (a: Award) => earned[a.id] !== undefined;
  const secret = AWARDS.filter((a) => a.hidden);
  const unfound = secret.filter((a) => !has(a)).length;

  return (
    <div className="awards">
      {GROUPS.map((group: AwardGroup) => {
        // The secret group is drawn as one block at the end rather than as a
        // list of identical locks scattered through the others.
        if (group === 'secret') return null;
        const list = AWARDS.filter((a) => a.group === group);
        return (
          <section key={group} className="award-group">
            <h3>{t(`award.group.${group}`)}</h3>
            {list.map((a) => {
              const got = has(a);
              const bar = got ? null : progressOf(a, profile);
              return (
                <div key={a.id} className={`award${got ? ' got' : ''}`}>
                  {/* A star here is not the currency and never was — the coins
                      are a struck coin now, and nothing on this shelf is
                      spendable. It is the mark on a thing you did. */}
                  <span className="award-mark">{got ? '★' : <Lock size={13} />}</span>
                  <span className="award-text">
                    <b>{awardName(a)}</b>
                    <i>{awardLine(a)}</i>
                  </span>
                  {bar && bar.at > 0 && (
                    <span className="award-bar">
                      {Math.min(bar.at, bar.of)}/{bar.of}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="award-group">
        <h3>{t('award.group.secret')}</h3>
        {secret.map((a) =>
          has(a) ? (
            <div key={a.id} className="award got">
              <span className="award-mark">★</span>
              <span className="award-text">
                <b>{awardName(a)}</b>
                <i>{awardLine(a)}</i>
              </span>
            </div>
          ) : null,
        )}
        {unfound > 0 && (
          <div className="award secret">
            <span className="award-mark">?</span>
            <span className="award-text">
              <b>{t('award.secretLeft', { n: unfound })}</b>
              <i>{t('award.secretHint')}</i>
            </span>
          </div>
        )}
      </section>

      {!profile && <p className="empty-note">{t('award.noServer')}</p>}
    </div>
  );
}

export default function ArchiveScreen({
  seen,
  profile,
  counter,
  onBack,
}: {
  seen: Set<string>;
  profile: Profile | null;
  /** the share counter, which the first two tabs are two halves of */
  counter: CounterProps;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('companies');

  return (
    <div className="archive">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        {/* Both tabs count the same way and in the same corner. In the tab
            itself the number ends up under the scrollbar. */}
        {tab === 'companies' && (
          <div className="arch-count">
            <b>{seen.size}</b>/{COMPANIES.length}
          </div>
        )}
        {tab === 'achievements' && (
          <div className="arch-count">
            <b>{Object.keys(profile?.awards ?? {}).length}</b>/{AWARDS.length}
          </div>
        )}
        {tab === 'portfolio' && (
          <div className="dollar-count">
            <Dollar size={18} />
            <b>{money(counter.dollars)}</b>
          </div>
        )}
      </header>

      <div className="arch-tabs">
        {TABS.map((x) => (
          <button
            key={x.id}
            className={`slot-tab${x.id === tab ? ' on' : ''}`}
            onClick={() => setTab(x.id)}
          >
            {x.label()}
          </button>
        ))}
      </div>

      {tab === 'companies' && <CompaniesTab seen={seen} counter={counter} />}
      {tab === 'portfolio' && <PortfolioTab {...counter} />}
      {tab === 'achievements' && <AwardsTab profile={profile} />}
    </div>
  );
}
