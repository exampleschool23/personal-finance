import type { CSSProperties, ReactNode } from 'react';
import { useCategoryEmoji, useCategoryHue } from '@/components/category-icons-context';

/** A category label: its emoji and name on a pill in the category's colour. `icon` replaces the emoji, as Settings does with its icon picker. */
export function CategoryBadge({ kind, label, icon, children }: { kind: string; label: string; icon?: ReactNode; children?:ReactNode }) {
  const emoji = useCategoryEmoji()(kind); const categoryHue = useCategoryHue();
  return <span className="badge category-badge" style={{ '--category-hue': categoryHue(kind) } as CSSProperties}>{icon ?? (!label.startsWith(emoji) && <span aria-hidden="true">{emoji}</span>)}{label}{children}</span>;
}
