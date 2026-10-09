"use client";
import { useLayoutEffect, useRef } from 'react';
import { columnsFit } from '@/lib/columns-fit';

/** A row list that lines its trailing columns (status, amount, actions) up beside a name switches to two lines only when what is on screen
 * leaves the name narrower than `minName`, not at a fixed width guessed for the widest possible row. Sets `data-layout` to `columns` or
 * `stacked` on the list; its stylesheet lays the rows out for each. Measured before paint, after every render and when the list's width changes. */
export function useColumnsFit<T extends HTMLElement>(rowSelector: string, minName = 240) {
 const ref = useRef<T>(null);
 // One observer per list element, kept across renders; it is replaced only when the list itself is (an empty state swapped for rows).
 const watch = useRef<{ list: T; observer: ResizeObserver; frame: number } | null>(null);
 const measure = useRef(() => {});
 useLayoutEffect(() => {
  const list = ref.current;
  measure.current = () => {
   if (!list) return;
   const rows = [...list.querySelectorAll<HTMLElement>(rowSelector)];
   if (!rows.length) return;
   const style = getComputedStyle(rows[0]);
   const fits = columnsFit({
    available: rows[0].getBoundingClientRect().width,
    minName, gap: parseFloat(style.columnGap) || 0, padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    cells: rows.map(row => [...row.children].slice(1).map(cell => cell.getBoundingClientRect().width)),
   });
   list.dataset.layout = fits ? 'columns' : 'stacked';
  };
  measure.current();
  if (watch.current?.list === list) return;
  stopWatching(watch);
  if (!list || typeof ResizeObserver === 'undefined') return;
  // Only a new width can change the answer; switching layout changes the height, which must not measure again in the same frame.
  let width = list.getBoundingClientRect().width;
  const current = { list, frame: 0, observer: new ResizeObserver(([entry]) => {
   if (entry.contentRect.width === width) return;
   width = entry.contentRect.width;
   cancelAnimationFrame(current.frame); current.frame = requestAnimationFrame(() => measure.current());
  }) };
  current.observer.observe(list);
  watch.current = current;
 });
 useLayoutEffect(() => () => stopWatching(watch), []);
 return ref;
}

function stopWatching(watch: { current: { observer: ResizeObserver; frame: number } | null }) {
 if (!watch.current) return;
 watch.current.observer.disconnect(); cancelAnimationFrame(watch.current.frame);
 watch.current = null;
}
