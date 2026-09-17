import React from 'react';
import { AWARDS, GROUPS, type Award, type AwardGroup } from '../awards/catalogue';
import { LEAGUES, leagueName } from './leagues';
import { Lock, money } from './components';
import { t, tr, type Key } from './i18n';
import type { Profile } from '../profile/protocol';

/**
 * The shelf: every award, what it asks for, and how far along it is.
 *
 * It lived in the archive — the screen that is now the market — for as long as
 * there was nowhere better, and it never belonged there: what a company does to
 * a price and what a player has achieved are two different subjects that only
 * shared a screen. It is the profile's now, lifted across without a line
 * changed so that a move of a thousand pixels is not also a rewrite.
 *
 * Half of the shelf is published — those are goals, and a goal you cannot see
 * is not one — and half is not: a hidden award is a thing that happened to you,
 * and printing the condition would turn each into a chore to farm. The hidden
 * ones are drawn as a row of question marks with a count, so it is clear there
 * is something there without saying what.
 */
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

export default function AwardsShelf({ profile }: { profile: Profile | null }) {
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
