"use client";
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { liabilities, value, type Entry } from '@/lib/finance';
import { marketEntry, type MarketData } from '@/lib/market';

/** A filtered business's other assets and debts, so its whole net assets are in view. */
export function BusinessHoldings({ records, market }: { records: Entry[]; market: MarketData|null }) {
 const { t, locale } = useLanguage();
 return <section className="panel account-business-holdings"><PanelTitle title={t('Other assets and debts')}><Count value={records.length}/></PanelTitle><ul className="overview-list">{records.map(record=>{const priced=marketEntry(record,record.currency,market)??record;return <li key={record.id}><CategoryIcon kind={record.kind}/><span>{record.name}<small>{t(record.kind)}</small></span><strong>{liabilities.includes(record.kind)?'−':''}{formatMoney(value(priced),record.currency,locale)}</strong></li>;})}</ul></section>;
}
