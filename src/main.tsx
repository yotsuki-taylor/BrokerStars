import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

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
