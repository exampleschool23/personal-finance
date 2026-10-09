"use client";
import { useEffect, useRef } from 'react';

/** A full-screen stepper puts focus on the current step's heading: when it opens (pass `onOpenAutoFocus` to its dialog) and after every
 * Next or Back, so a screen reader starts at the question rather than the Close button. Attach `ref` to the element holding the step. */
export function useStepFocus<T extends HTMLElement>(step: unknown) {
 const ref = useRef<T>(null), opened = useRef(false);
 const focusHeading = () => {
  const heading = ref.current?.querySelector<HTMLElement>('h1');
  if (!heading) return false;
  heading.tabIndex = -1;
  heading.focus();
  return true;
 };
 useEffect(() => {
  if (!opened.current) { opened.current = true; return; }
  focusHeading();
 }, [step]);
 return { ref, onOpenAutoFocus: (event: Event) => { if (focusHeading()) event.preventDefault(); } };
}
