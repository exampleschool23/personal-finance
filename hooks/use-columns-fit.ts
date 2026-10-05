"use client";
import { useLayoutEffect, useRef } from 'react';
import { columnsFit } from '@/lib/columns-fit';

/** A row list that lines its trailing columns (status, amount, actions) up beside a name switches to two lines only when what is on screen
 * leaves the name narrower than `minName`, not at a fixed width guessed for the widest possible row. Sets `data-layout` to `columns` or
 * `stacked` on the list; its stylesheet lays the rows out for each. Measured before paint, after every render and when the list's width changes. */
export function useColumnsFit<T extends HTMLElement>(rowSelector: string, minName = 240) {
 const ref = useRef<T>(null);
 useLayoutEffect(() => {
  const list = ref.current;
  if (!list) return;
  const measure = () => {
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
  measure();
  if (typeof ResizeObserver === 'undefined') return;
  // Only a new width can change the answer; switching layout changes the height, which must not measure again in the same frame.
  let width = list.getBoundingClientRect().width, frame = 0;
  const observer = new ResizeObserver(([entry]) => {
   if (entry.contentRect.width === width) return;
   width = entry.contentRect.width;
   cancelAnimationFrame(frame); frame = requestAnimationFrame(measure);
  });
  observer.observe(list);
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
 });
 return ref;
}
