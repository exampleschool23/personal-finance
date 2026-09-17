"use client";

import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Ellipsis, LayoutGrid, List, Search, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 records: Entry[]; currency: string; market: MarketData | null; netWorth: number; debt: number;
 forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; loading: boolean; demo: boolean;
 onAdd: () => void; onEdit: (entry: Entry) => void; onTrack: (entry: Entry) => void; onDelete: (entry: Entry) => void;
 quoteLabel: (entry: Entry) => string;
};

export function AssetDashboard({ records, currency, market, netWorth, debt, forecast, forecastReady, loading, demo, onAdd, onEdit, onTrack, onDelete, quoteLabel }: Props) {
 const { t, locale } = useLanguage();
 const [query, setQuery] = useState('');
 const [category, setCategory] = useState('all');
 const [layout, setLayout] = useState<'grid' | 'list'>('grid');
 const [limit, setLimit] = useState(12);
 const holdings = useMemo(() => sortAssetsByWorth(records.filter(record => assetRecordKinds.includes(record.kind)), record => marketEntry(record, currency, market)).map(original => ({ original, converted: marketEntry(original, currency, market) })), [records, currency, market]);
 const total = holdings.reduce((sum, holding) => sum + (holding.converted ? value(holding.converted) : 0), 0);
 const categories = assetRecordKinds.map(kind => ({ kind, count: holdings.filter(h => h.original.kind === kind).length, amount: holdings.filter(h => h.original.kind === kind).reduce((sum, h) => sum + (h.converted ? value(h.converted) : 0), 0) })).filter(group => group.count).sort((a, b) => b.amount - a.amount);
 const filtered = holdings.filter(({ original }) => (category === 'all' || original.kind === category) && `${original.name} ${t(original.kind)}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
 const visible = filtered.slice(0, limit);
 const money = (amount: number, unit = currency) => formatMoney(amount, unit, locale);
 const selectCategory = (kind: string) => { setCategory(kind); setLimit(12); };
 const clearFilters = () => { setCategory('all'); setQuery(''); setLimit(12); };

 return <div className="asset-dashboard" aria-busy={loading}>
  <div className="asset-summary-grid">
   <section className="asset-hero" aria-label={t('Your holdings')}>
    <div className="asset-hero-top"><span><Wallet size={18}/>{t('Your holdings')}</span><span className="asset-hero-count">{t('{count} assets', { count: formatNumber(holdings.length, locale, 0) })}</span></div>
    <strong className="asset-hero-value">{loading ? '—' : money(total)}</strong>
    <p>{t('Assets in this view · Lending is tracked in Loans & debts.')}</p>
    <div className="asset-mix" aria-label={t('Asset allocation')}>{categories.filter(group => group.amount > 0).map(group => <button key={group.kind} title={t(group.kind)} aria-label={t('Filter by {category}', { category: t(group.kind) })} onClick={() => selectCategory(group.kind)} style={{ flexGrow: group.amount, background: categoryColor(group.kind) }}/>)}</div>
    <div className="asset-hero-footer"><div><span>{t('NET WORTH')}</span><strong>{money(netWorth)}</strong></div><div><span>{t('Outstanding debt')}</span><strong>{money(debt)}</strong></div></div>
   </section>
   <section className="asset-cashflow">
    <div className="asset-cashflow-title"><span className="asset-cashflow-icon"><ArrowUpRight size={22}/></span><h2>{t('Estimated monthly cash flow')}</h2></div>
    <strong className={'asset-cashflow-value ' + (forecast.forecast >= 0 ? 'positive' : 'negative')}>{forecastReady ? money(forecast.forecast) : '—'}</strong>
    <div className="asset-flow-pair"><div><ArrowDownLeft size={16}/><span>{t('Income')}</span><strong>{money(forecast.plannedIncome)}</strong></div><div><ArrowUpRight size={16}/><span>{t('Expenses')}</span><strong>{forecastReady ? money(forecast.monthlyExpenses + forecast.mortgagePayments) : '—'}</strong></div></div>
    <details className="asset-flow-details"><summary>{t('View cash flow breakdown')}<ChevronDown size={16}/></summary><div><p>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })}</p><p>{t('Other recurring income: {amount}', { amount: money(forecast.otherIncome) })}</p><p>{t('Recurring and planned expenses: {amount}', { amount: forecastReady ? money(forecast.monthlyExpenses) : '—' })}</p><p>{t('Estimated mortgage payments: {amount}', { amount: money(forecast.mortgagePayments) })}</p><p>{t('Includes asset estimates; linked business income counted once.')}</p><p>{t('One-time entries are excluded')}</p></div></details>
   </section>
  </div>

  <section className="asset-holdings" aria-label={t('Assets & investments')}>
   <div className="asset-holdings-heading"><div><h2>{t('Your assets')} <span className="count">{formatNumber(holdings.length, locale, 0)}</span></h2><p>{t('Highest value first. Find an asset, update its value, or follow its progress.')}</p></div><div className="asset-layout-switch" aria-label={t('Asset layout')}><Button variant="ghost" size="icon" aria-label={t('Card view')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={17}/></Button><Button variant="ghost" size="icon" aria-label={t('Compact view')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18}/></Button></div></div>
   <div className="asset-toolbar"><div className="asset-search"><Search size={17} aria-hidden="true"/><Input aria-label={t('Search assets')} placeholder={t('Search assets')} value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }}/>{query && <button type="button" aria-label={t('Clear search')} onClick={() => setQuery('')}><X size={16}/></button>}</div><span className="asset-sort-note"><ArrowDownLeft size={14}/>{t('Highest value first')}</span></div>
   <div className="asset-category-filters" aria-label={t('Filter assets by category')}><button type="button" aria-pressed={category === 'all'} onClick={() => selectCategory('all')}>{t('All assets')}<span>{formatNumber(holdings.length, locale, 0)}</span></button>{categories.map(group => <button key={group.kind} type="button" aria-pressed={category === group.kind} onClick={() => selectCategory(group.kind)} style={{ '--asset-color': categoryColor(group.kind) } as CSSProperties}><i/>{t(group.kind)}<span>{formatNumber(group.count, locale, 0)}</span></button>)}</div>
   <p className="asset-result-count" role="status">{t('{shown} of {total} assets', { shown: formatNumber(Math.min(limit, filtered.length), locale, 0), total: formatNumber(filtered.length, locale, 0) })}{(query || category !== 'all') && <button onClick={clearFilters}>{t('Clear filters')}</button>}</p>
   {loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !filtered.length ? <div className="asset-empty"><Search size={26}/><h3>{t(holdings.length ? 'No matching assets' : 'A fresh start.')}</h3><p>{t(holdings.length ? 'Try another name or category.' : 'Add your first asset to start building your portfolio.')}</p><Button variant="outline" onClick={holdings.length ? clearFilters : onAdd}>{t(holdings.length ? 'Clear filters' : 'Add your first record')}</Button></div> : <div className={'asset-card-grid asset-layout-' + layout}>{visible.map(({ original, converted }) => {
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
     <details className="asset-card-details"><summary>{t('Asset details')}<ChevronDown size={15}/></summary><dl><div><dt>{t('Date / due date')}</dt><dd>{formatDate(original.date, locale)}</dd></div>{record.kind === 'Business' && <div><dt>{t('Ownership')}</dt><dd>{formatNumber(record.ownership_percentage ?? 100, locale)}%</dd></div>}{hasQuote && <><div><dt>{t('Quantity')}</dt><dd>{formatNumber(record.quantity, locale)}</dd></div><div><dt>{t('Price per unit')}</dt><dd>{formatMoney(record.amount, record.currency, locale, true)}</dd></div><div><dt>{t('Price source')}</dt><dd>{quoteLabel(record)}</dd></div></>}{original.currency !== currency && <div><dt>{t('Saved value')}</dt><dd>{money(value(original), original.currency)}</dd></div>}{original.notes && <div><dt>{t('Notes')}</dt><dd>{original.notes}</dd></div>}</dl></details>
     <footer className="asset-card-actions"><Button variant="ghost" onClick={() => onEdit(original)} aria-label={t('Edit {name}', { name: original.name })}>{t('Edit')}</Button>{!demo && <Button variant="outline" onClick={() => onTrack(original)} aria-label={t('Open Tracker for {name}', { name: original.name })}>{t('Tracker')}</Button>}</footer>
    </article>;
   })}</div>}
   {!loading && filtered.length > limit && <div className="asset-load-more"><Button variant="outline" onClick={() => setLimit(previous => previous + 12)}>{t('Show more assets')}<ChevronDown size={16}/></Button></div>}
  </section>
 </div>;
}
