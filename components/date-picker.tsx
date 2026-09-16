"use client";
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { enUS, ru, uz } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMonthYear, parseCalendarDate, calendarIso } from '@/lib/format';

// Single-date adaptation of zar-kebab-pos/src/components/DateRangePicker.jsx.
export function DatePicker({ value, onChange, min, required = true }: { value: string; onChange: (value: string) => void; min?: string; required?: boolean }) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState<Date>(() => parseCalendarDate(value) || new Date());
  const [compact, setCompact] = useState(true);
  useEffect(() => { const media = window.matchMedia('(max-width: 720px)'); const update = () => setCompact(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const valid = (!required && !draft) || (!!parseCalendarDate(draft) && (!min || draft >= min));
  const preset = (offset: number) => { const day = new Date(); day.setDate(day.getDate() + offset); const iso = calendarIso(day); if (!min || iso >= min) { setDraft(iso); setMonth(day); } };
  return <Popover open={open} onOpenChange={next => { if (next) { setDraft(value); setMonth(parseCalendarDate(value) || parseCalendarDate(min || '') || new Date()); } setOpen(next); }}>
    <PopoverTrigger asChild><button type="button" className="date-picker-trigger" aria-label={value ? formatDate(value, locale) : t('Select date')} aria-required={required}><span>{value ? formatDate(value, locale) : t('Select date')}</span><CalendarDays size={17}/></button></PopoverTrigger>
    <PopoverContent className="finance-date-picker" align="start" collisionPadding={12} aria-label={t('Select date')}>
      <div className="date-picker-body"><Calendar mode="single" selected={parseCalendarDate(draft)} onSelect={day => setDraft(day ? calendarIso(day) : '')} month={month} onMonthChange={setMonth} numberOfMonths={compact ? 1 : 2} weekStartsOn={1} fixedWeeks locale={locale.startsWith('ru') ? ru : locale.startsWith('uz') ? uz : enUS} disabled={min ? { before: parseCalendarDate(min)! } : undefined} formatters={{ formatCaption: day => formatMonthYear(calendarIso(day), locale), formatMonthDropdown: day => formatMonthYear(calendarIso(day), locale) }} labels={{ labelNext: () => t('Next month'), labelPrevious: () => t('Previous month') }}/>
      <aside className="date-picker-presets"><strong>{t('Presets')}</strong>{[[0,'Today'],[1,'Tomorrow'],[7,'In one week']].map(([offset,label]) => { const day = new Date(); day.setDate(day.getDate() + Number(offset)); return <Button key={label} type="button" variant="ghost" disabled={!!min && calendarIso(day) < min} onClick={() => preset(Number(offset))}>{t(String(label))}</Button>; })}{!required && <Button type="button" variant="ghost" onClick={() => setDraft('')}>{t('Clear date')}</Button>}</aside></div>
      <footer className="date-picker-footer"><span>{draft ? formatDate(draft, locale) : t('No due date')}</span><div><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('Cancel')}</Button><Button type="button" className="primary" disabled={!valid} onClick={() => { onChange(draft); setOpen(false); }}>{t('Apply date')}</Button></div></footer>
    </PopoverContent>
  </Popover>;
}
