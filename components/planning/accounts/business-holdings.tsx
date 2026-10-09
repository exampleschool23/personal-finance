"use client";
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { liabilities, value, type Entry } from '@/lib/finance';
import { marketEntry, type MarketData } from '@/lib/market';

/** A filtered business's other assets and debts, so its whole net assets are in view. */
export function BusinessHoldings({ records, market }: { records: Entry[]; market: MarketData|null }) {
 const { t } = useLanguage();
 const { show } = useDisplayMoney();
 // In the display currency like every list; a debt carries its minus, an amount without a rate reads "—" with a note.
 const rows = records.map(record => { const shown = show(value(marketEntry(record, record.currency, market) ?? record), record.currency); return { record, shown: shown !== '—' && liabilities.includes(record.kind) ? '−' + shown : shown }; });
 return <section className="panel account-business-holdings"><PanelTitle title={t('Other assets and debts')}><Count value={records.length}/></PanelTitle><ul className="overview-list">{rows.map(({record,shown})=><li key={record.id}><CategoryIcon kind={record.kind}/><span>{record.name}<small>{t(record.kind)}</small></span><strong>{shown}</strong></li>)}</ul>{rows.some(row=>row.shown==='—')&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}</section>;
}
