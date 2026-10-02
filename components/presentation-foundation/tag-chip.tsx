import type { CSSProperties, ReactNode } from 'react';
import { paletteColor } from '@/lib/business';

/** A tag as a small pill in its colour. `children` adds a control, such as a remove button. */
export function TagChip({ name, color, children }: { name: string; color?: string | null; children?: ReactNode }) {
 return <span className="tag-chip" style={{ '--tag-color': paletteColor(color) } as CSSProperties}><span className="tag-chip-dot" aria-hidden="true"/>{name}{children}</span>;
}
