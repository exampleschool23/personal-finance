import type { CSSProperties } from 'react';
import { paletteColor } from '@/lib/business';

/** A business at a glance: its logo, or its initial on a tile in its colour. */
export function BusinessMark({ name, color, logo, size = 'md' }: { name: string; color?: string | null; logo?: string | null; size?: 'sm' | 'md' | 'lg' }) {
 const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
 return <span className="business-mark" data-size={size} style={{ '--business-color': paletteColor(color) } as CSSProperties} aria-hidden="true">
  {/* eslint-disable-next-line @next/next/no-img-element -- a small saved data URL, never a remote image */}
  {logo ? <img src={logo} alt=""/> : initial}
 </span>;
}
