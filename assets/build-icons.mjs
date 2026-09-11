/**
 * Every icon Android and Play ask for, cut from one drawing.
 *
 * `source-icon.png` is the artwork; everything below is arithmetic on it. It is
 * a script rather than a folder of exported files so that changing the art is
 * dropping in one image and running this, instead of re-exporting a hundred and
 * thirty-six sizes by hand and hoping none was missed.
 *
 *   node assets/build-icons.mjs
 *   npx @capacitor/assets generate --android
 *
 * THE ONE THING WORTH UNDERSTANDING HERE is what an adaptive icon does to a
 * drawing, because it is not what you would expect and it decides every number
 * below.
 *
 * Android does not show a launcher icon as drawn. It hands the launcher a
 * 108dp canvas and lets it cut whatever shape it likes out of the middle 72dp
 * — circle, squircle, rounded square, teardrop, the manufacturer's choice. Only
 * that middle 66.7% is promised to survive; everything outside it is decoration
 * for the parallax wiggle and may simply be gone.
 *
 * The artwork is a store icon: drawn edge to edge, with the BUY and SELL
 * buttons running off the bottom and money in the corners. Used full-bleed as a
 * launcher icon the buttons are the first thing lost — the bottom of the art is
 * exactly where a round mask bites. So the drawing is pulled in a little and
 * the blue behind it fills what the launcher would otherwise have eaten.
 *
 * How far in is `SAFE`, and it was chosen by looking rather than by arithmetic:
 * `preview-adaptive.mjs` cuts the real files with the real masks, and at 0.85
 * both words stay whole under a circle while the frame stays narrow enough that
 * the icon does not look timid beside its neighbours. Pulled all the way in to
 * 0.667 nothing is cropped at all, and it looks small; left at 1.0 it fills the
 * frame and a circle takes the ends off BUY and SELL.
 *
 * The blue is sampled from the corners of the artwork itself (#003FC5 and its
 * neighbours), so the frame reads as the drawing's own background rather than
 * as a mat somebody put behind it.
 *
 * The legacy icon and the 512px one Play shows in the listing are never masked,
 * so they get the drawing whole, edge to edge, exactly as it was made.
 */
import sharp from 'sharp';

const SOURCE = 'assets/source-icon.png';
const SIZE = 1024;

/** How much of the launcher's guaranteed square the drawing is allowed to fill. */
const SAFE = 0.85;

/** The blue the artwork fades to at its edges, so the frame does not show. */
const GROUND = `
  <defs>
    <radialGradient id="ground" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#0A66E8"/>
      <stop offset="60%" stop-color="#0044C8"/>
      <stop offset="100%" stop-color="#00339E"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#ground)"/>`;

const ground = (size, body = GROUND) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`,
  );

/** The drawing, scaled to `fill` of the canvas and centred on it. */
async function inset(fill, canvas = SIZE) {
  const art = Math.round(canvas * fill);
  const buf = await sharp(SOURCE).resize(art, art).png().toBuffer();
  const offset = Math.round((canvas - art) / 2);
  return sharp(ground(canvas))
    .composite([{ input: buf, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/* What the launcher masks. @capacitor/assets already insets this file into the
   guaranteed square, so SAFE is measured against that square, not the canvas. */
await sharp(await inset(SAFE)).toFile('assets/icon-foreground.png');

/* What shows through wherever the launcher cropped. */
await sharp(ground(SIZE)).png().toFile('assets/icon-background.png');

/* Never masked — the drawing as it was made. */
await sharp(SOURCE).resize(SIZE, SIZE).png().toFile('assets/icon.png');

/**
 * The splash is a square cropped to the shape of the phone, so the drawing sits
 * small and dead centre where no aspect ratio can reach it. Flat blue rather
 * than the gradient: this one is seen beside the game's own first frame, and
 * that frame is #0B4FA8.
 */
const SPLASH = 2732;
async function splash(background) {
  const art = 760;
  const offset = Math.round((SPLASH - art) / 2);
  const buf = await sharp(SOURCE).resize(art, art).png().toBuffer();
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}">` +
        `<rect width="${SPLASH}" height="${SPLASH}" fill="${background}"/></svg>`,
    ),
  )
    .composite([{ input: buf, left: offset, top: offset }])
    .png()
    .toBuffer();
}

await sharp(await splash('#0B4FA8')).toFile('assets/splash.png');
await sharp(await splash('#06306B')).toFile('assets/splash-dark.png');

console.log('icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');
