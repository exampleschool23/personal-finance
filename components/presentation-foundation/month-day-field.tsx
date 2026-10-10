"use client";
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { monthDays, withMonthDay } from '@/lib/calendar-days';
import { formatNumber } from '@/lib/format';

/** The day of the month a monthly schedule falls on, chosen from its start month's days. A shorter month falls on its last
 * day. Changing it moves the start date to that day of the same month; a saved schedule's payments follow (migration 141). */
export function MonthDayField({ date, onChange, disabled = false }: { date: string; onChange: (date: string) => void; disabled?: boolean }) {
 const { t, locale } = useLanguage();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
 const days = Array.from({ length: monthDays(date.slice(0, 7)) }, (_, index) => index + 1);
 return <label>{t('Day of the month')}<NativeSelect disabled={disabled} value={String(Number(date.slice(8)))} onChange={event => onChange(withMonthDay(date, Number(event.target.value)))}>
  {days.map(day => <option key={day} value={day}>{formatNumber(day, locale, 0)}</option>)}
 </NativeSelect></label>;
}
