"use client";
import { PartialTotal } from '@/components/partial-total';

import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, Ellipsis, LayoutGrid, List, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssetAccounts } from '@/components/asset-accounts';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { AssetIcon } from '@/components/asset-icon';
import { CategoryBadge } from '@/components/category-badge';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/components/language-provider';
import { categoryColor } from '@/lib/category-colors';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { assetRecordKinds, value, type Entry, type estimatedCashFlow } from '@/lib/finance';
import { sortAssetsByWorth } from '@/lib/asset-sort';
import { marketEntry, type MarketData } from '@/lib/market';

type Props = {
 excludedCurrencies?:string[];
 accounts: HoldingAccount[]; accountsLoading:boolean; accountsError:string; onRetryAccounts:()=>void; onAddHolding:(kind:'Stock'|'Crypto',accountId:string)=>void;
 records: Entry[]; currency: string; market: MarketData | null; netWorth: number; debt: number;
 forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; loading: boolean; demo: boolean;
 onAdd: () => void; onEdit: (entry: Entry) => void; onTrack: (entry: Entry) => void; onDelete: (entry: Entry) => void;
 quoteLabel: (entry: Entry) => string;
};

export function AssetDashboard({ excludedCurrencies=[], accounts, accountsLoading, accountsError, onRetryAccounts, onAddHolding, records, currency, market, netWorth, debt, loading, demo, onAdd, onEdit, onTrack, onDelete, quoteLabel }: Props) {
 const { t, locale } = useLanguage();
 const [category, setCategory] = useState('all');
 const [layout, setLayout] = useState<'grid' | 'list'>('grid');
 const [limit, setLimit] = useState(12);
 const holdings = useMemo(() => sortAssetsByWorth(records.filter(record => assetRecordKinds.includes(record.kind)), record => marketEntry(record, currency, market)).map(original => ({ original, converted: marketEntry(original, currency, market) })), [records, currency, market]);
 const total = holdings.reduce((sum, holding) => sum + (holding.converted ? value(holding.converted) : 0), 0);
 const categories = assetRecordKinds.map(kind => ({ kind, count: holdings.filter(h => h.original.kind === kind).length, amount: holdings.filter(h => h.original.kind === kind).reduce((sum, h) => sum + (h.converted ? value(h.converted) : 0), 0) })).filter(group => group.count).sort((a, b) => b.amount - a.amount);
 const groupedIds = new Set(records.filter(record=>accounts.some(account=>account.id===record.holding_account_id&&(record.kind===account.kind||record.kind==='Cash'))).map(record=>record.id));
 const accountRecords = holdings.filter(({original})=>['Cash','Deposit'].includes(original.kind)&&!groupedIds.has(original.id));
 const otherHoldings = holdings.filter(({original})=>!['Cash','Deposit'].includes(original.kind)&&!groupedIds.has(original.id));
 const otherCategories = categories.map(group=>({...group,count:otherHoldings.filter(({original})=>original.kind===group.kind).length})).filter(group=>group.count);
 const filtered = otherHoldings.filter(({ original }) => category === 'all' || original.kind === category);
 const visible = filtered.slice(0, limit);
 const money = (amount: number, unit = currency) => formatMoney(amount, unit, locale);
 const selectCategory = (kind: string) => { setCategory(kind); setLimit(12); };
 const clearFilters = () => { setCategory('all'); setLimit(12); };

 const renderCard = ({ original, converted }: (typeof holdings)[number]) => {
    const record = converted ?? original;
    const worth = value(record);
    const share = converted && total > 0 ? worth / total * 100 : null;
    const hasQuote = ['Stock', 'Crypto'].includes(record.kind);
    const gain = hasQuote && record.cost > 0 ? (record.amount - record.cost) * record.quantity : null;
    return <article key={original.id} className="asset-card" style={{ '--asset-color': categoryColor(original.kind) } as CSSProperties}>
     <header className="asset-card-header"><AssetIcon record={original}/><div><CategoryBadge kind={record.kind} label={t(record.kind)}/><h3>{original.name}</h3></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t('Actions for {name}', { name: original.name })}><Ellipsis size={20}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(original)}>{t('Edit {name}', { name: original.name })}</DropdownMenuItem>{!original.history_event_id && <DropdownMenuItem className="negative" onSelect={() => onDelete(original)}>{t('Delete {name}', { name: original.name })}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></header>
     <div className="asset-card-worth"><span>{t('Current value')}</span><strong>{money(worth, record.currency)}</strong>{!converted && <small>{t('Saved currency · Conversion unavailable')}</small>}</div>
     <div className="asset-card-insight">{gain !== null ? <><span>{t('Gain/loss')}</span><strong className={gain >= 0 ? 'positive' : 'negative'}>{money(gain, record.currency)}</strong></> : (record.estimated_monthly_income ?? 0) > 0 ? <><span>{t('Estimated monthly income')}</span><strong>{money(record.estimated_monthly_income!, record.currency)}</strong></> : record.kind === 'Deposit' && record.rate > 0 ? <><span>{t('Annual interest')}</span><strong>{formatNumber(record.rate, locale)}%</strong></> : <><span>{record.kind === 'Business' ? t('Ownership') : t('Category')}</span><strong>{record.kind === 'Business' ? formatNumber(record.ownership_percentage ?? 100, locale) + '%' : t(record.kind)}</strong></>}</div>
     <div className="asset-card-share"><span>{t('Share of holdings')}</span><strong>{share === null ? '—' : formatNumber(share, locale, 1) + '%'}</strong><div aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }}/></div></div>
     <details className="asset-card-details"><summary>{t(['Cash','Deposit'].includes(original.kind)?'Account details':'Asset details')}<ChevronDown size={15}/></summary><dl><div><dt>{t('Date / due date')}</dt><dd>{formatDate(original.date, locale)}</dd></div>{record.kind === 'Business' && <div><dt>{t('Ownership')}</dt><dd>{formatNumber(record.ownership_percentage ?? 100, locale)}%</dd></div>}{hasQuote && <><div><dt>{t('Quantity')}</dt><dd>{formatNumber(record.quantity, locale)}</dd></div><div><dt>{t('Price per unit')}</dt><dd>{formatMoney(record.amount, record.currency, locale, true)}</dd></div><div><dt>{t('Price source')}</dt><dd>{quoteLabel(record)}</dd></div></>}{original.currency !== currency && <div><dt>{t('Saved value')}</dt><dd>{money(value(original), original.currency)}</dd></div>}{original.notes && <div><dt>{t('Notes')}</dt><dd>{original.notes}</dd></div>}</dl></details>
     <footer className="asset-card-actions"><Button variant="ghost" onClick={() => onEdit(original)} aria-label={t('Edit {name}', { name: original.name })}>{t('Edit')}</Button>{!demo && <Button variant="outline" onClick={() => onTrack(original)} aria-label={t('Open Tracker for {name}', { name: original.name })}>{t('Tracker')}</Button>}</footer>
    </article>;
   };

 return <div className="asset-dashboard" aria-busy={loading}>
  <section className="portfolio-summary" aria-label={t('Your holdings')}>
   <div className="portfolio-summary-main">
    <div className="portfolio-summary-heading"><span className="portfolio-summary-icon"><Wallet size={21} aria-hidden="true"/></span><h2>{t('Your holdings')}</h2><span className="count">{formatNumber(holdings.length, locale, 0)}</span></div>
    <strong className="portfolio-summary-value">{loading ? '—' : money(total)}</strong>
    <PartialTotal currencies={excludedCurrencies}/>
    <p className="portfolio-summary-caption">{t('Assets in this view · Lending is tracked in Loans & debts.')}</p>
    <div className="portfolio-summary-metrics"><div><span>{t('NET WORTH')}</span><strong>{loading ? '—' : money(netWorth)}</strong></div><div><span>{t('Outstanding debt')}</span><strong>{loading ? '—' : money(debt)}</strong></div></div>
   </div>
   <div className="portfolio-summary-allocation">
    <h3>{t('Asset allocation')}</h3>
    <div className="portfolio-allocation-bar" aria-hidden="true">{categories.filter(group=>group.amount>0).map(group=><span key={group.kind} style={{flexGrow:group.amount,background:categoryColor(group.kind)}}/>)}</div>
    <div className="portfolio-allocation-list">{categories.map(group=><div className="portfolio-allocation-row" key={group.kind}>
     <span className="portfolio-allocation-label"><i style={{background:categoryColor(group.kind)}} aria-hidden="true"/>{t(group.kind)}</span>
     <strong>{loading ? '—' : money(group.amount)}</strong><span className="portfolio-allocation-percent">{loading || total<=0 ? '—' : `${formatNumber(group.amount/total*100,locale,1)}%`}</span>
    </div>)}</div>
   </div>
  </section>

  <AssetAccounts accounts={accounts} records={records} market={market} loading={accountsLoading || loading} error={accountsError} onRetry={onRetryAccounts} onAdd={onAddHolding} currency={currency} portfolioTotal={total} accountCount={accountRecords.length} onEdit={onEdit} onTrack={onTrack} demo={demo} >{accountRecords.map(renderCard)}</AssetAccounts>

  <section className="asset-holdings" aria-label={t('Assets & investments')}>
   <div className="asset-holdings-heading"><div><h2>{t('Other assets')} <span className="count">{formatNumber(otherHoldings.length, locale, 0)}</span></h2></div><div className="asset-layout-switch" aria-label={t('Asset layout')}><Button variant="ghost" size="icon" aria-label={t('Card view')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={17}/></Button><Button variant="ghost" size="icon" aria-label={t('Compact view')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18}/></Button></div></div>

   <div className="asset-category-filters" aria-label={t('Filter assets by category')}><button type="button" aria-pressed={category === 'all'} onClick={() => selectCategory('all')}>{t('All assets')}<span>{formatNumber(otherHoldings.length, locale, 0)}</span></button>{otherCategories.map(group => <button key={group.kind} type="button" aria-pressed={category === group.kind} onClick={() => selectCategory(group.kind)} style={{ '--asset-color': categoryColor(group.kind) } as CSSProperties}><i/>{t(group.kind)}<span>{formatNumber(group.count, locale, 0)}</span></button>)}</div>
   <p className="asset-result-count" role="status">{t('{shown} of {total} assets', { shown: formatNumber(Math.min(limit, filtered.length), locale, 0), total: formatNumber(filtered.length, locale, 0) })}{(category !== 'all') && <button onClick={clearFilters}>{t('Clear filters')}</button>}</p>
   {loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !filtered.length ? <div className="asset-empty"><Search size={26}/><h3>{t(otherHoldings.length ? 'No matching assets' : 'A fresh start.')}</h3><p>{t(otherHoldings.length ? 'Try another category.' : 'Add your first asset to start building your portfolio.')}</p><Button variant="outline" onClick={otherHoldings.length ? clearFilters : onAdd}>{t(otherHoldings.length ? 'Clear filters' : 'Add your first record')}</Button></div> : <div className={'asset-card-grid asset-layout-' + layout}>{visible.map(renderCard)}</div>}
   {!loading && filtered.length > limit && <div className="asset-load-more"><Button variant="outline" onClick={() => setLimit(previous => previous + 12)}>{t('Show more assets')}<ChevronDown size={16}/></Button></div>}
  </section>
 </div>;
}
