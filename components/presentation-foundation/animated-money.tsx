"use client";
import { useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';

export const countDuration = 800;

/** The amount shown `elapsed` ms into a count from `from` to `to`, eased out so it settles gently on `to`. */
export function countValue(from: number, to: number, elapsed: number, duration = countDuration) {
 const progress = Math.min(1, Math.max(0, elapsed / duration));
 return progress >= 1 ? to : from + (to - from) * (1 - (1 - progress) ** 3);
}

/** A money figure that counts up from zero when it appears and from its last amount when it changes. Screen readers and reduced motion get the final amount only. */
export function AnimatedMoney({ value, currency }: { value: number; currency: string }) {
 const { locale } = useLanguage();
 const [shown, setShown] = useState(value);
 const current = useRef(0);
 useLayoutEffect(() => {
  const from = current.current;
  if (from === value || !Number.isFinite(value) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { current.current = value; setShown(value); return; }
  let frame = 0;
  const began = performance.now();
  const step = (now: number) => {
   const next = countValue(from, value, now - began);
   current.current = next;
   setShown(next);
   if (next !== value) frame = requestAnimationFrame(step);
  };
  setShown(from);
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
 }, [value]);
 return <span className="animated-number"><span aria-hidden="true">{formatMoney(shown, currency, locale)}</span><span className="sr-only">{formatMoney(value, currency, locale)}</span></span>;
}
