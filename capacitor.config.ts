import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android build.
 *
 * `appId` is the package name, and it is the one thing here that can never be
 * changed: Google Play keys an app on it for life, so a published app cannot be
 * renamed and a new id is a new app with no reviews and no installs. Change it
 * NOW if it should be something else.
 *
 * `webDir` is the same `dist/` the web build writes, because it is the same
 * build — see `vite.config.ts`, where the only difference between the two is a
 * script tag. The assets are copied into the APK rather than loaded over the
 * network, so the game opens offline and a store release is what ships a change.
 * What still goes over the network is the Worker, and only when the game wants
 * the board, the shop or a duel.
 */
const config: CapacitorConfig = {
  appId: 'com.brokerstars.game',
  appName: 'Broker Stars',
  webDir: 'dist',
  android: {
    // The game paints its own background and draws to the edges; a white flash
    // between the splash and the first frame is the one thing this avoids.
    backgroundColor: '#0B4FA8',
  },
};

export default config;
