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
