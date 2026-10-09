"use client";
import { PartialTotal } from '@/components/presentation-foundation/partial-total';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { signTone } from '@/components/presentation-foundation/tone';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { AssetCard } from '@/components/presentation-foundation/asset-card';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { Ellipsis, LayoutGrid, List, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssetAccounts } from '@/components/asset-accounts';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/components/language-provider';
import { categoryColor } from '@/lib/category-colors';
import { formatConvertedQuote, formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { assetRecordKinds, interestKinds, unitPricedKinds, value, totalValue, type Entry, type estimatedCashFlow } from '@/lib/finance';
import { sortAssetsByWorth } from '@/lib/asset-sort';
import { isInvestmentRecord } from '@/lib/comparison-profile';
import { marketEntry, type MarketData } from '@/lib/market';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Pagination } from '@/components/presentation-foundation/pagination';

type Props = {
 excludedCurrencies?:string[];
 accounts: HoldingAccount[]; accountsLoading:boolean; accountsError:string; onRetryAccounts:()=>void; onAddHolding:(kind:'Cash'|'Stock'|'Crypto',accountId:string)=>void;
 records: Entry[]; currency: string; market: MarketData | null; netWorth: number; debt: number;
 forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; loading: boolean; demo: boolean;
 onAdd: () => void; onEdit: (entry: Entry) => void; onTrack: (entry: Entry) => void; onDelete: (entry: Entry) => void;
 quoteLabel: (entry: Entry) => string;
};

const assetsPerPage = 12;

export function AssetDashboard({ excludedCurrencies=[], accounts, accountsLoading, accountsError, onRetryAccounts, onAddHolding, records, currency, market, netWorth, debt, loading, demo, onAdd, onEdit, onTrack, onDelete, quoteLabel }: Props) {
 const { t, locale } = useLanguage();
 const [category, setCategory] = useState('all');
 const holdingsRef = useRef<HTMLElement>(null);
 const [layout, setLayout] = useState<'grid' | 'list'>('grid');
 const [assetPage, setAssetPage] = useState(1);
 const holdings = useMemo(() => sortAssetsByWorth(records.filter(record => assetRecordKinds.includes(record.kind) && (record.kind !== 'Cash' || isInvestmentRecord(record))), record => marketEntry(record, currency, market)).map(original => ({ original, converted: marketEntry(original, currency, market) })), [records, currency, market]);
 const total = totalValue(holdings.flatMap(holding => holding.converted ? [holding.converted] : []));
 const categories = assetRecordKinds.map(kind => ({ kind, count: holdings.filter(h => h.original.kind === kind).length, amount: totalValue(holdings.flatMap(holding => holding.converted ? [holding.converted] : []), [kind]) })).filter(group => group.count).sort((a, b) => b.amount - a.amount);
 const groupedIds = new Set(records.filter(record=>accounts.some(account=>account.id===record.holding_account_id&&(record.kind===account.kind||record.kind==='Cash'))).map(record=>record.id));
 const accountRecords = holdings.filter(({original})=>['Cash','Deposit'].includes(original.kind)&&!groupedIds.has(original.id));
 const otherHoldings = holdings.filter(({original})=>!['Cash','Deposit'].includes(original.kind)&&!groupedIds.has(original.id));
 const otherCategories = categories.map(group=>({...group,count:otherHoldings.filter(({original})=>original.kind===group.kind).length})).filter(group=>group.count);
 const filtered = otherHoldings.filter(({ original }) => category === 'all' || original.kind === category);
 // Twelve assets a page; choosing a category starts again at the first page.
 const pageCount = Math.max(1, Math.ceil(filtered.length / assetsPerPage));
 const page = Math.min(assetPage, pageCount);
 const visible = filtered.slice((page - 1) * assetsPerPage, page * assetsPerPage);
 const money = (amount: number, unit = currency) => formatMoney(amount, unit, locale);
 const selectCategory = (kind: string) => { setCategory(kind); setAssetPage(1); };
 // Tapping a row in the allocation list moves the reader down to the filtered assets it now shows.
 const showCategory = (kind: string) => { selectCategory(kind); holdingsRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
 const clearFilters = () => { setCategory('all'); setAssetPage(1); };

 const renderCard = ({ original, converted }: (typeof holdings)[number]) => {
    // Every figure in the display currency; without a rate they read "—" with a note, never under the saved currency.
    const record = converted ?? original;
    const worth = value(record);
    const shown = (amount: number) => converted ? money(amount) : '—';
    // A quote the conversion or a live price changed is a calculation, read to the cent; the person's own keeps its decimals.
    const quote = !converted ? '—' : original.currency === currency && record.amount === original.amount ? formatMoney(record.amount, currency, locale, true) : formatConvertedQuote(record.amount, currency, locale);
    const hasQuote = unitPricedKinds.includes(record.kind);
    const gain = hasQuote && record.cost > 0 ? (record.amount - record.cost) * record.quantity : null;
    const fact = gain !== null ? { label: t('Gain/loss'), value: shown(gain), tone: signTone(gain) }
     : (record.estimated_monthly_income ?? 0) > 0 ? { label: t('Estimated monthly income'), value: shown(record.estimated_monthly_income!) }
     : interestKinds.includes(record.kind) && record.rate > 0 ? { label: t('Annual interest'), value: formatPercent(record.rate, locale, 8) }
     : record.kind === 'Business' ? { label: t('Ownership'), value: formatPercent(record.ownership_percentage ?? 100, locale, 8) }
     : undefined;
    return <AssetCard key={original.id} record={original} label={t(record.kind)} worth={shown(worth)} fact={fact}
     share={converted && total > 0 ? worth / total * 100 : null}
     note={!converted && <small>{t('Exchange rate unavailable.')}</small>}
     menu={<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t('Actions for {name}', { name: original.name })}><Ellipsis size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(original)}>{t('Edit {name}', { name: original.name })}</DropdownMenuItem>{!demo && <DropdownMenuItem onSelect={() => onTrack(original)}>{t('Open Tracker for {name}', { name: original.name })}</DropdownMenuItem>}{!original.history_event_id && <DropdownMenuItem variant="destructive" onSelect={() => onDelete(original)}><Trash2 aria-hidden="true"/>{t('Delete {name}', { name: original.name })}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
     detailsLabel={t(['Cash','Deposit'].includes(original.kind)?'Account details':'Asset details')}
     details={<dl><div><dt>{t('Date / due date')}</dt><dd>{formatDate(original.date, locale)}</dd></div>{record.kind === 'Business' && <div><dt>{t('Ownership')}</dt><dd>{formatPercent(record.ownership_percentage ?? 100, locale, 8)}</dd></div>}{hasQuote && <><div><dt>{t('Quantity')}</dt><dd>{formatNumber(record.quantity, locale)}</dd></div><div><dt>{t('Price per unit')}</dt><dd>{quote}</dd></div><div><dt>{t('Price source')}</dt><dd>{quoteLabel(record)}</dd></div></>}{original.currency !== currency && <div><dt>{t('Saved value')}</dt><dd>{money(value(original), original.currency)}</dd></div>}{original.notes && <div><dt>{t('Notes')}</dt><dd>{original.notes}</dd></div>}</dl>}>
    </AssetCard>;
   };

 return <div className="asset-dashboard" aria-busy={loading}>
  <section className="portfolio-summary" aria-label={t('Your holdings')}>
   <div className="portfolio-summary-main">
    <div className="portfolio-summary-total">
     <h2>{t('Your holdings')}<Count value={holdings.length}/></h2>
     <strong className="portfolio-summary-value">{loading ? '—' : <AnimatedMoney value={total} currency={currency}/>}</strong>
     <PartialTotal currencies={excludedCurrencies}/>
    </div>
    <div className="portfolio-summary-metrics"><div><span>{t('Net worth')}</span><strong>{loading ? '—' : <AnimatedMoney value={netWorth} currency={currency}/>}</strong></div><div><span>{t('Outstanding debt')}</span><strong>{loading ? '—' : <AnimatedMoney value={debt} currency={currency}/>}</strong></div></div>
   </div>
   <div className="portfolio-summary-allocation">
    <h3>{t('Asset allocation')}</h3>
    <div className="allocation-bar" aria-hidden="true">{categories.filter(group=>group.amount>0).map(group=><span key={group.kind} style={{flexGrow:group.amount,background:categoryColor(group.kind)}}/>)}</div>
    <ul className="overview-list">{categories.map(group=><li key={group.kind}><button type="button" className="allocation-option" aria-pressed={category===group.kind} onClick={() => showCategory(group.kind)}><i style={{background:categoryColor(group.kind)}} aria-hidden="true"/><span>{t(group.kind)}</span><strong>{loading ? '—' : <AnimatedMoney value={group.amount} currency={currency}/>}</strong><small>{loading || total<=0 ? '—' : formatPercent(group.amount/total*100,locale,1,1)}</small></button></li>)}</ul>
   </div>
  </section>

  <AssetAccounts accounts={accounts} records={records} market={market} loading={accountsLoading || loading} error={accountsError} onRetry={onRetryAccounts} onAdd={onAddHolding} currency={currency} portfolioTotal={total} accountCount={accountRecords.length} onEdit={onEdit} onTrack={onTrack} demo={demo} >{accountRecords.map(renderCard)}</AssetAccounts>

  <section ref={holdingsRef} className="asset-holdings" aria-label={t('Assets & investments')}>
   <div className="asset-holdings-heading"><h2>{t('Other assets')}<Count value={otherHoldings.length}/></h2><div className="asset-layout-switch" role="group" aria-label={t('Asset layout')}><Button variant="ghost" size="icon" aria-label={t('Card view')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={17}/></Button><Button variant="ghost" size="icon" aria-label={t('Compact view')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18}/></Button></div></div>

   <Segmented className="asset-category-filters" label={t('Filter assets by category')} value={category} onChange={selectCategory} options={[{ value: 'all', label: <>{t('All assets')}<span>{formatNumber(otherHoldings.length, locale, 0)}</span></> }, ...otherCategories.map(group => ({ value: group.kind, label: <><i style={{ '--asset-color': categoryColor(group.kind) } as CSSProperties}/>{t(group.kind)}<span>{formatNumber(group.count, locale, 0)}</span></> }))]}/>
   {category !== 'all' && <p className="asset-result-count" role="status">{t('{shown} of {total} assets', { shown: formatNumber(filtered.length, locale, 0), total: formatNumber(otherHoldings.length, locale, 0) })}<button onClick={clearFilters}>{t('Clear filters')}</button></p>}
   {loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !filtered.length ? <EmptyState icon={<Search size={26}/>} title={t(otherHoldings.length ? 'No matching assets' : 'A fresh start')} description={t(otherHoldings.length ? 'Try another category.' : 'Add your first asset to start building your portfolio.')}><Button variant="outline" onClick={otherHoldings.length ? clearFilters : onAdd}>{t(otherHoldings.length ? 'Clear filters' : 'Add your first record')}</Button></EmptyState> : <div className={'asset-card-grid asset-layout-' + layout}>{visible.map(renderCard)}</div>}
   {!loading && <Pagination label={t('Asset pages')} summary={t('Page {page} of {pages} · {count} records', { page: formatNumber(page, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(filtered.length, locale, 0) })} page={page} pageCount={pageCount} hasNext={page < pageCount} onPage={next => { setAssetPage(next); holdingsRef.current?.scrollIntoView({ block: 'start' }); }}/>}
  </section>
 </div>;
}
