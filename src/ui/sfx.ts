/**
 * The game's sound effects: ten short files in `public/sounds/`.
 *
 * Web Audio rather than `<audio>` elements. An `<audio>` on a phone starts late
 * enough to hear, and a tap sound that lands after the finger has lifted reads
 * as lag rather than feedback. Decoded buffers start on the next audio frame, and
 * the same sound can overlap itself, which a fast run of BUY taps needs.
 *
 * Buttons play their sound by themselves, so no handler has to remember to call
 * this. One listener on the document hears every button click: a button with a
 * `data-sfx` plays that sound, `data-sfx="none"` plays nothing, and any other
 * button plays `click`. A disabled button never gets a click event, so a shut
 * BUY makes no sound. Only the sounds that are not a tap (the news, the result
 * screen, the league shelf) call `playSfx` directly.
 */

export type Sfx =
  | 'buy'
  | 'sell'
  | 'short'
  | 'skill'
  | 'skill_opponent'
  | 'click'
  | 'fail'
  | 'success'
  | 'news'
  | 'swish';

const ALL: readonly Sfx[] = [
  'buy',
  'sell',
  'short',
  'skill',
  'skill_opponent',
  'click',
  'fail',
  'success',
  'news',
  'swish',
];

let ctx: AudioContext | null = null;
const buffers = new Map<Sfx, AudioBuffer>();

const isSfx = (s: string | undefined): s is Sfx => ALL.includes(s as Sfx);

/**
 * Where "sound off" is kept. Exported for the same reason as `LANG_KEY`: it
 * belongs to the device, not to the player, so a deleted account leaves it where
 * it was.
 */
export const SFX_KEY = 'brokerstars.sound';

let muted = false;
try {
  muted = globalThis.localStorage?.getItem(SFX_KEY) === 'off';
} catch {
  /* storage unavailable: sound on, as a fresh install has it */
}

export const sfxMuted = (): boolean => muted;

export function setSfxMuted(next: boolean): void {
  muted = next;
  try {
    globalThis.localStorage?.setItem(SFX_KEY, next ? 'off' : 'on');
  } catch {
    /* the choice holds for this session only */
  }
}

/** Play one sound. Quiet until the file has loaded, and quiet where there is no audio at all. */
export function playSfx(name: Sfx): void {
  const buffer = buffers.get(name);
  if (muted || !ctx || !buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
}

async function load(audio: AudioContext, name: Sfx): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`);
    if (!res.ok) return;
    buffers.set(name, await audio.decodeAudioData(await res.arrayBuffer()));
  } catch {
    // A sound that fails to load is a sound the game goes without.
  }
}

/**
 * Called once, from `main.tsx`. The context starts suspended, because browsers
 * allow no sound before the first gesture. Every touch asks it to resume, and
 * the first one that counts as a gesture on this browser does.
 */
export function installSfx(): void {
  const AC: typeof AudioContext | undefined =
    (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  if (!AC || ctx) return;
  const audio = new AC();
  ctx = audio;
  for (const name of ALL) void load(audio, name);

  const wake = () => {
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  };
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    document.addEventListener(type, wake, { capture: true, passive: true });
  }

  document.addEventListener(
    'click',
    (e) => {
      wake();
      const button = (e.target as Element | null)?.closest?.('button');
      if (!button || button.disabled) return;
      const want = button.dataset.sfx;
      if (want === 'none') return;
      playSfx(isSfx(want) ? want : 'click');
    },
    { capture: true },
  );
}
