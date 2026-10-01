// The interface typeface is an account default kept in `user_preferences.font`,
// so the web app and the mobile app read the same choice. Every entry covers
// Latin and Cyrillic, so English and Russian text look alike.
export const fonts = [
  { id: 'inter', name: 'Inter', family: '"Inter Variable"' },
  { id: 'onest', name: 'Onest', family: '"Onest Variable"' },
] as const;
export type Font = typeof fonts[number]['id'];
export const fontIds = fonts.map(font => font.id) as [Font, ...Font[]];
export const defaultFont: Font = 'inter';
export const isFont = (value: unknown): value is Font => fontIds.includes(value as Font);
/** Anything unknown (older rows, blocked storage, tampered values) falls back to the default. */
export const resolveFont = (value: unknown): Font => isFont(value) ? value : defaultFont;
export const fontStorageKey = 'hoggish-font';
/** Sets the root `data-font` attribute that `app/globals.css` maps to `--font-ui`; `persist` also remembers it for the next visit. */
export function applyFont(font: Font, persist = true, root: { dataset: DOMStringMap } = document.documentElement) {
  root.dataset.font = font;
  if (!persist) return;
  try { localStorage.setItem(fontStorageKey, font); } catch { /* The choice still applies this visit when storage is blocked. */ }
}
/** Runs before hydration so a saved font is on the first paint instead of swapping in after settings load. */
export const fontBootScript = `try{var f=localStorage.getItem(${JSON.stringify(fontStorageKey)});if(${JSON.stringify(fontIds)}.indexOf(f)>-1)document.documentElement.dataset.font=f}catch(e){}`;
