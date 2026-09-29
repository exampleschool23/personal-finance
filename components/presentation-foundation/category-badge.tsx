import type { CSSProperties, ReactNode } from 'react';
import { categoryHue } from '@/lib/category-colors';
export function CategoryBadge({ kind, label, children }: { kind: string; label: string; children?:ReactNode }) {
  return <span className="badge category-badge" style={{ '--category-hue': categoryHue(kind) } as CSSProperties}>{label}{children}</span>;
}
