import type { CSSProperties } from 'react';
import { categoryHue } from '@/lib/category-colors';
import { useCategoryEmoji } from '@/components/category-icons-context';

/** A category's emoji on a tile tinted with its stable colour. */
export function CategoryIcon({ kind, size = 'md' }: { kind: string; size?: 'sm' | 'md' }) {
 const categoryEmoji = useCategoryEmoji();
 return <span className="category-icon" data-size={size} style={{ '--category-hue': categoryHue(kind) } as CSSProperties} aria-hidden="true">{categoryEmoji(kind)}</span>;
}
