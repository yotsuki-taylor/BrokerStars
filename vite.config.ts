import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const TELEGRAM_SDK = /[ \t]*<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>\r?\n?/;

/**
 * Take Telegram's SDK out of the Android build.
 *
 * Three reasons, and the third is the one that matters. It is a request to
 * telegram.org, which an app that opens offline should not be waiting on. It is
 * a third-party script in an app whose Data Safety form has to say what it
 * talks to. And it defines `Telegram.WebApp` wherever it loads — including in a
 * WebView with no Telegram behind it — which is exactly what `inTelegram()` in
 * src/platform/telegram.ts reads. Leave the tag in and the Android build would
 * pick the Telegram adapter and then find nobody signed in.
 */
function withoutTelegramSdk(android: boolean): Plugin {
  return {
    name: 'broker-stars:strip-telegram-sdk',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!android) return html;
        if (!TELEGRAM_SDK.test(html)) {
          // Fail loudly. A silent no-op here ships an Android build that thinks
          // it is a mini app, and the symptom turns up as a sign-in that never
          // appears rather than as a build error.
          throw new Error(
            'strip-telegram-sdk: the Telegram script tag was not found in index.html — ' +
              'if it was renamed or removed, update the pattern in vite.config.ts',
          );
        }
        return html.replace(TELEGRAM_SDK, '');
      },
    },
  };
}

/**
 * Which build this is, as a person would say it, read out of the one file that
 * is allowed to know.
 *
 * `versionName` lives in `android/app/build.gradle` because Google Play reads
 * it there, and it is the only version number this project keeps. A second copy
 * in `package.json` or in a constant would be a number nobody remembers to move
 * — and it is stale in `package.json` already, which is the proof.
 *
 * It exists in the bundle for one reason: a bug report with no build on it is a
 * bug report nobody can reproduce (`src/ui/api.ts`). The web build carries the
 * same string, which is right — the web and the app ship from one commit.
 *
 * An unreadable file is not a build failure. A missing version makes a report
 * slightly harder to place; a `vite build` that dies because somebody moved a
 * gradle file helps nobody.
 */
function buildVersion(): string {
  try {
    const gradle = readFileSync('android/app/build.gradle', 'utf8');
    const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1] ?? '';
    const code = /versionCode\s+(\d+)/.exec(gradle)?.[1] ?? '';
    return name && code ? `${name}+${code}` : name;
  } catch {
    return '';
  }
}

/**
 * Which build this is comes from Vite's own `--mode`, not from an environment
 * variable: `npm run build:android` passes `--mode android`, and that spelling
 * works the same in PowerShell as it does in a shell, which `VAR=x vite build`
 * does not.
 *
 * One bundle with one difference in it, and the difference is deliberately this
 * small: the game never branches on the target, it asks `src/platform/` who is
 * hosting it and is told at runtime. A build-time flag is needed for exactly
 * one thing — a script tag in the HTML, which no runtime check can undo.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), withoutTelegramSdk(mode === 'android')],
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion()) },
  server: { host: true, port: 5173 },
}));
