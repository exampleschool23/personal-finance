import type { CSSProperties } from 'react';
import { categoryHues } from '@/lib/category-colors';
import type { Kind } from '@/lib/finance';
export function CategoryBadge({ kind, label }: { kind: Kind; label: string }) {
  return <span className="badge category-badge" style={{ '--category-hue': categoryHues[kind] } as CSSProperties}>{label}</span>;
}
