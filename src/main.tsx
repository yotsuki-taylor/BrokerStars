import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { platform } from './platform';
import './ui/styles.css';

// Whatever the host wants doing before anything draws. Inside Telegram that is
// full height and a locked swipe-to-close; in a browser tab it is nothing.
platform().ready();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
