/**
 * Squeeze the splash screens the asset generator leaves behind.
 *
 *   node assets/build-icons.mjs
 *   npx @capacitor/assets generate --android
 *   node assets/shrink-splash.mjs      <- this, last
 *
 * or `npm run icons`, which is the three of them in order.
 *
 * WHY THIS EXISTS. `@capacitor/assets` writes full-colour PNGs, and a splash is
 * the worst possible thing to store that way: it is an almost entirely flat
 * field of one blue with a small drawing in the middle of it, repeated at every
 * screen density in both orientations, light and dark. Thirty-two files and 7.3
 * MB, for a picture nobody looks at for longer than it takes the game to draw
 * its first frame.
 *
 * A 256-colour palette is exact for the flat field — it is one colour — and the
 * drawing is cartoon art with flat fills, so there is nothing for banding to
 * get hold of. The files come out around a seventh of the size.
 *
 * The icons are deliberately NOT touched. They are the same drawing but they
 * are looked at, every time somebody opens their launcher, and a quantised
 * gradient behind a face is the sort of thing that is invisible in a comparison
 * and obvious on a home screen. They are 615 KB, which is not a problem worth
 * solving with a risk.
 *
 * Idempotent: quantising an already-quantised file changes nothing, so running
 * this twice is free and forgetting whether you ran it costs nothing either.
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';

/** Every generated splash, wherever the generator decided to put it. */
function splashes() {
  const out = [];
  for (const dir of readdirSync(RES)) {
    if (!dir.startsWith('drawable')) continue;
    const file = join(RES, dir, 'splash.png');
    try {
      if (statSync(file).isFile()) out.push(file);
    } catch {
      /* a drawable folder with no splash in it is most of them */
    }
  }
  return out;
}

let before = 0;
let after = 0;
for (const file of splashes()) {
  before += statSync(file).size;
  // Read to a buffer first: sharp will not write to the file it is reading.
  const shrunk = await sharp(file).png({ palette: true, colors: 256, effort: 10 }).toBuffer();
  await sharp(shrunk).toFile(file);
  after += statSync(file).size;
}

const mb = (n) => (n / 1048576).toFixed(2);
console.log(`splashes: ${mb(before)} MB → ${mb(after)} MB (${(100 - (after / before) * 100).toFixed(0)}% off)`);
