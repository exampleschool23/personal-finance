"use client";
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { formatNumberInput, numberInputValue, numberSymbols } from '@/lib/format';

export function FormattedNumberInput({ value, onValueChange, max = 1e15, required = true, displayFractionDigits = 20 }: { value: number; onValueChange: (value: number) => void; max?: number; required?: boolean; displayFractionDigits?: number }) {
  const { locale } = useLanguage();
  const [text, setText] = useState(() => value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits));
  const lastEmitted = useRef(value);
  const previousLocale = useRef(locale);
  const previousDisplayFractionDigits = useRef(displayFractionDigits);
  useEffect(() => {
    if (value !== lastEmitted.current || locale !== previousLocale.current || displayFractionDigits !== previousDisplayFractionDigits.current) setText(value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits));
    lastEmitted.current = value; previousLocale.current = locale; previousDisplayFractionDigits.current = displayFractionDigits;
  }, [value, locale, displayFractionDigits]);
  return <Input type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={text} required={required && value !== 0} onChange={event => {
    const input = event.currentTarget;
    const raw = input.value, cursor = input.selectionStart ?? raw.length;
    const parsed = formatNumberInput(raw, locale);
    if (!parsed || (parsed.value !== null && parsed.value > max)) return;
    const decimal = numberSymbols(locale).decimal;
    const significant = (s: string) => [...s].filter(c => /\d/.test(c) || c === decimal).length;
    const before = significant(raw.slice(0, cursor));
    setText(parsed.text);
    lastEmitted.current = parsed.value ?? 0;
    onValueChange(parsed.value ?? 0);
    requestAnimationFrame(() => {
      let position = 0;
      while (position < parsed.text.length && significant(parsed.text.slice(0, position)) < before) position++;
      if (document.activeElement === input) input.setSelectionRange(position, position);
    });
  }} onBlur={() => { if (text !== '') setText(value === 0 ? '' : numberInputValue(value, locale, displayFractionDigits)); }} />;
}
