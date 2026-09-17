import type { CSSProperties } from 'react';
import { categoryHue } from '@/lib/category-colors';
export function CategoryBadge({ kind, label }: { kind: string; label: string }) {
  return <span className="badge category-badge" style={{ '--category-hue': categoryHue(kind) } as CSSProperties}>{label}</span>;
}
