"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartColors, chartGrid, chartHeight, chartLine, chartMargin, chartTooltip, chartValueAxis, leadArea, moneyTick } from '@/components/presentation-foundation/chart';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { monthDays } from '@/lib/calendar-days';
import { niceAxis } from '@/lib/chart-scale';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import { spendingOnDay, type SpendingItem, type SpendingPace, type SpendingPacePoint } from '@/lib/spending-pace';

/** One day's spending in the chart tooltip: where the money went, largest first. */
function SpentOn({ title, items, currency }: { title: string; items: SpendingItem[]; currency: string }) {
 const { t, locale } = useLanguage();
 return <section><h4>{title}</h4>{items.length ? items.slice(0, 5).map(item => <div className="portfolio-tooltip-row" key={item.id}><CategoryIcon kind={item.kind} size="sm"/><div><strong>{item.name}</strong><span>{t(item.kind)}</span></div><b>{formatMoney(item.amount, currency, locale)}</b></div>) : <p className="portfolio-tooltip-note">{t('Nothing spent on this day.')}</p>}{items.length > 5 && <p className="portfolio-tooltip-note">{t('{count} more', { count: formatNumber(items.length - 5, locale, 0) })}</p>}</section>;
}

/** The Spending card's chart: this month's running total over last month's, with where the money went on each day.
 * Its own module, loaded through components/charts-lazy.tsx, so the Overview route and the landing page at `/` load
 * without the chart library. */
export function SpendingPaceChart({ pace, data, currency, rates }: { pace: SpendingPace; data: Pick<PlanningData, 'records' | 'investmentLinks'>; currency: string; rates?: number | Record<string, number> }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const axis = niceAxis(pace.points.flatMap(point => [point.current ?? 0, point.previous ?? 0]));
 return <div className="spending-pace-chart"><ResponsiveContainer width="100%" height={chartHeight.compact}>
  <ComposedChart data={pace.points} margin={chartMargin} accessibilityLayer>
   <ChartGradient id="spending-pace-fill"/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="day" tickFormatter={day => t('Day {day}', { day: formatNumber(Number(day), locale, 0) })} interval="preserveStartEnd" minTickGap={40} {...chartAxis}/>
   <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} wrapperStyle={{ zIndex: 5 }} content={({ active, payload }) => {
    const point = payload?.[0]?.payload as SpendingPacePoint | undefined;
    if (!active || !point) return null;
    const day = (month: string) => `${month}-${String(point.day).padStart(2, '0')}`;
    // A shorter month has no such day, so nothing new was spent on it.
    const items = (month: string) => point.day > monthDays(month) ? [] : spendingOnDay(data.records, day(month), currency, rates, data.investmentLinks);
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
   <Line type="monotone" dataKey="previous" name="previous" {...chartLine} stroke={chartColors.other} strokeOpacity={.55}/>
   <Area type="monotone" dataKey="current" name="current" {...leadArea('spending-pace-fill')} connectNulls={false}/>
  </ComposedChart>
 </ResponsiveContainer></div>;
}
