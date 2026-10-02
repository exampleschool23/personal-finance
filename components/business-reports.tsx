"use client";
import { Fragment, useState, type CSSProperties } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from 'recharts';
import type { LinkProps } from 'recharts/types/chart/Sankey';
import { ReceiptText, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ShareBars } from '@/components/cash-flow-report';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Button } from '@/components/ui/button';
import { paletteColor } from '@/lib/business';
import type { BusinessSankey, Drill, Interval, LedgerLine, PnlLine, ProfitAndLoss } from '@/lib/business-report';
import type { Share } from '@/lib/cash-flow-report';
import { categoryColor } from '@/lib/category-colors';
import { formatCompactMoney, formatDate, formatMoney, formatMonthShort, formatMonthYear, formatSignedMoney, formatYear } from '@/lib/format';

/** How a report names things: categories (built-in kinds are translated), the key a category's icon and colour come
 * from (a built-in kind, or an added category's own name), category groups and businesses. */
export type ReportNames = { category: (key: string) => string; icon: (key: string) => string; group: (key: string) => string; business: (id: string | null) => string; businessRecord: (id: string | null) => BusinessOption | undefined };

/** An interval key as a chart label: a short month, a quarter or a year. */
export function useIntervalLabel(interval: Interval, long = false) {
 const { t, locale } = useLanguage();
 return (period: string) => interval === 'month' ? (long ? formatMonthYear(period, locale) : formatMonthShort(period, locale)) : interval === 'year' ? formatYear(Number(period), locale)
  : t('Q{quarter} {year}', { quarter: period.slice(-1), year: formatYear(Number(period.slice(0, 4)), locale) });
}

/** A business's mark beside its name, or the household's. */
export function BusinessName({ id, names }: { id: string | null; names: ReportNames }) {
 const record = names.businessRecord(id);
 return <span className="report-business-name">{record ? <BusinessMark name={record.name} color={record.business_color} logo={record.business_logo} size="sm"/> : <span className="business-mark" data-size="sm" aria-hidden="true">🏠</span>}<span>{names.business(id)}</span></span>;
}

type Breakdown = 'category' | 'group' | 'both';
/** Lines rolled up into their category groups, largest first. */
function grouped(lines: readonly PnlLine[], groupOf: (key: string) => string) {
 const groups = new Map<string, { key: string; amount: number; lines: PnlLine[] }>();
 for (const line of lines) {
  const key = groupOf(line.key), group = groups.get(key) ?? { key, amount: 0, lines: [] };
  group.amount += line.amount; group.lines.push(line); groups.set(key, group);
 }
 return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

/** Profit and loss table: total income (household income and each business's net income, made of gross
 * income less business expenses), household expenses and net cash flow. Hovering a row offers its transactions. */
export function ProfitLossTable({ pnl, breakdown, names, groupOf, currency, onDrill }: { pnl: ProfitAndLoss; breakdown: Breakdown; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const row = (key: string, label: React.ReactNode, amount: number, level: number, drill: Drill | null, kind: 'line' | 'subtotal' | 'total' = 'line', tone?: 'positive' | 'negative') => <tr key={key} data-kind={kind} style={{ '--level': level } as CSSProperties}>
  <th scope="row"><span className="pnl-label">{label}</span>{drill && <button type="button" className="pnl-drill" aria-label={t('Show transactions')} title={t('Show transactions')} onClick={() => onDrill(drill)}><ReceiptText size={14} aria-hidden="true"/></button>}</th>
  <td className={tone}>{tone === 'negative' && amount > 0 ? '−' + money(amount) : money(amount)}</td>
 </tr>;
 const lines = (items: readonly PnlLine[], level: number, base: Drill, prefix: string) => breakdown === 'category'
  ? items.map(item => row(`${prefix}:${item.key}`, <><CategoryIcon kind={names.icon(item.key)} size="sm"/>{names.category(item.key)}</>, item.amount, level, { ...base, category: item.key }))
  : grouped(items, groupOf).flatMap(group => [
   row(`${prefix}:group:${group.key}`, t(group.key), group.amount, level, { ...base, categories: group.lines.map(line => line.key) }, breakdown === 'both' ? 'subtotal' : 'line'),
   ...(breakdown === 'both' ? group.lines.map(item => row(`${prefix}:${group.key}:${item.key}`, <><CategoryIcon kind={names.icon(item.key)} size="sm"/>{names.category(item.key)}</>, item.amount, level + 1, { ...base, category: item.key })) : []),
  ]);
 const household = pnl.household;
 return <div className="table-scroll"><table className="pnl-table">
  <thead><tr><th scope="col">{t('Line item')}</th><th scope="col">{t('Amount')}</th></tr></thead>
  <tbody>
   {row('income', t('Total income'), pnl.totalIncome, 0, { direction: 'income' }, 'total', pnl.totalIncome >= 0 ? undefined : 'negative')}
   {household && <>
    {row('household-income', <BusinessName id={null} names={names}/>, household.incomeTotal, 1, { direction: 'income', business: null }, 'subtotal')}
    {lines(household.income, 2, { direction: 'income', business: null }, 'hi')}
   </>}
   {pnl.businesses.map(business => <Fragment key={business.id}>
    {row(`b:${business.id}`, <><BusinessName id={business.id} names={names}/><small>{t('Net income')}</small></>, business.net, 1, { business: business.id }, 'subtotal', business.net < 0 ? 'negative' : undefined)}
    {row(`b:${business.id}:gross`, t('Gross business income'), business.grossIncome, 2, { direction: 'income', business: business.id }, 'subtotal')}
    {lines(business.income, 3, { direction: 'income', business: business.id }, `b:${business.id}:i`)}
    {row(`b:${business.id}:expenses`, t('Business expenses'), business.totalExpenses, 2, { direction: 'expense', business: business.id }, 'subtotal')}
    {lines(business.expenses, 3, { direction: 'expense', business: business.id }, `b:${business.id}:e`)}
   </Fragment>)}
   {household && <>
    {row('household-expenses', t('Household expenses'), household.expenseTotal, 0, { direction: 'expense', business: null }, 'total')}
    {lines(household.expenses, 1, { direction: 'expense', business: null }, 'he')}
   </>}
   {row('net', t(household ? 'Net cash flow' : 'Net income'), pnl.net, 0, null, 'total', pnl.net < 0 ? 'negative' : 'positive')}
  </tbody>
 </table></div>;
}

/** The Sankey diagram with a layer for each business. Clicking a flow or a label narrows the transactions below. */
export function BusinessSankeyChart({ data, currency, onDrill }: { data: BusinessSankey; currency: string; onDrill: (drill: Drill) => void }) {
 const { t, locale } = useLanguage();
 if (!data.links.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const fill = (kind: BusinessSankey['nodes'][number]['kind']) => kind === 'income' || kind === 'savings' ? 'var(--positive)' : kind === 'total' ? 'var(--mark-bg)' : kind === 'business' ? 'var(--caution)' : kind === 'loss' ? 'var(--negative)' : 'color-mix(in srgb, var(--foreground) 55%, transparent)';
 const drillOf = (index: number) => data.nodes[index]?.drill;
 const columns = new Set(data.nodes.map(node => node.kind)).size;
 return <div className="cash-flow-sankey"><ResponsiveContainer width="100%" minWidth={columns > 3 ? 720 : 480} height={Math.max(300, data.nodes.length * 30)}>
  <Sankey data={data} nodePadding={16} nodeWidth={10} margin={{ top: 8, right: 220, bottom: 8, left: 150 }}
   link={({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index }: LinkProps) => {
    const link = data.links[index], drill = link && (drillOf(link.target) ?? drillOf(link.source));
    return <path className="sankey-link" d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} strokeWidth={Math.max(1, linkWidth)} onClick={drill ? () => onDrill(drill) : undefined} data-clickable={!!drill || undefined}/>;
   }}
   node={({ x, y, width, height, index, payload }: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
    const node = data.nodes[index], left = !data.links.some(link => link.target === index);
    const drill = node?.drill;
    return <g className="sankey-node" onClick={drill ? () => onDrill(drill) : undefined} data-clickable={!!drill || undefined}>
     <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={3} fill={fill(node?.kind ?? 'expense')}/>
     <text x={left ? x - 8 : x + width + 8} y={y + height / 2} dy="0.35em" textAnchor={left ? 'end' : 'start'} className="sankey-label">{payload.name} · {formatCompactMoney(payload.value, currency, locale)}</text>
    </g>;
   }}>
   <Tooltip formatter={value => formatMoney(Number(value), currency, locale)}/>
  </Sankey>
 </ResponsiveContainer></div>;
}

/** Bars over time: one series per key, side by side or stacked. Clicking a legend entry hides or shows its series. */
export function TrendChart({ rows, series, stacked, interval, currency }: { rows: Array<Record<string, number | string>>; series: Array<{ key: string; label: string; color: string }>; stacked: boolean; interval: Interval; currency: string }) {
 const { locale } = useLanguage();
 const [hidden, setHidden] = useState<string[]>([]);
 const label = useIntervalLabel(interval), longLabel = useIntervalLabel(interval, true);
 return <div className="cash-flow-chart"><ResponsiveContainer width="100%" height={280}>
  <BarChart data={rows} barGap={2} accessibilityLayer margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
   <CartesianGrid stroke="var(--border)" strokeOpacity={.6} strokeDasharray="2 6" vertical={false}/>
   <XAxis dataKey="period" tickFormatter={value => label(String(value))} axisLine={false} tickLine={false} tickMargin={10}/>
   <YAxis width="auto" tickFormatter={value => formatCompactMoney(Number(value), currency, locale)} axisLine={false} tickLine={false} tickMargin={8}/>
   <Tooltip cursor={{ fill: 'var(--accent)', fillOpacity: .45 }} labelFormatter={value => longLabel(String(value))} formatter={(value, name) => [formatMoney(Number(value), currency, locale), String(name)]}/>
   <Legend iconType="circle" iconSize={8} onClick={entry => { const key = String((entry as { dataKey?: unknown }).dataKey ?? ''); setHidden(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key]); }} formatter={(value, entry) => <span className="trend-legend" data-hidden={hidden.includes(String((entry as { dataKey?: unknown }).dataKey)) || undefined}>{value}</span>}/>
   {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} hide={hidden.includes(item.key)} stackId={stacked ? 'total' : undefined} fill={item.color} radius={stacked ? (index === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]} maxBarSize={stacked ? 28 : 18}/>)}
  </BarChart>
 </ResponsiveContainer></div>;
}

/** A breakdown as a donut with its legend beside it; clicking a slice or a legend row narrows the transactions. */
export function BreakdownDonut({ items, label, colorOf, currency, onSelect }: { items: Share[]; label: (key: string) => string; colorOf: (key: string) => string; currency: string; onSelect: (key: string) => void }) {
 const { t, locale } = useLanguage();
 if (!items.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const top = items.slice(0, 10);
 return <div className="breakdown-donut">
  <ResponsiveContainer width="100%" height={240}><PieChart>
   <Pie data={top} dataKey="amount" nameKey="key" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="var(--card)" onClick={entry => { const key = (entry.payload as Share | undefined)?.key; if (key) onSelect(key); }}>
    {top.map(item => <Cell key={item.key} fill={colorOf(item.key)} className="donut-slice"/>)}
   </Pie>
   <Tooltip formatter={(value, name) => [formatMoney(Number(value), currency, locale), label(String(name))]}/>
  </PieChart></ResponsiveContainer>
  <ShareBars items={top} label={label} colorKey={colorOf} currency={currency} limit={10} onSelect={onSelect}/>
 </div>;
}

/** The colour of a breakdown key: a business's own colour, a category's stable colour, otherwise the ink colour. */
export function attributeColor(attribute: 'category' | 'group' | 'merchant' | 'business', key: string, names: ReportNames) {
 if (attribute === 'business') return paletteColor(names.businessRecord(key === 'household' ? null : key)?.business_color ?? (key === 'household' ? 'slate' : null));
 if (attribute === 'category') return categoryColor(names.icon(key));
 if (attribute === 'group') return categoryColor(key);
 return 'var(--foreground)';
}

/** The transactions behind a report, narrowed by the last click on a chart or table. */
export function ReportTransactions({ lines, drill, label, names, currency, onClear }: { lines: readonly LedgerLine[]; drill: Drill | null; label: string | null; names: ReportNames; currency: string; onClear: () => void }) {
 const { t, locale } = useLanguage();
 const [limit, setLimit] = useState(25);
 return <section className="panel report-transactions" aria-label={t('Transactions')}>
  <div className="report-transactions-heading"><h2>{t('Transactions')}</h2>{drill && label && <span className="report-drill">{label}<button type="button" aria-label={t('Clear filter')} onClick={onClear}><X size={14} aria-hidden="true"/></button></span>}<span className="muted">{t('{count} transactions', { count: lines.length })}</span></div>
  {lines.length ? <ul className="report-transaction-list">{lines.slice(0, limit).map(line => <li key={line.id}>
   <CategoryIcon kind={names.icon(line.category)} size="sm"/>
   <span><strong>{line.name}</strong><small>{formatDate(line.date, locale)} · {names.category(line.category)}</small></span>
   <BusinessName id={line.business} names={names}/>
   <strong className={line.direction === 'income' ? 'positive' : undefined}>{formatSignedMoney(line.direction === 'income' ? line.amount : -line.amount, currency, locale)}</strong>
  </li>)}</ul> : <EmptyState icon={<ReceiptText/>} description={t('Nothing recorded in this period.')}/>}
  {lines.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 50)}>{t('Show more')}</Button>}
 </section>;
}
