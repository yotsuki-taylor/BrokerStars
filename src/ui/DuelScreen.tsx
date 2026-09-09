import React, { useEffect, useState } from 'react';
import { Check, Cross } from './components';
import { t } from './i18n';
import type { DuelError } from '../duel/protocol';
import type { Shout } from './duel';

export type DuelPhase = 'opening' | 'waiting' | 'joining' | 'error';

/**
 * Everything that happens before the versus screen: minting an invitation,
 * handing it to somebody, and waiting for them.
 *
 * The countdown is the point of the screen. An invitation is good for fifteen
 * minutes and there is no way to know from the outside whether the friend has
 * seen it, so the one honest thing to show is how long is left — and to say so
 * in the message that goes with the link, where they will read it.
 *
 * There are three ways off this screen with an invitation in hand, and the
 * third is why the first two were not enough. SEND needs somebody to send it
 * to and COPY needs somewhere to paste it; the player who has neither has a
 * fifteen-minute countdown and nobody to spend it on. IN THE CHAT hands the
 * invitation to the game's own group instead, where the answer is whoever taps
 * first. It appears only when the server says there is a chat to shout into.
 */
export default function DuelScreen({
  phase,
  link,
  code,
  expiresAt,
  leagueName,
  rivalName,
  invited,
  error,
  onSend,
  onCopy,
  onShout,
  onBack,
}: {
  phase: DuelPhase;
  link: string | null;
  code: string | null;
  expiresAt: number | null;
  leagueName: string;
  /** set the moment the other one is on the socket, before the match exists */
  rivalName: string | null;
  /**
   * Called out by name from the friends list, and whether the bot managed to
   * put the invitation in front of them. Null for a duel opened from the menu,
   * which is one nobody has been named for yet.
   */
  invited: { name: string; sent: boolean } | null;
  error: DuelError | 'net' | null;
  onSend: () => void;
  onCopy: () => Promise<boolean>;
  /**
   * Call the duel out in the group chat, or nothing when this deployment has
   * no chat to call it out in — the button is drawn from whether this is here.
   */
  onShout?: () => Promise<Shout>;
  onBack: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  /**
   * What came of the shout, and it stays on the screen: unlike COPY, which
   * flashes and forgets, this one is the answer to "did that go anywhere" and
   * the player has a countdown to spend deciding what to do next.
   */
  const [shouted, setShouted] = useState<Shout | null>(null);
  const [shouting, setShouting] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // The server's clock, not ours: `expiresAt` came from it, and the difference
  // between two phones is smaller than anything worth correcting for here.
  const left = Math.max(0, (expiresAt ?? 0) - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  const copy = async () => {
    setCopied(await onCopy());
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shout = async () => {
    if (!onShout || shouting) return;
    setShouting(true);
    setShouted(await onShout());
    setShouting(false);
  };

  if (phase === 'error') {
    return (
      <div className="overlay duel">
        <h2>{t('duel.title')}</h2>
        <div className="duel-note bad">
          <Cross size={22} />
          <span>{t(`duel.err.${error ?? 'net'}` as Parameters<typeof t>[0])}</span>
        </div>
        <div className="spacer" />
        <button className="big-btn" onClick={onBack}>
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (phase !== 'waiting') {
    return (
      <div className="overlay duel">
        <h2>{t('duel.title')}</h2>
        <div className="duel-status">
          {phase === 'joining' ? t('duel.joining') : t('duel.opening')}
        </div>
        <div className="spacer" />
        <button className="big-btn ghost" onClick={onBack}>
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="overlay duel">
      <h2>{t('duel.title')}</h2>
      <div className="sub">{t('duel.board', { name: leagueName })}</div>

      <div className={`duel-clock${left < 60000 ? ' urgent' : ''}`}>
        {t('duel.expires', { mm, ss })}
      </div>

      {/* Who it went to, when it went to somebody by name. A message that did
          not land says so rather than being quietly dropped: the link below is
          then the only way this duel happens, and the player has to know that
          it is on them to send it. */}
      {invited ? (
        <div className={`duel-note${invited.sent ? '' : ' bad'}`}>
          {t(invited.sent ? 'duel.invited' : 'duel.notInvited', { name: invited.name })}
        </div>
      ) : (
        <p>{t('duel.how')}</p>
      )}

      {/* The code, so a link that will not open is still something a friend can
          be read down a phone. It is the whole of the invitation's secrecy, and
          it says so in the line underneath. */}
      {code && <div className="duel-code">{code.toUpperCase()}</div>}

      <div className="duel-actions">
        <button className="big-btn" onClick={onSend} disabled={!link}>
          {t('duel.send')}
        </button>
        <button className="menu-btn" onClick={copy} disabled={!link}>
          {copied ? (
            <>
              <Check size={16} /> {t('duel.copied')}
            </>
          ) : (
            t('duel.copy')
          )}
        </button>

        {/* Spent once it has been said: the chat has heard about this duel and
            saying it twice is what the server's cooldown is there to refuse
            anyway. A refusal still leaves the button, because the thing that
            went wrong may not still be wrong. */}
        {onShout && (
          <button
            className="menu-btn shout"
            onClick={shout}
            disabled={!code || shouting || shouted === 'ok'}
          >
            {shouted === 'ok' ? (
              <>
                <Check size={16} /> {t('duel.shouted')}
              </>
            ) : (
              t('duel.shout')
            )}
          </button>
        )}
      </div>

      {shouted && shouted !== 'ok' && (
        <div className="duel-note bad">
          {t(shouted === 'wait' ? 'duel.shoutWait' : 'duel.shoutFailed')}
        </div>
      )}

      {!link && <div className="duel-note bad">{t('duel.err.nolink')}</div>}

      <div className="duel-status">
        {rivalName ? t('duel.rivalIn', { name: rivalName }) : t('duel.waiting')}
      </div>

      <div className="spacer" />
      <button className="big-btn ghost" onClick={onBack}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
