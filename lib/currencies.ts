import catalogue from './currencies.json' with { type: 'json' };
// Current ISO 4217 fiat currencies from SIX List One; excludes metals, funds,
// accounting units, and testing codes. See docs/currencies.md for provenance.
export const fiatCurrencies = catalogue;
export const isCurrency = (value: string) => catalogue.some(c => c.code === value);
export { currencyDigits } from './currency-digits.js';
export function currencyLabel(code: string, locale: string) {
  try { return `${code} · ${new Intl.DisplayNames([locale], { type: 'currency' }).of(code) || code}`; }
  catch { return `${code} · ${catalogue.find(c => c.code === code)?.name || code}`; }
}
export type Preferences = { display_name?: string; country?: string; language: 'en' | 'ru' | 'uz'; currencies: string[] };
export const defaultPreferences: Preferences = { language: 'en', currencies: ['USD', 'UZS'] };
