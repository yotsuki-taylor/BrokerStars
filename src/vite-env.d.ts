/// <reference types="vite/client" />

/**
 * The build, as `versionName+versionCode` out of `android/app/build.gradle`.
 * Substituted by Vite at build time (`define` in vite.config.ts); an empty
 * string when the file could not be read. Only `src/ui/api.ts` uses it, to put
 * a build number on a bug report.
 */
declare const __BUILD_VERSION__: string;
