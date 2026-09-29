import type { ReactNode } from 'react';

export type SegmentedOption<T> = { value: T; label: ReactNode };

type Props<T> = { label: string; options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; className?: string; as?: 'div' | 'nav' };

/** A switch between views of the same data. The pressed option is announced through aria-pressed. */
export function Segmented<T extends string | number | null>({ label, options, value, onChange, className, as: Tag = 'div' }: Props<T>) {
 return <Tag className={className ? `segmented ${className}` : 'segmented'} role={Tag === 'nav' ? undefined : 'group'} aria-label={label}>
  {options.map(option => <button type="button" key={String(option.value)} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
 </Tag>;
}
