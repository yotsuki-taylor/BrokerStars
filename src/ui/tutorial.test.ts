import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANGS, lang, setLang, t, type Key } from './i18n';
import { TUTORIAL } from './tutorial';

/** The menu's own source, which is where the marks have to be. */
const MENU = readFileSync(fileURLToPath(new URL('./Menu.tsx', import.meta.url)), 'utf8');

describe('the tour', () => {
  it('points at marks the menu actually carries', () => {
    // A step whose mark is not in the markup drops itself at runtime rather
    // than lighting up empty floor (`TutorialOverlay.tsx`), which is the right
    // thing to do in a browser and a very quiet way to lose a whole feature's
    // explanation. This is what makes the loss loud instead.
    const missing = TUTORIAL.flatMap((s) => s.marks ?? []).filter(
      (mark) => !MENU.includes(`data-tut="${mark}"`),
    );
    expect(missing, `no such mark in the menu: ${missing.join(', ')}`).toEqual([]);
  });

  it('has a title and a paragraph for every step in both languages', () => {
    const before = lang();
    try {
      for (const l of LANGS) {
        setLang(l);
        for (const step of TUTORIAL) {
          for (const part of ['title', 'body']) {
            const text = t(`tut.${step.id}.${part}` as Key);
            expect(text, `${l}: tut.${step.id}.${part}`).toBeTruthy();
          }
        }
      }
    } finally {
      setLang(before);
    }
  });

  it('says the things a player would never work out alone', () => {
    // The tour exists for four facts in particular, and each of them is one
    // sentence somebody could tidy away without noticing what it was doing
    // there: clothes change the match, the room does not, dollars buy shares,
    // and a duel is played against a person you send a link to.
    const before = lang();
    try {
      setLang('en');
      expect(t('tut.equip.body')).toMatch(/wear/i);
      expect(t('tut.room.body')).toMatch(/not a single number/i);
      expect(t('tut.shares.body')).toMatch(/shares/i);
      expect(t('tut.duel.body')).toMatch(/link/i);
    } finally {
      setLang(before);
    }
  });
});
