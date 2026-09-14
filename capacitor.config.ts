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
  plugins: {
    /**
     * Only Google signs anybody into this game, and THIS is the place that
     * decides it -- not `android/gradle.properties`, which for a long time
     * carried the same three `false` values and did nothing at all.
     *
     * Why that failed, because it is not obvious and cost a shipped release:
     * the plugin generates its own `gradle.properties` inside `node_modules`
     * on every `cap sync`, and a subproject's own properties shadow the root
     * project's. So the file in `android/` was being overruled by a generated
     * one that said `true` to everything. The generator reads this block and
     * nothing else (`scripts/configure-dependencies.js`), which makes this the
     * only switch that is actually connected to anything.
     *
     * What it was costing: the Facebook SDK compiled into the APK -- 145
     * classes in `classes.dex` -- and with it `AD_ID` and four Privacy Sandbox
     * advertising permissions in the manifest of a game that shows no ads.
     * The privacy policy said the app asked for one permission and carried no
     * third-party SDK, and both were false.
     *
     * VERIFY THIS RATHER THAN TRUST IT. The flag is two layers away from the
     * APK, so the only honest check is the built package:
     *
     *   aapt dump permissions app-release.apk
     *   unzip -p app-release.apk classes.dex | grep -ac com/facebook
     */
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
  android: {
    // The game paints its own background and draws to the edges; a white flash
    // between the splash and the first frame is the one thing this avoids.
    backgroundColor: '#0B4FA8',
  },
};

export default config;
