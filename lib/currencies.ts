import catalogue from './currencies.json' with { type: 'json' };
// Type-only so tests can load this module without a bundler; tests/font-preference.mjs keeps the default in step.
import type { Font } from './fonts';
import type { Language } from './languages';
// Current ISO 4217 fiat currencies from SIX List One; excludes metals, funds,
// accounting units, and testing codes. See docs/currencies.md for provenance.
export const fiatCurrencies = catalogue;
export const isCurrency = (value: string) => catalogue.some(c => c.code === value);
export { currencyDigits } from './currency-digits.js';
export function currencyLabel(code: string, locale: string) {
  try { return `${code} · ${new Intl.DisplayNames([locale], { type: 'currency' }).of(code) || code}`; }
  catch { return `${code} · ${catalogue.find(c => c.code === code)?.name || code}`; }
}
export type Preferences = { display_name?: string; country?: string; language: Language; currencies: string[]; font?: Font; onboarded?: boolean;
  /** The calendar day (Asia/Tashkent) the welcome setup was finished; read-only, never saved from the client. */
  onboarded_on?: string };
// The top bar switches between these; the first is the primary currency.
export const maxPreferredCurrencies = 2;
/** Toggles `code` in the preferred list. Returns why the tap was refused instead of dropping it silently. */
export function togglePreferredCurrency(list: string[], code: string): { currencies: string[] } | { blocked: 'full' | 'last' } {
  if (list.includes(code)) return list.length === 1 ? { blocked: 'last' } : { currencies: list.filter(c => c !== code) };
  return list.length >= maxPreferredCurrencies ? { blocked: 'full' } : { currencies: [...list, code] };
}
/** Swaps `next` in for `old`, keeping its position so the primary stays first. */
export const replacePreferredCurrency = (list: string[], old: string, next: string) => list.map(c => c === old ? next : c);
export const defaultPreferences: Preferences = { language: 'en', currencies: ['USD'], font: 'inter' };
