/**
 * What the launcher will actually show, before shipping it.
 *
 *   node assets/preview-adaptive.mjs   →   assets/_preview.png (gitignored)
 *
 * An adaptive icon is never seen as drawn, and the gap between the file and the
 * icon is wide enough to hide a mistake in: the first pass of this icon looked
 * fine as a PNG and turned out to be a small drawing adrift in a blue ring, and
 * the pass after that had the ends taken off BUY and SELL. Neither was visible
 * in the source file. Both were obvious here.
 *
 * So this composes the real generated files the way Android composes them — the
 * 16.7% inset out of `ic_launcher.xml`, the 108dp canvas, the mask over the
 * middle 72dp — and cuts them with the two shapes that matter: the circle, which
 * is the harshest thing a launcher does, and the squircle, which is what most
 * phones actually use.
 *
 * Run it after changing anything in `build-icons.mjs`, and look before you push.
 */
import sharp from 'sharp';

/** 108dp at 4x, the canvas Android hands the launcher. */
const CANVAS = 432;
/** What ic_launcher.xml applies, which lands the artwork on the visible 72dp. */
const INSET = Math.round(CANVAS * 0.167);
const BOX = CANVAS - INSET * 2;

const shape = (body) => Buffer.from(`<svg width="${CANVAS}" height="${CANVAS}">${body}</svg>`);

const MASKS = {
  circle: shape(`<circle cx="${CANVAS / 2}" cy="${CANVAS / 2}" r="${BOX / 2}" fill="#fff"/>`),
  squircle: shape(
    `<rect x="${INSET}" y="${INSET}" width="${BOX}" height="${BOX}" rx="${BOX * 0.28}" fill="#fff"/>`,
  ),
};

async function masked(mask) {
  const background = await sharp('assets/icon-background.png').resize(BOX, BOX).toBuffer();
  const foreground = await sharp('assets/icon-foreground.png').resize(BOX, BOX).toBuffer();
  const stacked = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: background, left: INSET, top: INSET },
      { input: foreground, left: INSET, top: INSET },
    ])
    .png()
    .toBuffer();
  // Masking and shrinking have to be two passes: sharp applies a resize BEFORE
  // a composite whatever order they are called in, so asking for both at once
  // shrinks the icon and then tries to lay a full-size mask over it.
  return sharp(stacked).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

const TILE = 260;
const tiles = [];
let column = 0;
for (const mask of Object.values(MASKS)) {
  const cut = await sharp(await masked(mask)).resize(TILE).png().toBuffer();
  tiles.push({ input: cut, left: 20 + column * (TILE + 20), top: 20 });
  column++;
}

await sharp({
  create: {
    width: 40 + column * (TILE + 20) - 20,
    height: TILE + 40,
    channels: 4,
    background: { r: 235, g: 235, b: 238, alpha: 1 },
  },
})
  .composite(tiles)
  .png()
  .toFile('assets/_preview.png');

console.log(`assets/_preview.png — ${Object.keys(MASKS).join(', ')}`);
