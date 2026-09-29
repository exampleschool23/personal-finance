"use client";
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AssetIcon } from '@/components/asset-icon';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import type { StatTone } from '@/components/stat-tile';
import { toggleAssetDetailsRow } from '@/lib/asset-details';
import { categoryColor } from '@/lib/category-colors';
import { formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';

type Props = {
 record: Pick<Entry, 'kind' | 'name'>; label: string; menu?: ReactNode;
 worth: string; note?: ReactNode; fact?: { label: string; value: string; tone?: StatTone };
 share: number | null; detailsLabel: string; details: ReactNode; children: ReactNode;
};

/** One holding or account: what it is, what it is worth, and its weight in the portfolio. */
export function AssetCard({ record, label, menu, worth, note, fact, share, detailsLabel, details, children }: Props) {
 const { t, locale } = useLanguage();
 return <article className="asset-card" style={{ '--asset-color': categoryColor(record.kind) } as CSSProperties}>
  <header className="asset-card-header"><span className="asset-card-icon"><AssetIcon record={record}/></span><div><h3>{record.name}</h3><CategoryBadge kind={record.kind} label={label}/></div>{menu}</header>
  <div className="asset-card-worth"><span className="sr-only">{t('Current value')}</span><strong>{worth}</strong>{note}</div>
  <dl className="asset-card-facts">
   {fact && <div><dt>{fact.label}</dt><dd className={fact.tone}>{fact.value}</dd></div>}
   <div><dt>{t('Share of holdings')}</dt><dd>{share === null ? '—' : formatNumber(share, locale, 1) + '%'}</dd></div>
  </dl>
  <div className="asset-card-share" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }}/></div>
  <details className="asset-card-details"><summary onClick={toggleAssetDetailsRow}>{detailsLabel}<ChevronDown size={15} aria-hidden="true"/></summary>{details}</details>
  <footer className="asset-card-actions">{children}</footer>
 </article>;
}
