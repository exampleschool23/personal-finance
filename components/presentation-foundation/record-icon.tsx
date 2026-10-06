import type { CSSProperties } from 'react';
import { AssetIcon } from '@/components/presentation-foundation/asset-icon';
import { useCategoryEmoji, useCategoryHue } from '@/components/category-icons-context';
import { assets, type Entry } from '@/lib/finance';

// Holdings keep their drawn, name-aware symbols; income, spending and debts show their category emoji.
export function RecordIcon({ record }: { record: Pick<Entry, 'kind' | 'name'> }) {
 const categoryEmoji = useCategoryEmoji(); const categoryHue = useCategoryHue();
 const holding = assets.includes(record.kind) && record.kind !== 'Money lent';
 return <span className="record-icon category-record-icon" data-emoji={holding ? undefined : ''} style={{ '--category-hue': categoryHue(record.kind) } as CSSProperties} aria-hidden="true">
  {holding ? <AssetIcon record={record} /> : categoryEmoji(record.kind)}
 </span>;
}
