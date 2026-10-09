"use client";
import { createContext, useContext, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { convertAmount } from '@/lib/market';

type Rates = number | Record<string, number> | undefined;
type DisplayCurrency = { currency: string; rates: Rates };

const DisplayCurrencyContext = createContext<DisplayCurrency | null>(null);

/** The display currency picked in the top bar and the market rates that convert into it. The workspace provides it once. */
export function DisplayCurrencyProvider({ currency, rates, children }: DisplayCurrency & { children: ReactNode }) {
 return <DisplayCurrencyContext.Provider value={{ currency, rates }}>{children}</DisplayCurrencyContext.Provider>;
}

/** Every listed amount in the display currency (AGENTS: never a mix of currencies on one screen). `convert` returns
 * null without a usable rate; `show` then reads "—", never the figure under the wrong label. Outside a workspace
 * (component tests, public pages) there is no display currency, so amounts keep their own. */
export function useDisplayMoney() {
 const { locale } = useLanguage();
 const display = useContext(DisplayCurrencyContext);
 const currency = display?.currency;
 const convert = (amount: number, from: string): number | null => display ? convertAmount(amount, from, display.currency, display.rates) : amount;
 /** `unitPrice` keeps a quote's decimals (up to eight), as `formatMoney` does. A quote converted into another currency
  * has no decimals of its own, so it reads to the cent, or four significant digits below one: €635.14, not €635.13676472. */
 const show = (amount: number, from: string, unitPrice = false): string => {
  const value = convert(amount, from);
  if (value === null) return '—';
  const shown = unitPrice && (currency ?? from) !== from ? (Math.abs(value) >= 1 ? Math.round(value * 100) / 100 : Number(value.toPrecision(4))) : value;
  return formatMoney(shown, currency ?? from, locale, unitPrice);
 };
 const showSigned = (amount: number, from: string): string => { const value = convert(amount, from); return value === null ? '—' : formatSignedMoney(value, currency ?? from, locale); };
 /** Amounts in several currencies added in the display currency; null when one of them cannot be converted. */
 const sum = (amounts: readonly { amount: number; currency: string }[]): number | null => {
  if (!display && new Set(amounts.map(row => row.currency)).size > 1) return null;
  let total = 0;
  for (const { amount, currency: from } of amounts) { const value = convert(amount, from); if (value === null) return null; total += value; }
  return total;
 };
 const showSum = (amounts: readonly { amount: number; currency: string }[]): string => {
  const value = sum(amounts);
  return value === null ? '—' : formatMoney(value, currency ?? amounts[0]?.currency ?? 'USD', locale);
 };
 return { currency, convert, show, showSigned, sum, showSum };
}
