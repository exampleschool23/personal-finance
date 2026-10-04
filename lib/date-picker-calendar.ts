// Calendar arithmetic from zar-kebab-pos/src/components/DateRangePicker.jsx.
import { dayMs, dayTime, isoDay, shiftDay, shiftMonth } from './calendar-days';
// Re-exported for components/presentation-foundation/date-picker.tsx, which still imports this name.
export const shiftCalendarMonth = shiftMonth;
export function buildRangeCalendar(monthKey: string) {
  const first = dayTime(`${monthKey}-01`);
  const mondayOffset = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - mondayOffset * dayMs;
  return Array.from({ length: 42 }, (_, index) => {
    const iso = isoDay(start + index * dayMs);
    return { date: iso, day: Number(iso.slice(8)), inMonth: iso.slice(0, 7) === monthKey };
  });
}

// Keep the chosen panel's month while anchoring the two consecutive calendars.
export function calendarYearAnchor(monthKey: string, year: number, panel: 0 | 1) {
  return shiftMonth(`${String(year).padStart(4, '0')}-${monthKey.slice(5)}`, -panel);
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
  return shiftDay(today, preset === 'tomorrow' ? 1 : preset === 'week' ? 7 : 0);
}
// Presets outside the allowed range are left out rather than shown disabled; duplicates (the 1st of January) show once.
export function availablePresets(presets: readonly DatePreset[], today: string, min?: string, max?: string) {
  const seen = new Set<string>();
  return presets.map(preset => ({ preset, date: presetDay(preset, today) })).filter(({ date }) => (!min || date >= min) && (!max || date <= max) && !seen.has(date) && !!seen.add(date));
}
