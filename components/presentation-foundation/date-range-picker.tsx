"use client";
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { MonthCalendar } from '@/components/presentation-foundation/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { calendarYearAnchor, shiftCalendarMonth } from '@/lib/date-picker-calendar';
import { formatDate } from '@/lib/format';

/** Inclusive ISO days. */
export type DateRange = { from: string; to: string };
type Props<P extends string> = {
 /** Names the control for screen readers, such as "Period". */ label: string;
 presets: readonly P[]; presetLabels: Record<P, string>;
 /** The chosen preset, or `custom` for days picked on the calendar. */ preset: P | 'custom';
 /** The days shown: the preset's own days, or the custom range. */ range: DateRange;
 min?: string; max?: string;
 onPreset: (preset: P) => void; onRange: (range: DateRange) => void;
};

/** A period: preset ranges beside the shared POS month calendar, where two clicks pick a custom range.
 *  A preset or the second day applies at once and closes the picker. */
export function DateRangePicker<P extends string>({ label, presets, presetLabels, preset, range, min, max, onPreset, onRange }: Props<P>) {
 const { locale, t } = useLanguage();
 const [open, setOpen] = useState(false);
 // The first day picked, waiting for the second.
 const [start, setStart] = useState('');
 const [month, setMonth] = useState(range.to.slice(0, 7));
 const shown = preset === 'custom' ? `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}` : t(presetLabels[preset]);
 const pick = (date: string) => {
  if (!start) { setStart(date); return; }
  onRange(date < start ? { from: date, to: start } : { from: start, to: date });
  setStart('');
  setOpen(false);
 };
 const choose = (next: P) => { onPreset(next); setStart(''); setOpen(false); };
 return <Popover open={open} onOpenChange={next => { if (next) { setStart(''); setMonth(range.to.slice(0, 7)); } setOpen(next); }}>
  <PopoverTrigger asChild><button type="button" className="date-picker-trigger date-range-trigger" aria-label={t('{label}: {date}', { label, date: shown })}><span>{shown}</span><CalendarDays size={17} aria-hidden="true"/></button></PopoverTrigger>
  <PopoverContent className="finance-date-picker" align="end" collisionPadding={12} aria-label={label}>
   <div className="date-picker-body">
    <div className="date-range-calendar">
     <MonthCalendar monthKey={month} draft={start || range.from} rangeTo={start ? undefined : range.to} min={min} max={max} onSelect={pick}
      onYearChange={year => setMonth(calendarYearAnchor(month, year, 0))} previous={() => setMonth(shiftCalendarMonth(month, -1))} next={() => setMonth(shiftCalendarMonth(month, 1))}/>
     <p className="date-range-status" aria-live="polite">{start ? t('{date} – pick the last day', { date: formatDate(start, locale) }) : t('Pick the first and last day')}</p>
    </div>
    <aside className="date-picker-presets"><strong>{t('Presets')}</strong>{presets.map(item => <Button key={item} type="button" variant="ghost" aria-pressed={item === preset} onClick={() => choose(item)}>{t(presetLabels[item])}</Button>)}</aside>
   </div>
  </PopoverContent>
 </Popover>;
}
