// Calendar arithmetic from zar-kebab-pos/src/components/DateRangePicker.jsx.
const CALENDAR_DAY_MS = 86400000;
function calendarDate(value: string) { return new Date(`${value}T00:00:00Z`); }
export function shiftCalendarMonth(monthKey: string, amount: number) {
  const date = calendarDate(`${monthKey}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
export function buildRangeCalendar(monthKey: string) {
  const first = calendarDate(`${monthKey}-01`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - mondayOffset * CALENDAR_DAY_MS;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * CALENDAR_DAY_MS);
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, day: date.getUTCDate(), inMonth: iso.slice(0, 7) === monthKey };
  });
}

// Keep the chosen panel's month while anchoring the two consecutive calendars.
export function calendarYearAnchor(monthKey: string, year: number, panel: 0 | 1) {
  return shiftCalendarMonth(`${String(year).padStart(4, '0')}-${monthKey.slice(5)}`, -panel);
}
// The day the picker opens on: the chosen date, otherwise today kept within min and max.
export function openingCalendarDay(value: string, today: string, min?: string, max?: string) {
  if (value) return value;
  if (min && today < min) return min;
  return max && today > max ? max : today;
}

// Shortcut days beside the calendar. Pickers for future dates keep the default set;
// a start date in the past offers the starts of the month and year instead.
export type DatePreset = 'today' | 'tomorrow' | 'week' | 'month_start' | 'year_start';
export const defaultDatePresets: readonly DatePreset[] = ['today', 'tomorrow', 'week'];
export const pastDatePresets: readonly DatePreset[] = ['today', 'month_start', 'year_start'];
export const datePresetLabels: Record<DatePreset, string> = { today: 'Today', tomorrow: 'Tomorrow', week: 'In one week', month_start: 'Start of this month', year_start: 'Start of this year' };
export function presetDay(preset: DatePreset, today: string) {
  if (preset === 'month_start') return today.slice(0, 7) + '-01';
  if (preset === 'year_start') return today.slice(0, 4) + '-01-01';
  const date = calendarDate(today);
  date.setUTCDate(date.getUTCDate() + (preset === 'tomorrow' ? 1 : preset === 'week' ? 7 : 0));
  return date.toISOString().slice(0, 10);
}
// Presets outside the allowed range are left out rather than shown disabled; duplicates (the 1st of January) show once.
export function availablePresets(presets: readonly DatePreset[], today: string, min?: string, max?: string) {
  const seen = new Set<string>();
  return presets.map(preset => ({ preset, date: presetDay(preset, today) })).filter(({ date }) => (!min || date >= min) && (!max || date <= max) && !seen.has(date) && !!seen.add(date));
}
