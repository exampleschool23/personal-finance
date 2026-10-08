"use client";
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartAxis, chartColors, chartGrid, chartHeight, chartLegend, chartMargin, chartSankey, chartTooltip, chartValueAxis, groupedBar, monthLabel, monthTick, moneyTick, sankeyLink, sankeyNodeRadius } from '@/components/presentation-foundation/chart';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { cashFlowReport, periodMonths, reportPeriods, sankeyFlows, topShares, otherShareKey, trailingMonths, type ReportPeriod, type Share } from '@/lib/cash-flow-report';
import { hueColor } from '@/lib/category-colors';
import { useCategoryHue } from '@/components/category-icons-context';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry } from '@/lib/finance';
import { formatCompactMoney, formatMoney, formatMonthYear, formatPercent } from '@/lib/format';
import type { MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { measureLabel, sankeyLabelMargins } from '@/lib/sankey-labels';

const periodLabels: Record<ReportPeriod, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };
type Props = { owner: string | null; demo: boolean; revision: number; data: PlanningData; splits: TransactionSplit[]; month: string; currency: string; market: MarketData | null };

/** One side of the breakdown: proportional bars with amount and share, the Income / Expenses panels. The largest ten
 * are named and the rest share one "Other" row, so the rows add up to the total.
 * With `onSelect`, each named bar is a button that narrows the transactions below to it. */
export function ShareBars({ items, label, colorKey, currency, onSelect }: { items: Share[]; label: (key: string) => string; colorKey: (key: string) => string; currency: string; onSelect?: (key: string) => void }) {
 const { t, locale } = useLanguage();
 if (!items.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const shown = topShares(items), peak = Math.max(...shown.map(item => item.amount));
 const name = (key: string) => key === otherShareKey ? t('Other') : label(key);
 return <ul className="share-bars">{shown.map(item => {
  const other = item.key === otherShareKey;
  const bar = <span className="share-bar" style={{ width: `${Math.max(2, item.amount / peak * 100)}%`, background: `color-mix(in srgb, ${other ? 'var(--muted-foreground)' : colorKey(item.key)} 22%, transparent)` }}><span>{name(item.key)}</span></span>;
  return <li key={item.key} title={`${name(item.key)} · ${formatMoney(item.amount, currency, locale)}`}>
   {onSelect && !other ? <button type="button" className="share-bar-button" onClick={() => onSelect(item.key)} aria-label={t('Show transactions for {name}', { name: label(item.key) })}>{bar}</button> : bar}
   <strong>{formatMoney(item.amount, currency, locale)}</strong><small>{formatPercent(item.share * 100, locale)}</small>
  </li>;
 })}</ul>;
}

/** Cash flow: figures for the period, monthly bars, and where money came from and went, as bars or a Sankey diagram. */
export function CashFlowReport({ owner, demo, revision, data: provided, splits, month, currency, market }: Props) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const [period, setPeriod] = useState<ReportPeriod>('month');
 const [grouping, setGrouping] = useState<'category' | 'merchant'>('category');
 const [view, setView] = useState<'bars' | 'sankey'>('bars');
 const series = trailingMonths(month);
 const live = !!owner && !demo;
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${month}&from=${series[0]}`, owner, live, revision, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 const rates = market?.rates ?? market?.fx?.rate;
 const report = useMemo(() => cashFlowReport(data, splits, periodMonths(month, period), currency, today, rates), [data, splits, month, period, currency, today, rates]);
 const trend = useMemo(() => cashFlowReport(data, splits, trailingMonths(month), currency, today, rates).series, [data, splits, month, currency, today, rates]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? t(key);
 const label = grouping === 'category' ? categoryName : (key: string) => key;
 const categoryHue = useCategoryHue();
 const colorKey = (key: string) => grouping === 'category' ? hueColor(categoryHue(data.categories.find(category => category.id === key)?.name ?? key)) : 'var(--foreground)';
 const flows = sankeyFlows(report, categoryName);
 const sankeyLabel = (name: string, value: number) => `${name} · ${formatCompactMoney(value, currency, locale)}`;
 // Each side gets exactly the room its longest label needs.
 const room = sankeyLabelMargins(flows, sankeyLabel, measureLabel);
 if (live && remote.initialLoading) return <section className="panel cash-flow-report"><ChartSkeleton label={t('Loading records…')}/></section>;
 if (live && remote.error) return <section className="panel cash-flow-report"><InlineError message={t(remote.error)} onRetry={remote.retry}/></section>;
 return <section className="cash-flow-report" aria-label={t('Cash flow')}>
  <div className="cash-flow-report-tools">
   <Segmented label={t('Period')} options={reportPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={setPeriod}/>
  </div>
  {/* A single month is already summed up by the review tiles above, so the totals appear only for longer periods. */}
  {period !== 'month' && <StatTiles columns={4} label={t('Cash flow')}>
   <StatTile label={t('Income')} value={money(report.income)} tone={report.income > 0 ? 'positive' : undefined}/>
   <StatTile label={t('Expenses')} value={money(report.expenses)}/>
   <StatTile label={t('Total savings')} value={money(report.savings)} tone={signTone(report.savings)}/>
   <StatTile label={t('Savings rate')} value={report.savingsRate === null ? '—' : formatPercent(report.savingsRate, locale)} tone={report.savingsRate === null ? undefined : signTone(report.savingsRate)}/>
  </StatTiles>}
  <section className="panel">
   <PanelTitle title={t('Income and spending by month')}/>
   <div className="cash-flow-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
    <BarChart data={trend} barGap={2} accessibilityLayer margin={chartMargin}>
     <CartesianGrid {...chartGrid}/>
     <XAxis dataKey="month" tickFormatter={monthTick(locale)} {...chartAxis}/>
     <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
     <Tooltip {...chartTooltip} labelFormatter={monthLabel(locale)} formatter={(value, name) => [money(Number(value)), String(name)]}/>
     <Legend {...chartLegend}/>
     <Bar dataKey="income" name={t('Income')} {...groupedBar} fill={chartColors.income}/>
     <Bar dataKey="expenses" name={t('Expenses')} {...groupedBar} fill={chartColors.expense}/>
    </BarChart>
   </ResponsiveContainer></div>
  </section>
  <section className="panel">
   <PanelTitle title={<>{t('Breakdown')} <span className="panel-figure">{period === 'month' ? formatMonthYear(month, locale) : `${formatMonthYear(periodMonths(month, period)[0], locale)} – ${formatMonthYear(month, locale)}`}</span></>}>
    <div className="cash-flow-switches">
     {view === 'bars' && <Segmented label={t('Group by')} options={[{ value: 'category', label: t('Category') }, { value: 'merchant', label: t('Merchant') }] as const} value={grouping} onChange={setGrouping}/>}
     <Segmented label={t('Chart type')} options={[{ value: 'bars', label: t('Bars') }, { value: 'sankey', label: t('Sankey') }] as const} value={view} onChange={setView}/>
    </div>
   </PanelTitle>
   {view === 'bars' ? <div className="cash-flow-breakdown">
    <div><h3>{t('Income')}</h3><ShareBars items={report[grouping === 'category' ? 'categories' : 'merchants'].income} label={label} colorKey={() => 'var(--positive)'} currency={currency}/></div>
    <div><h3>{t('Expenses')}</h3><ShareBars items={report[grouping === 'category' ? 'categories' : 'merchants'].expense} label={label} colorKey={colorKey} currency={currency}/></div>
   </div> : flows.links.length ? <div className="cash-flow-sankey"><ResponsiveContainer width="100%" height={Math.max(280, flows.nodes.length * 34)}>
    <Sankey data={flows} {...chartSankey} margin={{ top: 8, right: room.right, bottom: 8, left: room.left }} link={sankeyLink} node={({ x, y, width, height, index, payload }: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
     const kind = flows.nodes[index]?.kind;
     const fill = kind === 'income' || kind === 'savings' ? chartColors.income : kind === 'total' ? 'var(--mark-bg)' : chartColors.expense;
     const left = kind === 'income';
     return <g><rect x={x} y={y} width={width} height={Math.max(2, height)} rx={sankeyNodeRadius} fill={fill}/><text x={left ? x - 8 : x + width + 8} y={y + height / 2} dy="0.35em" textAnchor={left ? 'end' : 'start'} className="sankey-label">{sankeyLabel(payload.name, payload.value)}</text></g>;
    }}>
     <Tooltip {...chartTooltip} formatter={value => money(Number(value))}/>
    </Sankey>
   </ResponsiveContainer></div> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
  </section>
 </section>;
}
