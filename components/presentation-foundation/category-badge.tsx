import type { CSSProperties, ReactNode } from 'react';
import { categoryHue } from '@/lib/category-colors';
import { categoryEmoji } from '@/lib/category-icons';

/** A category label: its emoji and name on a pill in the category's colour. */
export function CategoryBadge({ kind, label, children }: { kind: string; label: string; children?:ReactNode }) {
  const emoji = categoryEmoji(kind);
  return <span className="badge category-badge" style={{ '--category-hue': categoryHue(kind) } as CSSProperties}>{!label.startsWith(emoji) && <span aria-hidden="true">{emoji}</span>}{label}{children}</span>;
}
