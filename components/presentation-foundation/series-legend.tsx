import type { ReactNode } from 'react';

export type SeriesLegendItem = { key: string; label: ReactNode; swatch: ReactNode };

/** Adds `key` to the list, or removes it when it is already there. */
export const toggleKey = (list: readonly string[], key: string) => list.includes(key) ? list.filter(item => item !== key) : [...list, key];

/** A chart's series legend: each entry shows or hides its series, announced through aria-pressed. */
export function SeriesLegend({ items, hidden, onToggle, className }: { items: readonly SeriesLegendItem[]; hidden: readonly string[]; onToggle: (key: string) => void; className?: string }) {
 return <div className={className ? `comparison-legend ${className}` : 'comparison-legend'}>
  {items.map(item => <button key={item.key} type="button" aria-pressed={!hidden.includes(item.key)} onClick={() => onToggle(item.key)}>{item.swatch}{item.label}</button>)}
 </div>;
}
