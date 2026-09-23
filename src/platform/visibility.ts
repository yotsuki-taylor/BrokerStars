/**
 * The page going to the background and coming back, as a browser says it.
 *
 * Shared by the two hosts that are a page — a browser tab and a mini app —
 * and not by Android, whose WebView is not told reliably when the app behind it
 * is put away; there the native `pause` and `resume` are the honest signal
 * (`android.ts`).
 */
export function onDocumentVisibility(listener: (visible: boolean) => void): () => void {
  const doc = (globalThis as any).document;
  if (!doc?.addEventListener) return () => {};
  const fire = () => listener(doc.visibilityState !== 'hidden');
  doc.addEventListener('visibilitychange', fire);
  return () => doc.removeEventListener('visibilitychange', fire);
}
