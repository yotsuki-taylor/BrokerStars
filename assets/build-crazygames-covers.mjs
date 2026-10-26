/**
 * The three covers CrazyGames asks for, from the same artwork as the Play
 * listing (`build-store.mjs`).
 *
 *   node assets/build-crazygames-covers.mjs
 *
 * Written to `assets/crazygames/`, uploaded by hand on the developer portal:
 *
 *   cover-1920x1080.png   landscape, the one most of the site shows
 *   cover-800x1200.png    portrait, 2:3
 *   cover-800x800.png     square
 *
 * CrazyGames' rules for them, which are why they look as they do: the game's
 * name is the only text allowed (so the BUY/SELL buttons at the bottom of the
 * artwork stay out, as they do on the Play banner), no borders, no logos or
 * badges, and the three should read as one set. Each is the same blue, the
 * same chart line, the same trader cut-out and the same lettering, arranged
 * for its shape.
 *
 * The cut-out is opaque, so wherever it stops short of an edge of the cover it
 * is faded into the background instead of ending on a hard line.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SOURCE = 'assets/source-icon.png';
const OUT = 'assets/crazygames';
const FONT = 'Arial Black, Segoe UI Black, Impact, sans-serif';

/** Everything above the BUY/SELL buttons: fist, face, cap, bills and chart. */
const ART = { left: 0, top: 0, width: 1254, height: 860 };

mkdirSync(OUT, { recursive: true });

const background = (w, h, cx, cy) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
     <defs>
       <radialGradient id="g" cx="${cx}%" cy="${cy}%" r="80%">
         <stop offset="0%" stop-color="#1E74E8"/>
         <stop offset="55%" stop-color="#0044C8"/>
         <stop offset="100%" stop-color="#00307E"/>
       </radialGradient>
     </defs>
     <rect width="${w}" height="${h}" fill="url(#g)"/>
   </svg>`);

/**
 * A window of the artwork, scaled, with its open sides faded out.
 *
 * `fade` names the sides that do not reach an edge of the cover and how many
 * pixels each takes to disappear.
 */
async function figure(window, width, height, fade = {}) {
  const art = await sharp(SOURCE).extract(window).resize(width, height).ensureAlpha().png().toBuffer();
  const stops = (side, px, size) => {
    const f = Math.min(1, px / size);
    return side === 'start'
      ? `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${f}" stop-color="#fff" stop-opacity="1"/>`
      : `<stop offset="${1 - f}" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>`;
  };
  const layers = [];
  if (fade.left) layers.push(['x', stops('start', fade.left, width)]);
  if (fade.right) layers.push(['x', stops('end', fade.right, width)]);
  if (fade.top) layers.push(['y', stops('start', fade.top, height)]);
  if (fade.bottom) layers.push(['y', stops('end', fade.bottom, height)]);
  let out = art;
  for (const [axis, s] of layers) {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <defs><linearGradient id="m" x1="0" y1="0" x2="${axis === 'x' ? 1 : 0}" y2="${axis === 'y' ? 1 : 0}">${s}</linearGradient></defs>
       <rect width="${width}" height="${height}" fill="url(#m)"/>
     </svg>`);
    out = await sharp(out).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  return out;
}

/** The ink's bounding box of a rendered layer, measured for the same reason `build-store.mjs` gives. */
async function ink(svg) {
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = -1, top = info.height, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, right, top, bottom };
}

/**
 * BROKER over STARS, white and green on the dark stroke the game letters
 * everything with, plus a soft shadow so it holds over the busy parts of the
 * artwork. `lines` 1 sets it on one line.
 */
const title = (w, h, { x, y, size, lines = 2, anchor = 'start' }) => {
  const stroke = Math.round(size * 0.15);
  const word = (text, tx, ty, fill) => `
       <text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="#0A2E63" stroke="#0A2E63" stroke-width="${stroke}"
             stroke-linejoin="round" filter="url(#s)">${text}</text>
       <text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${fill}">${text}</text>`;
  const body =
    lines === 2
      ? word('BROKER', x, y, '#FFFFFF') + word('STARS', x, y + Math.round(size * 1.02), '#3FD11A')
      : `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#0A2E63" stroke="#0A2E63" stroke-width="${stroke}"
               stroke-linejoin="round" filter="url(#s)">BROKER<tspan dx="${Math.round(size * 0.3)}">STARS</tspan></text>
         <text x="${x}" y="${y}" text-anchor="${anchor}"><tspan fill="#FFFFFF">BROKER</tspan><tspan dx="${Math.round(size * 0.3)}" fill="#3FD11A">STARS</tspan></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
     <defs><filter id="s" x="-10%" y="-20%" width="120%" height="160%">
       <feDropShadow dx="0" dy="${Math.round(size * 0.06)}" stdDeviation="${Math.round(size * 0.05)}" flood-color="#001840" flood-opacity="0.7"/>
     </filter></defs>
     <g font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="1">${body}</g>
   </svg>`;
};

/** The biggest title, from `want` down, whose ink stays inside `box`. */
async function fit(w, h, opts, want, floor, box, what) {
  for (let size = want; size >= floor; size -= 2) {
    const svg = title(w, h, { ...opts, size });
    const b = await ink(svg);
    if (b.left >= box.left && b.right <= box.right && b.top >= box.top && b.bottom <= box.bottom) {
      console.log(`  ${what}: ${size}px, ink ${b.left}..${b.right} x ${b.top}..${b.bottom}`);
      return Buffer.from(svg);
    }
  }
  throw new Error(`build-crazygames-covers: the title will not fit the ${what} cover even at ${floor}px`);
}

async function cover(name, w, h, layers, bg) {
  await sharp(background(w, h, ...bg))
    .composite(layers)
    .flatten({ background: '#0044C8' })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${name}`);
  console.log(`${OUT}/${name}`);
}

/* ------------------------------------------------------------- 1920 x 1080 */
// The trader takes the right of the frame, top to bottom, and the name the
// left, where the artwork's own bills are, faded back so it reads.
{
  const W = 1920, H = 1080;
  const window = { left: 60, top: 0, width: 1194, height: 860 };
  const fw = Math.round((window.width * H) / window.height); // 1500
  const left = W - fw;
  const art = await figure(window, fw, H, { left: 150 });
  const name = await fit(W, H, { x: 70, y: 420, lines: 2 }, 190, 110, { left: 50, right: 720, top: 150, bottom: 640 }, '1920x1080');
  await cover('cover-1920x1080.png', W, H, [{ input: art, left, top: 0 }, { input: name, left: 0, top: 0 }], [30, 50]);
}

/* -------------------------------------------------------------- 800 x 1200 */
// The name across the top, the trader filling the bottom two thirds.
{
  const W = 800, H = 1200;
  const window = { left: 40, top: 0, width: 1000, height: 860 };
  const fh = Math.round((window.height * W) / window.width); // 688
  const art = await figure(window, W, fh, { top: 160 });
  const name = await fit(W, H, { x: W / 2, y: 260, lines: 2, anchor: 'middle' }, 170, 100, { left: 40, right: 760, top: 80, bottom: 560 }, '800x1200');
  await cover('cover-800x1200.png', W, H, [{ input: art, left: 0, top: H - fh }, { input: name, left: 0, top: 0 }], [50, 30]);
}

/* --------------------------------------------------------------- 800 x 800 */
// The same, squarer: a shorter name over a wider window of the artwork.
{
  const W = 800, H = 800;
  const window = { left: 20, top: 0, width: 1220, height: 860 };
  const fw = 880;
  const fh = Math.round((window.height * fw) / window.width); // 677
  // Wider than the cover, so it is cut to it: sharp will not paste past an edge.
  const wide = await figure(window, fw, fh, { top: 90 });
  const art = await sharp(wide).extract({ left: (fw - W) / 2, top: 0, width: W, height: fh }).png().toBuffer();
  const name = await fit(W, H, { x: W / 2, y: 140, lines: 1, anchor: 'middle' }, 110, 60, { left: 30, right: 770, top: 30, bottom: 175 }, '800x800');
  await cover('cover-800x800.png', W, H, [{ input: art, left: 0, top: H - fh }, { input: name, left: 0, top: 0 }], [50, 30]);
}
