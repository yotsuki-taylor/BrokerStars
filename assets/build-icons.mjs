/**
 * The app icon, drawn here rather than dropped in as a file.
 *
 * There was no icon to start from: the game's own art is a promo shot of a
 * match and a handful of 48px company logos, none of which is a mark. So this
 * draws one in the game's own language -- the blue the window chrome is painted
 * (#0B4FA8, the same constant as src/platform/telegram.ts and the theme-color
 * meta) and the green a rising line is drawn in during a match.
 *
 * TWO SIZES, because Android asks for two different things and sizing them the
 * same wastes one of them. The adaptive icon's foreground may be cropped to the
 * middle of the canvas by whatever shape the launcher likes, so its mark sits
 * inside the 62.5% safe area. The legacy icon and the 512px one Play shows in
 * the listing are never cropped, so their mark fills the frame properly.
 *
 * Run with `node assets/build-icons.mjs`, then `npx @capacitor/assets generate
 * --android` to cut the dozen sizes Android wants out of these three.
 */
import sharp from 'sharp';

/** The mark, in a 640-unit box, wherever that box ends up. */
const mark = `
  <path d="M56 74 V566 H600" fill="none" stroke="#FFFFFF" stroke-opacity="0.38"
        stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M96 470 L206 392 L292 432 L396 268 L470 316 L566 138"
        fill="none" stroke="#FFFFFF" stroke-width="84"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M96 470 L206 392 L292 432 L396 268 L470 316 L566 138"
        fill="none" stroke="#3FD11A" stroke-width="52"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="566" cy="138" r="62" fill="#FFFFFF"/>
  <circle cx="566" cy="138" r="38" fill="#3FD11A"/>`;

const ground = `
  <defs>
    <radialGradient id="ground" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#1E74E8"/>
      <stop offset="55%" stop-color="#0B4FA8"/>
      <stop offset="100%" stop-color="#063A7E"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#ground)"/>`;

/** `fill` is how much of the 1024 canvas the 640-unit mark is scaled to cover. */
const svg = (body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`);

function placed(fill) {
  const size = 1024 * fill;
  const scale = size / 640;
  const offset = (1024 - size) / 2;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g>`;
}

const png = (body, file) => sharp(svg(body)).png().toFile(`assets/${file}`);

await png(ground, 'icon-background.png');
// cropped by the launcher: stay inside the safe area
await png(placed(0.625), 'icon-foreground.png');
// never cropped: fill the frame
await png(ground + placed(0.82), 'icon.png');

/**
 * The splash is a square that will be cropped to whatever shape the phone is,
 * so the mark sits small and dead centre where no aspect ratio can reach it.
 * Same blue as the window chrome, so the seam between splash and first frame
 * does not show.
 */
const SPLASH = 2732;
const splash = (dark) => {
  const size = 620;
  const scale = size / 640;
  const offset = (SPLASH - size) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}" viewBox="0 0 ${SPLASH} ${SPLASH}">` +
      `<rect width="${SPLASH}" height="${SPLASH}" fill="${dark ? '#06306B' : '#0B4FA8'}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g>` +
      `</svg>`,
  );
};

await sharp(splash(false)).png().toFile('assets/splash.png');
await sharp(splash(true)).png().toFile('assets/splash-dark.png');
console.log('icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');
