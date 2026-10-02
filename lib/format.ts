import { formatLongDate, formatLongDateTime, formatMonthYear as posMonthYear, weekdayLabels as posWeekdayLabels } from './pos-date-format.js';
// All user-facing numeric and date formatting belongs here.
export function numberSymbols(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return { group: parts.find(p => p.type === 'group')?.value || ',', decimal: parts.find(p => p.type === 'decimal')?.value || '.' };
}
export function formatNumber(value: number, locale: string, maximumFractionDigits = 8) {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value) : '—';
}

/** A share or rate as a percentage, using the locale digits and one decimal by default. Unknown values show an em dash. */
/** Pass `minimumFractionDigits` when percentages sit in a column, so "2.0%" lines up under "12.2%". */
export function formatPercent(value: number, locale: string, maximumFractionDigits = 1, minimumFractionDigits = 0) {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale, { minimumFractionDigits, maximumFractionDigits }).format(value) + "%" : "\u2014";
}
export function formatMoney(value: number, currency: string, locale: string, unitPrice = false) {
  if (!Number.isFinite(value)) return '—';
  // Round balances for display only. Unit quotes retain small crypto prices,
  // while neither mode pads whole amounts with unnecessary decimal zeros.
  const displayed = !unitPrice && Math.abs(value) < 0.5 ? 0 : value;
  return trueMinus(new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: unitPrice ? 8 : 0 }).format(displayed));
}
/** Negative amounts always carry a true minus sign (U+2212), never a hyphen, so "−$5" reads the same on every screen. */
function trueMinus(formatted: string) {
  return formatted.replace(/-/g, '\u2212');
}
/** A cash account in a picker: "Wallet · $2,918". The balance tells apart accounts that share a name. */
export function formatAccountOption(account: { name: string; amount: number | string; currency: string }, locale: string) {
  return `${account.name} · ${formatMoney(Number(account.amount), account.currency, locale)}`;
}
/** A whole amount with its direction: "+$1,200" in, "−$13" out (a true minus sign, U+2212), "$0" for nothing. */
export function formatSignedMoney(value: number, currency: string, locale: string) {
  if (!Number.isFinite(value)) return '—';
  const shown = formatMoney(Math.abs(value), currency, locale);
  return Math.abs(value) < 0.5 ? shown : (value > 0 ? '+' : '\u2212') + shown;
}
// Short axis labels ("$1.2M"); tooltips and totals keep formatMoney precision.
export function formatCompactMoney(value: number, currency: string, locale: string) {
  if (!Number.isFinite(value)) return '—';
  // Below a thousand nothing is abbreviated, so the amount stays whole ("$13", never "$12.8").
  return Math.abs(value) < 999.5 ? formatMoney(value, currency, locale) : trueMinus(new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value));
}
/** Monday-first weekday labels for the calendar grid, in the locale's language. */
export function weekdayLabels(locale: string): string[] {
  return posWeekdayLabels(locale);
}
export function formatDate(value: string, locale: string) {
  if (!parseCalendarDate(value)) return '—';
  return formatLongDate(value, locale, '—');
}
export function formatDateTime(value: string, locale: string) {
  return formatLongDateTime(value, locale, '—');
}
// Keep fractional digits and a trailing decimal while typing; never round stored input.
export function formatNumberInput(raw: string, locale: string): { text: string; value: number | null } | null {
  const { group, decimal } = numberSymbols(locale);
  const normalized = raw.split(group).join('').replace(/[\s\u00a0\u202f]/g, '');
  if (normalized === '') return { text: '', value: null };
  const pieces = normalized.split(decimal);
  if (pieces.length > 2 || !/^\d*$/.test(pieces[0]) || (pieces[1] !== undefined && !/^\d*$/.test(pieces[1]))) return null;
  const integer = pieces[0] || '0';
  const value = Number(integer + (pieces.length === 2 ? '.' + pieces[1] : ''));
  if (!Number.isFinite(value)) return null;
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(integer));
  return { text: grouped + (pieces.length === 2 ? decimal + pieces[1] : ''), value };
}
export function numberInputValue(value: number, locale: string, maximumFractionDigits = 20) {
  // Preserve precision by default. An explicit display limit only changes text, never the stored value.
  return new Intl.NumberFormat(locale, { maximumFractionDigits, useGrouping: true }).format(value);
}

// Calendar controls use local dates; serialization never converts them through UTC.
export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}
export function calendarIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function formatMonthYear(value: string, locale: string) {
  const normalized = /^\d{4}-\d{2}$/.test(value) ? value + '-01' : value;
  return parseCalendarDate(normalized) ? posMonthYear(normalized, locale, '—') : '—';
}

export function formatYear(year: number, locale: string) {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 }).format(year);
}

/** A short month name for chart and table columns ("Sep", "сент."). The month is read as a calendar month, independent of timezone. */
export function formatMonthShort(value: string, locale: string) {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return '—';
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
