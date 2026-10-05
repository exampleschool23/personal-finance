import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RollingText } from '@/components/presentation-foundation/rolling-text';

export type StatTone = 'positive' | 'negative';

/** A row of key figures. Tiles share one size and reflow by the width of the content column. */
export function StatTiles({ children, label, columns = 4 }: { children: ReactNode; label?: string; columns?: 3 | 4 | 'auto' }) {
 return <div className="stat-tiles" data-columns={columns} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/** One key figure: a short label, the formatted value, and an optional line of context. An explanation goes behind the ⓘ as `hint`.
 * A text value rolls its digits into place; pass `rolling={false}` for one that is not a figure, such as a date. */
export function StatTile({ label, value, tone, hint, rolling = true, children }: { label: string; value: ReactNode; tone?: StatTone; hint?: ReactNode; rolling?: boolean; children?: ReactNode }) {
 return <article className="stat-tile"><h3>{label}{hint ? <InfoHint>{hint}</InfoHint> : null}</h3><strong className={tone}>{rolling && typeof value === 'string' ? <RollingText text={value}/> : value}</strong>{children}</article>;
}
