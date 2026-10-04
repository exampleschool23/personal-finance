"use client";
import { useMemo } from 'react';
import { ReceiptText } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { niceAxis } from '@/lib/chart-scale';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry } from '@/lib/finance';
import { formatCompactMoney, formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { spendingOnDay, spendingPace, type SpendingItem, type SpendingPacePoint } from '@/lib/spending-pace';
import { monthDays } from '@/lib/calendar-days';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import type { TransactionSplit } from '@/lib/transaction-tools';

/** One day's spending in the chart tooltip: where the money went, largest first. */
function SpentOn({ title, items, currency }: { title: string; items: SpendingItem[]; currency: string }) {
 const { t, locale } = useLanguage();
 return <section><h4>{title}</h4>{items.length ? items.slice(0, 5).map(item => <div className="portfolio-tooltip-row" key={item.id}><CategoryIcon kind={item.kind} size="sm"/><div><strong>{item.name}</strong><span>{t(item.kind)}</span></div><b>{formatMoney(item.amount, currency, locale)}</b></div>) : <p className="portfolio-tooltip-note">{t('Nothing spent on this day.')}</p>}{items.length > 5 && <p className="portfolio-tooltip-note">{t('{count} more', { count: formatNumber(items.length - 5, locale, 0) })}</p>}</section>;
}

type Props = { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData; splits: TransactionSplit[]; snapshots: PortfolioSnapshot[]; currency: string; market: MarketData | null };

/** "Am I spending faster than last month?": this month's running total drawn over last month's, day by day.
 * It reads the same month-scoped records as the Monthly review, so both show the same spending. */
export function SpendingPaceCard({ owner = null, demo = false, revision = 0, data: provided, splits, snapshots, currency, market }: Props) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const remote = useOwnerResource('/api/planning?scope=review&month=' + today.slice(0, 7), owner, !!owner && !demo, revision, emptyPlanning);
 const live = !!owner && !demo;
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 const rates = market?.rates ?? market?.fx?.rate;
 const pace = useMemo(() => spendingPace({ records: data.records, splits, snapshots, activity: data.activity, investmentLinks: data.investmentLinks }, today, currency, rates), [data, splits, snapshots, today, currency, rates]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const axis = niceAxis(pace.points.flatMap(point => [point.current ?? 0, point.previous ?? 0]));
 const difference = pace.spent - pace.previousToDate;
 const loading = !!owner && !demo && remote.loading;
 return <section className="panel overview-panel spending-pace" aria-label={t('Spending')}>
  <PanelTitle title={<>{t('Spending')} <span className="panel-figure">{pace.missing ? '—' : t('{amount} this month', { amount: money(pace.spent) })}</span></>}/>
  {loading ? <ChartSkeleton label={t('Loading records…')}/> : remote.error && owner && !demo ? <InlineError message={t(remote.error)} onRetry={remote.retry}/> : <>
   {pace.empty ? <EmptyState icon={<ReceiptText/>} description={t('No spending recorded this month or last.')}/> : <>
   {!pace.missing && pace.previousToDate + pace.spent > 0 && <p className="spending-pace-delta">{difference > 0 ? t('{amount} more than last month by this day', { amount: money(difference) }) : difference < 0 ? t('{amount} less than last month by this day', { amount: money(-difference) }) : t('Same as last month by this day')}</p>}
   <div className="spending-pace-chart"><ResponsiveContainer width="100%" height={220}>
    <ComposedChart data={pace.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
     <defs><linearGradient id="spending-pace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs>
     <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false}/>
     <XAxis dataKey="day" tickFormatter={day => t('Day {day}', { day: formatNumber(Number(day), locale, 0) })} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} tickMargin={10}/>
     <YAxis width="auto" domain={axis.domain} ticks={axis.ticks} tickFormatter={amount => formatCompactMoney(Number(amount), currency, locale)} axisLine={false} tickLine={false} tickMargin={8}/>
     <Tooltip isAnimationActive={false} wrapperStyle={{ zIndex: 5 }} content={({ active, payload }) => {
      const point = payload?.[0]?.payload as SpendingPacePoint | undefined;
      if (!active || !point) return null;
      const day = (month: string) => `${month}-${String(point.day).padStart(2, '0')}`;
      // A shorter month has no such day, so nothing new was spent on it.
      const items = (month: string) => point.day > monthDays(month) ? [] : spendingOnDay(data.records, day(month), currency, rates);
      return <div className="portfolio-tooltip spending-pace-tooltip">
       <header><span>{t('Day {day}', { day: formatNumber(point.day, locale, 0) })}</span>
        {point.current !== null && <div className="portfolio-tooltip-row"><i className="current"/><div><strong>{t('This month')}</strong></div><b>{money(point.current)}</b></div>}
        <div className="portfolio-tooltip-row"><i className="previous"/><div><strong>{t('Last month')}</strong></div><b>{money(point.previous ?? 0)}</b></div>
       </header>
       <div className="portfolio-tooltip-body">
        {point.current !== null && <SpentOn title={formatDate(day(pace.month), locale)} items={items(pace.month)} currency={currency}/>}
        {point.day <= monthDays(pace.previousMonth) && <SpentOn title={formatDate(day(pace.previousMonth), locale)} items={items(pace.previousMonth)} currency={currency}/>}
       </div>
      </div>;
     }}/>
     <Line type="monotone" dataKey="previous" name="previous" stroke="var(--muted-foreground)" strokeOpacity={.55} strokeWidth={2} dot={false} isAnimationActive={false}/>
     <Area type="monotone" dataKey="current" name="current" stroke="var(--primary)" strokeWidth={2.5} fill="url(#spending-pace-fill)" dot={false} connectNulls={false} animationDuration={700}/>
    </ComposedChart>
   </ResponsiveContainer></div>
   <ul className="spending-pace-legend"><li><i className="current"/>{t('This month')}</li><li><i className="previous"/>{t('Last month')}</li></ul>
   </>}
  </>}
 </section>;
}
