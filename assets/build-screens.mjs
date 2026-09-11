/**
 * Turn raw device captures into screenshots a listing will accept.
 *
 *   node assets/build-screens.mjs
 *
 * Two things are done to each and both are necessary.
 *
 * THE SYSTEM BARS COME OFF. A capture is the whole display, clock and
 * notification icons and gesture bar included — somebody's battery percentage
 * and whatever app messaged them last, in a picture that will sit in a store
 * for years. The numbers are the device's own: `dumpsys window displays` gives
 * the decor insets, 172 above and 126 below on the phone these were taken on.
 *
 * WHICH ALSO FIXES THE SHAPE. The display is 1080x2410, a ratio of 2.23:1, and
 * Play will not take a phone screenshot more extreme than 2:1. What is left
 * after the bars is 1080x2112 — 1.96:1, inside the limit, and not a pixel of
 * the game lost to a crop or hidden behind a letterbox.
 *
 * The order is the order they appear in the listing, and the first one is the
 * only one most people will see: a match in progress, which is the game.
 */
import sharp from 'sharp';
import { readdirSync, unlinkSync } from 'node:fs';

/** From `adb shell dumpsys window displays`, ROTATION_0 overrideNonDecorInsets. */
const TOP = 172;
const BOTTOM = 126;
const WIDTH = 1080;
const DISPLAY_HEIGHT = 2410;

const ORDER = [
  ['match', '1-match'],
  ['result', '2-result'],
  ['menu', '3-office'],
  ['shop', '4-wardrobe'],
  ['rating', '5-rating'],
  ['leagues', '6-leagues'],
];

for (const [from, to] of ORDER) {
  await sharp(`assets/store/raw-${from}.png`)
    .extract({ left: 0, top: TOP, width: WIDTH, height: DISPLAY_HEIGHT - TOP - BOTTOM })
    .png({ palette: true, colors: 256, dither: 1, effort: 10 })
    .toFile(`assets/store/${to}.png`);
}

// The raws carry the status bar, which carries whoever happened to message the
// phone while these were taken. They are not kept.
for (const f of readdirSync('assets/store')) {
  if (f.startsWith('raw-') || f.startsWith('_')) unlinkSync(`assets/store/${f}`);
}

console.log(ORDER.map(([, to]) => to).join(', '));
