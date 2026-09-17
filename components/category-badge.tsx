import type { CSSProperties } from 'react';
import { categoryHues } from '@/lib/category-colors';
import type { CategoryKind } from '@/lib/category-colors';
export function CategoryBadge({ kind, label }: { kind: CategoryKind; label: string }) {
  return <span className="badge category-badge" style={{ '--category-hue': categoryHues[kind] } as CSSProperties}>{label}</span>;
}
