"use client";
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { formatNumber, formatNumberInput, numberInputValue, numberSymbols } from '@/lib/format';

/** A blank field reads as zero. `requireEntry` is for fields where zero must be typed, never assumed; `onValueChange` reports whether the field is blank.
 * Typing more than `max` fills in `max` and says so below the field (`maxMessage`, or a generic limit), rather than ignoring the keystroke. */
export function FormattedNumberInput({ value, onValueChange, max = 1e15, maxMessage, required = true, requireEntry = false, displayFractionDigits = 20, placeholder = '0', ariaLabel }: { value: number; onValueChange: (value: number, blank: boolean) => void; max?: number; maxMessage?: string; required?: boolean; requireEntry?: boolean; displayFractionDigits?: number; placeholder?: string; ariaLabel?: string }) {
  const { locale, t } = useLanguage();
  const [text, setText] = useState(() => value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits));
  const [exceeded, setExceeded] = useState(false);
  const lastEmitted = useRef(value);
  const previousLocale = useRef(locale);
  const previousDisplayFractionDigits = useRef(displayFractionDigits);
  useEffect(() => {
    if (value !== lastEmitted.current || locale !== previousLocale.current || displayFractionDigits !== previousDisplayFractionDigits.current) setText(value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits));
    lastEmitted.current = value; previousLocale.current = locale; previousDisplayFractionDigits.current = displayFractionDigits;
  }, [value, locale, displayFractionDigits]);
  return <><Input type="text" inputMode="decimal" autoComplete="off" aria-label={ariaLabel} placeholder={placeholder} value={text} required={requireEntry || (required && value !== 0)} onChange={event => {
    const input = event.currentTarget;
    const raw = input.value, cursor = input.selectionStart ?? raw.length;
    const typed = formatNumberInput(raw, locale);
    if (!typed) return;
    const over = typed.value !== null && typed.value > max;
    const parsed = over ? { text: max > 0 ? numberInputValue(max, locale, displayFractionDigits) : '', value: Math.max(0, max) } : typed;
    setExceeded(over);
    const decimal = numberSymbols(locale).decimal;
    const significant = (s: string) => [...s].filter(c => /\d/.test(c) || c === decimal).length;
    const before = significant(raw.slice(0, cursor));
    setText(parsed.text);
    lastEmitted.current = parsed.value ?? 0;
    onValueChange(parsed.value ?? 0, parsed.text === '');
    requestAnimationFrame(() => {
      let position = 0;
      while (position < parsed.text.length && significant(parsed.text.slice(0, position)) < before) position++;
      if (document.activeElement === input) input.setSelectionRange(position, position);
    });
  }} onBlur={() => { if (text !== '') setText(value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits)); }} />
  {exceeded && value === Math.max(0, max) && <small role="alert" className="muted">{maxMessage ?? t('Enter {max} or less', { max: formatNumber(max, locale, Math.min(8, displayFractionDigits)) })}</small>}</>;
}
