import React, { useEffect, useState } from 'react';
import {
  DAILY_BONUS,
  bonusReady,
  nextDayAt,
  questDone,
  questsToday,
  rolled,
  type Daily,
  type Quest,
} from '../daily/protocol';
import { Check, Dollar, Coin, money, tex } from './components';
import { t, type Key } from './i18n';

/**
 * The day: one bonus at the top and the day's quests under it.
 *
 * The bonus is the part that works. It pays dollars — the currency the shop
 * cannot see and the share counter will eventually take — and it is the only
 * thing in the game that pays for turning up rather than for playing well.
 *
 * The three quests under it are dealt by the day itself — `questsFor(day)` in
 * `src/daily/protocol.ts` works them out from the date rather than storing a
 * pick, so this screen and the server that counts them cannot be looking at
 * different ones. They are counted as matches are handed in and paid in coins
 * when the player comes and takes them: a finished quest wears the same gold
 * the menu button was wearing, and its bar turns into a COLLECT.
 *
 * The clock ticks because the screen can be left open. A player who claims at
 * 23:58 should watch the wait fall to zero and the button come back, rather
 * than sit in front of a stale sentence.
 */

/** The strings for one quest. Built rather than listed, like `awardKey`. */
const questKey = (q: Quest, part: 'name' | 'text') => `quest.${q.id}.${part}` as Key;

/**
 * The goal as it goes into the sentence. `nw-15k` asks for fifteen thousand,
 * and 15000 in the middle of a line reads as a phone number — so a goal in that
 * range is spaced the way the game writes money everywhere else.
 */
const goalText = (q: Quest): string => money(q.goal);

/** How long until the next day starts, as the player reads a wait. */
function untilTomorrow(now: number): string {
  const left = Math.max(0, nextDayAt(now) - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? t('daily.inHours', { h, m }) : t('daily.inMinutes', { m });
}

export default function DailyScreen({
  daily,
  dollars,
  onClaimBonus,
  onClaimQuest,
  onBack,
}: {
  daily: Daily;
  /** shown in the corner, so the thousand the bonus pays lands somewhere visible */
  dollars: number;
  onClaimBonus: () => void;
  onClaimQuest: (id: string) => void;
  onBack: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // A minute is as fine as the wait below is ever drawn, and the last minute
    // of the day is the only one where being a minute late shows.
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  // The day held in state was rolled when it arrived; this rolls it again for
  // the game that was left open across midnight.
  const today = rolled(daily, now);
  const ready = bonusReady(today);

  return (
    <div className="daily">
      <header className="menu-top">
        <button className="menu-btn back" onClick={onBack}>
          {t('common.back')}
        </button>
        <span className="spacer" />
        <div className="dollar-count">
          <Dollar size={18} />
          <b>{money(dollars)}</b>
        </div>
      </header>

      {/* The bonus is the whole top of the screen on purpose: it is the one
          thing here that pays today, and a player who came for it should not
          have to look for it. */}
      <button
        className={`bonus-card${ready ? '' : ' taken'}`}
        onClick={onClaimBonus}
        disabled={!ready}
      >
        <img className="bonus-art" src={tex('DailyBonus.png')} alt="" />
        <span className="bonus-text">
          <b>{t('daily.bonusTitle')}</b>
          <i>{ready ? t('daily.bonusReady') : t('daily.bonusBackIn', { time: untilTomorrow(now) })}</i>
        </span>
        <span className="bonus-pay">
          <Dollar size={16} />
          {money(DAILY_BONUS)}
        </span>
      </button>

      <h3 className="daily-head">{t('daily.questsTitle')}</h3>

      <div className="quests">
        {questsToday(today.day).map((q) => {
          const at = today.progress[q.id] ?? 0;
          const done = questDone(today, q);
          const taken = today.taken.includes(q.id);
          return (
            <div key={q.id} className={`quest${taken ? ' taken' : done ? ' done' : ''}`}>
              <span className="quest-text">
                <b>{t(questKey(q, 'name'))}</b>
                <i>{t(questKey(q, 'text'), { n: goalText(q) })}</i>
              </span>
              <span className="quest-pay">
                <Coin size={13} /> {q.coins}
              </span>

              {/* The bar and the button stand in the same place: a finished
                  quest turns its own progress into the thing to tap, rather
                  than growing a fourth column that is empty on two rows out of
                  three. */}
              {done && !taken ? (
                <button className="quest-take" onClick={() => onClaimQuest(q.id)}>
                  {t('daily.collect', { n: q.coins })}
                </button>
              ) : (
                <span className="quest-bar">
                  <i style={{ width: `${Math.min(100, (at / q.goal) * 100)}%` }} />
                  <em>
                    {taken ? (
                      <Check size={11} />
                    ) : (
                      `${money(Math.min(at, q.goal))}/${money(q.goal)}`
                    )}
                  </em>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="empty-note">{t('daily.questsRoll')}</p>
    </div>
  );
}
