import React, { useEffect, useState } from 'react';
import { COMPANIES, TRAIT_LABEL, type Company } from '../sim/companies';
import { AWARDS, GROUPS, type Award, type AwardGroup } from '../awards/catalogue';
import type { Profile } from '../profile/protocol';
import { LogoMask, Lock, money } from './components';
import { LEAGUES, leagueName } from './leagues';
import { t, tr, type Key } from './i18n';

/**
 * The archive: what the player has collected, under two tabs.
 *
 * COMPANIES is everything the game can put on a board, unlocked by playing a
 * match out against it — nothing bought, and nothing spoiled in advance.
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

type Tab = 'companies' | 'achievements';

const TABS: { id: Tab; label: () => string }[] = [
  { id: 'companies', label: () => t('archive.tabCompanies') },
  { id: 'achievements', label: () => t('archive.tabAchievements') },
];

function whereFound(c: Company): string {
  if (c.staple) return t('archive.everyLeague');
  const league = LEAGUES[c.fromLeague];
  return league ? t('archive.andUp', { name: leagueName(league) }) : t('archive.unknown');
}

function CompaniesTab({ seen }: { seen: Set<string> }) {
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
  onBack,
}: {
  seen: Set<string>;
  profile: Profile | null;
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
        {tab === 'companies' ? (
          <div className="arch-count">
            <b>{seen.size}</b>/{COMPANIES.length}
          </div>
        ) : (
          <div className="arch-count">
            <b>{Object.keys(profile?.awards ?? {}).length}</b>/{AWARDS.length}
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

      {tab === 'companies' && <CompaniesTab seen={seen} />}
      {tab === 'achievements' && <AwardsTab profile={profile} />}
    </div>
  );
}
