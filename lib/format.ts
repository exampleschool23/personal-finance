import { formatLongDate, formatLongDateTime, formatMonthYear as posMonthYear } from './pos-date-format.js';
// All user-facing numeric and date formatting belongs here.
export function numberSymbols(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return { group: parts.find(p => p.type === 'group')?.value || ',', decimal: parts.find(p => p.type === 'decimal')?.value || '.' };
}
export function formatNumber(value: number, locale: string, maximumFractionDigits = 8) {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value) : '—';
}
export function formatMoney(value: number, currency: string, locale: string, unitPrice = false) {
  if (!Number.isFinite(value)) return '—';
  // Round balances for display only. Unit quotes retain small crypto prices,
  // while neither mode pads whole amounts with unnecessary decimal zeros.
  const displayed = !unitPrice && Math.abs(value) < 0.5 ? 0 : value;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: unitPrice ? 8 : 0 }).format(displayed);
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
export function numberInputValue(value: number, locale: string) {
  // Expand exponent notation without losing the precision already present in a JS number.
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20, useGrouping: true }).format(value);
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
