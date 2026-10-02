import type { ReactNode } from 'react';

export type StatTone = 'positive' | 'negative';

/** A row of key figures. Tiles share one size and reflow by the width of the content column. */
export function StatTiles({ children, label, columns = 4 }: { children: ReactNode; label?: string; columns?: 3 | 4 | 'auto' }) {
 return <div className="stat-tiles" data-columns={columns} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/** One key figure: a short label, the formatted value, and an optional line of context. */
export function StatTile({ label, value, tone, children }: { label: string; value: ReactNode; tone?: StatTone; children?: ReactNode }) {
 return <article className="stat-tile"><h3>{label}</h3><strong className={tone}>{value}</strong>{children}</article>;
}
