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

/** A money figure that counts up from zero when it appears and from its last amount when it changes. An amount that changes mid-count (live prices landing) is picked up by the running count rather than starting a second one. Screen readers and reduced motion get the final amount only. */
export function AnimatedMoney({ value, currency }: { value: number; currency: string }) {
 const { locale } = useLanguage();
 const [shown, setShown] = useState(value);
 const current = useRef(0);
 const target = useRef(value);
 const run = useRef<{ from: number; began: number } | null>(null);
 const frame = useRef(0);
 useLayoutEffect(() => () => { cancelAnimationFrame(frame.current); run.current = null; }, []);
 useLayoutEffect(() => {
  target.current = value;
  if (!Number.isFinite(value) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { cancelAnimationFrame(frame.current); run.current = null; current.current = value; setShown(value); return; }
  if (run.current || current.current === value) return;
  run.current = { from: current.current, began: performance.now() };
  const step = (now: number) => {
   const { from, began } = run.current!;
   const next = countValue(from, target.current, now - began);
   current.current = next;
   setShown(next);
   if (now - began < countDuration) frame.current = requestAnimationFrame(step); else run.current = null;
  };
  setShown(current.current);
  frame.current = requestAnimationFrame(step);
 }, [value]);
 return <span className="animated-number"><span aria-hidden="true">{formatMoney(shown, currency, locale)}</span><span className="sr-only">{formatMoney(value, currency, locale)}</span></span>;
}
