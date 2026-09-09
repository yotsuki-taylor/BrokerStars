import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { t, type Key } from './i18n';
import { TUTORIAL, type TutorialStep } from './tutorial';

/**
 * The tour itself: one button lit at a time, everything else dimmed, and a card
 * on the dark part saying what the lit thing is for. The steps and the reason
 * there are any are in `tutorial.ts`.
 *
 * HOW THE DIM IS DRAWN. One box over the button, with a box-shadow spread wide
 * enough to reach any screen. That is the whole mask — no four panels to keep
 * in step with each other, no SVG, and the hole can never drift away from the
 * ring around it because they are the same element.
 *
 * NOTHING UNDER IT IS CLICKABLE, INCLUDING THE LIT BUTTON. The root here covers
 * the screen and swallows every tap. A tour whose highlighted button worked
 * would be a tour that walks the player off the screen it is describing, and
 * halfway through the sentence at that; the buttons are all still there when it
 * is over.
 */

/** The lit box, in viewport coordinates — the overlay is `position: fixed`. */
interface Hole {
  top: number;
  left: number;
  width: number;
  height: number;
  /** the target's own corners, so the ring sits on the button's outline */
  radius: string;
}

/** Breathing room between the button's edge and the ring around it. */
const PAD = 6;

function markedEls(step: TutorialStep): HTMLElement[] {
  if (!step.marks) return [];
  const found: HTMLElement[] = [];
  for (const mark of step.marks) {
    const el = document.querySelector(`[data-tut="${mark}"]`);
    if (el instanceof HTMLElement) found.push(el);
  }
  return found;
}

/**
 * The box to light up: the union of the step's marks, padded, and kept inside
 * the screen. Two marks happen for the pair of currency counters, which are one
 * idea sitting in two pills.
 *
 * The clamp is not fussiness. Half of what the menu puts near the top edge sits
 * a few pixels below it, so the padded box would hang over the top of the
 * screen and the ring would arrive with its lid cut off.
 */
function holeFor(step: TutorialStep): Hole | null {
  const els = markedEls(step);
  if (!els.length) return null;
  const rects = els.map((el) => el.getBoundingClientRect());
  const edge = 2;
  const top = Math.max(edge, Math.min(...rects.map((r) => r.top)) - PAD);
  const left = Math.max(edge, Math.min(...rects.map((r) => r.left)) - PAD);
  const right = Math.min(
    window.innerWidth - edge,
    Math.max(...rects.map((r) => r.right)) + PAD,
  );
  const bottom = Math.min(
    window.innerHeight - edge,
    Math.max(...rects.map((r) => r.bottom)) + PAD,
  );
  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
    radius: window.getComputedStyle(els[0]).borderRadius || '12px',
  };
}

export default function Tutorial({ onClose }: { onClose: () => void }) {
  /**
   * The steps that have something to point at on the screen as it stands. A
   * mark that is not in the DOM — a button behind a flag, a menu that has moved
   * on since this list was written — takes its step with it rather than lighting
   * up empty floor, and steps that point at nothing in the first place stay.
   *
   * Settled once, in a layout effect: the menu's markup is only there to be
   * measured after the commit that mounted it.
   */
  const [steps, setSteps] = useState<TutorialStep[] | null>(null);
  const [i, setI] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  /**
   * How tall the card came out. The text is a paragraph in two languages, so
   * its height is not something this file can be told — and the card cannot be
   * placed above a button without it. Measured in a layout effect, which is
   * before the browser paints, so the corrected position is the first one
   * anybody sees.
   */
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);

  useLayoutEffect(() => {
    const live = TUTORIAL.filter((s) => !s.marks || markedEls(s).length > 0);
    // Nothing to show should never happen from the menu; if it ever does, get
    // out of the way rather than sit on the screen with no way off it.
    if (!live.length) onClose();
    else setSteps(live);
  }, [onClose]);

  const step = steps?.[i] ?? null;

  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => setHole(holeFor(step));
    measure();
    // The room behind the menu is images, and the renovation card changes
    // height with the text in it, so the first frame is not always the final
    // layout. One more look after the browser has drawn costs nothing.
    const again = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(again);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 0;
    if (h && h !== cardH) setCardH(h);
  });

  const next = useCallback(() => {
    if (!steps) return;
    if (i + 1 >= steps.length) onClose();
    else setI(i + 1);
  }, [i, onClose, steps]);

  if (!steps || !step) return null;

  const last = i + 1 === steps.length;
  const view = window.innerHeight;
  const GAP = 14;
  const EDGE = 8;
  /**
   * Whichever side of the lit button has more room, so the card never covers
   * the thing it is describing. On a screen too short to hold both, the clamp
   * below wins and the card sits over the button rather than off the top of
   * the world — a sentence that can be read beats a highlight that can be seen.
   */
  const below = !hole || view - (hole.top + hole.height) >= hole.top;
  const wanted = hole
    ? below
      ? hole.top + hole.height + GAP
      : hole.top - GAP - cardH
    : (view - cardH) / 2;
  const place: React.CSSProperties = {
    top: Math.max(EDGE, Math.min(wanted, view - cardH - EDGE)),
  };

  return (
    <div className="tut">
      {hole ? (
        <div
          className="tut-hole"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: hole.radius,
          }}
        />
      ) : (
        <div className="tut-dim" />
      )}

      <div className="tut-card" ref={cardRef} style={place}>
        <span className="tut-step">
          {t('tut.step', { n: i + 1, of: steps.length })}
        </span>
        <h3>{t(`tut.${step.id}.title` as Key)}</h3>
        <p>{t(`tut.${step.id}.body` as Key)}</p>
        <div className="tut-actions">
          <button className="tut-btn ghost" onClick={onClose}>
            {t('tut.skip')}
          </button>
          <button className="tut-btn" onClick={next}>
            {last ? t('tut.done') : t('tut.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
