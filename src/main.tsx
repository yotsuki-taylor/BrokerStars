import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { platform } from './platform';
import './ui/styles.css';

/**
 * Let the host arrange itself, then draw.
 *
 * Inside Telegram that is full height and a locked swipe-to-close; in a browser
 * tab it is nothing; on Android it is the session read off the disk and the
 * link the app was opened on. The last of those is why this is awaited rather
 * than fired and forgotten — the game reads the launch parameter during its
 * first render, and an invitation that arrives after it is one nobody joins.
 */
async function start(): Promise<void> {
  await platform().ready();
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
