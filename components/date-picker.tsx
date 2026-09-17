"use client";
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildRangeCalendar, shiftCalendarMonth, calendarYearAnchor } from '@/lib/date-picker-calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMonthYear, formatYear, parseCalendarDate, calendarIso } from '@/lib/format';

// Single-date adaptation of zar-kebab-pos/src/components/DateRangePicker.jsx.
export function DatePicker({ value, onChange, min, max, required = true }: { value: string; onChange: (value: string) => void; min?: string; max?: string; required?: boolean }) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseCalendarDate(value) || new Date());
  const [compact, setCompact] = useState(true);
  useEffect(() => { const media = window.matchMedia('(max-width: 720px)'); const update = () => setCompact(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const selectDate = (date: string) => {
    if (date ? !parseCalendarDate(date) || (!!min && date < min) || (!!max && date > max) : required) return;
    onChange(date);
    setOpen(false);
  };
  const preset = (offset: number) => { const day = new Date(); day.setDate(day.getDate() + offset); const iso = calendarIso(day); if (!min || iso >= min) { selectDate(iso); } };
  return <Popover open={open} onOpenChange={next => { if (next) { setMonth(parseCalendarDate(value) || parseCalendarDate(min || '') || new Date()); } setOpen(next); }}>
    <PopoverTrigger asChild><button type="button" className="date-picker-trigger" aria-label={value ? formatDate(value, locale) : t('Select date')}><span>{value ? formatDate(value, locale) : t('Select date')}</span><CalendarDays size={17}/></button></PopoverTrigger>
    <PopoverContent className="finance-date-picker" align="start" collisionPadding={12} aria-label={t('Select date')}>
      <div className="date-picker-body"><MonthCalendar monthKey={calendarIso(month).slice(0, 7)} draft={value} min={min} max={max} onSelect={selectDate} onYearChange={year => setMonth(parseCalendarDate(calendarYearAnchor(calendarIso(month).slice(0, 7), year, 0) + '-01')!)} previous={() => setMonth(parseCalendarDate(shiftCalendarMonth(calendarIso(month).slice(0, 7), -1) + '-01')!)} next={compact ? () => setMonth(parseCalendarDate(shiftCalendarMonth(calendarIso(month).slice(0, 7), 1) + '-01')!) : undefined}/>{!compact && <MonthCalendar monthKey={shiftCalendarMonth(calendarIso(month).slice(0, 7), 1)} draft={value} min={min} max={max} onSelect={selectDate} onYearChange={year => setMonth(parseCalendarDate(calendarYearAnchor(shiftCalendarMonth(calendarIso(month).slice(0, 7), 1), year, 1) + '-01')!)} next={() => setMonth(parseCalendarDate(shiftCalendarMonth(calendarIso(month).slice(0, 7), 1) + '-01')!)}/>}
      <aside className="date-picker-presets"><strong>{t('Presets')}</strong>{[[0,'Today'],[1,'Tomorrow'],[7,'In one week']].map(([offset,label]) => { const day = new Date(); day.setDate(day.getDate() + Number(offset)); return <Button key={label} type="button" variant="ghost" disabled={(!!min && calendarIso(day) < min) || (!!max && calendarIso(day) > max)} onClick={() => preset(Number(offset))}>{t(String(label))}</Button>; })}{!required && <Button type="button" variant="ghost" onClick={() => selectDate('')}>{t('Clear date')}</Button>}</aside></div>
    </PopoverContent>
  </Popover>;
}

// Port of the POS MonthCalendar markup and 42-day, Monday-first grid.
// Radix only handles positioning/focus; no third-party calendar renderer is used.
function MonthCalendar({ monthKey, draft, min, max, onSelect, onYearChange, previous, next }: { monthKey: string; draft: string; min?: string; max?: string; onSelect: (date: string) => void; onYearChange: (year: number) => void; previous?: () => void; next?: () => void }) {
  const { locale, t } = useLanguage();
  const weekdays = locale.startsWith('ru') ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : locale.startsWith('uz') ? ['Du','Se','Ch','Pa','Ju','Sh','Ya'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = calendarIso(new Date());
  const year = Number(monthKey.slice(0, 4));
  const [choosingYear, setChoosingYear] = useState(false);
  const [yearStart, setYearStart] = useState(year - year % 12);
  const yearTrigger = useRef<HTMLButtonElement>(null);
  return <section className="pos-month"><div className="pos-month-heading">
    {choosingYear ? <button type="button" disabled={yearStart <= 12} onClick={() => setYearStart(yearStart - 12)} aria-label={t('Previous years')}><ChevronLeft size={17}/></button> : previous ? <button type="button" onClick={previous} aria-label={t('Previous month')}><ChevronLeft size={17}/></button> : <span/>}
    <button ref={yearTrigger} type="button" className="pos-year-trigger" aria-expanded={choosingYear} aria-label={t('Change year for {month}', { month: formatMonthYear(monthKey, locale) })} onClick={() => { setYearStart(year - year % 12); setChoosingYear(!choosingYear); }}>{choosingYear ? `${formatYear(yearStart, locale)}–${formatYear(yearStart + 11, locale)}` : formatMonthYear(monthKey, locale)}</button>
    {choosingYear ? <button type="button" disabled={yearStart + 23 > 9999} onClick={() => setYearStart(yearStart + 12)} aria-label={t('Next years')}><ChevronRight size={17}/></button> : next ? <button type="button" onClick={next} aria-label={t('Next month')}><ChevronRight size={17}/></button> : <span/>}
  </div>{choosingYear ? <div className="pos-year-grid">{Array.from({ length: 12 }, (_, index) => yearStart + index).map(option => <button type="button" key={option} aria-pressed={option === year} onClick={() => { onYearChange(option); setChoosingYear(false); yearTrigger.current?.focus(); }}>{formatYear(option, locale)}</button>)}</div> : <div className="pos-month-grid" aria-label={formatMonthYear(monthKey, locale)}>
    {weekdays.map(day => <span className="pos-weekday" key={day}>{day}</span>)}
    {buildRangeCalendar(monthKey).map(day => <button key={day.date} type="button" disabled={!day.inMonth || (!!min && day.date < min) || (!!max && day.date > max)} aria-label={formatDate(day.date, locale)} aria-current={day.date === today ? 'date' : undefined} aria-pressed={day.date === draft} className={'pos-day' + (day.date === draft ? ' pos-selected' : day.date === today ? ' pos-today' : '')} onClick={() => onSelect(day.date)} onKeyDown={event => {
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (offset === undefined) return;
      event.preventDefault();
      const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button'));
      const target = buttons[buttons.indexOf(event.currentTarget) + offset];
      if (target && !target.disabled) target.focus();
    }}>{day.day}</button>)}
  </div>}</section>;
}
