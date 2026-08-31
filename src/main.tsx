import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

// The display font is licensed separately and is not committed. Drop
// BD_Cartoon_Shout.ttf into public/fonts/ to get it back; without it the game
// falls back to the stack in styles.css. Declared here rather than in the CSS
// so a missing file is a 404 at runtime, not a build failure.
const fontFace = document.createElement('style');
fontFace.textContent =
  "@font-face{font-family:'BD Cartoon Shout';" +
  `src:url('${import.meta.env.BASE_URL}fonts/BD_Cartoon_Shout.ttf') format('truetype');` +
  'font-display:swap;}';
document.head.appendChild(fontFace);

// Telegram mini app: expand to full height and lock the swipe-to-close gesture.
// Guarded so the game also runs as a plain web page.
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#0B4FA8');
    tg.setBackgroundColor?.('#0B4FA8');
  } catch {
    /* older client, ignore */
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
