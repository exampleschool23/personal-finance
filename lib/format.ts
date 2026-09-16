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
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: currency === 'UZS' ? 0 : 2, maximumFractionDigits: unitPrice ? 8 : currency === 'UZS' ? 0 : 2 }).format(value);
}
export function formatDate(value: string, locale: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(date);
}
export function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
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
  const date = parseCalendarDate(value);
  return date ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date) : '—';
}
