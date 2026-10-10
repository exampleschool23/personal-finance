"use client";
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, moneyTick, monthLabel, monthTick, plannedBar, recordedBar } from '@/components/presentation-foundation/chart';
import { SeriesLegend, toggleKey } from '@/components/presentation-foundation/series-legend';

/** One month: what was recorded and what was scheduled or planned, both in the chart's currency. */
export type HistoryPoint = { month: string; scheduled: number; recorded: number };

/** Month by month, what was recorded (solid) inside the outline of what was scheduled, so a short payment shows an unfilled top.
 * The outline is the scheduled payment by default, or `outline` (Budget's planned amount). */
export function HistoryChart({ points, currency, fill, done, outline }: { points: HistoryPoint[]; currency: string; fill: string; done: string; outline?: string }) {
 const { t, locale } = useLanguage();
 const [hidden, setHidden] = useState<string[]>([]);
 const money = (value: number) => formatMoney(value, currency, locale);
 const planned = outline ?? t('Scheduled payment');
 const names: Record<string, string> = { recorded: done, scheduled: planned };
 return <>
  <div className="portfolio-chart"><ResponsiveContainer width="100%" height={chartHeight.compact}><BarChart data={points} accessibilityLayer margin={chartMargin}>
   <CartesianGrid {...chartGrid}/>
   <XAxis xAxisId="scheduled" dataKey="month" hide/>
   <XAxis xAxisId="recorded" dataKey="month" tickFormatter={monthTick(locale)} minTickGap={16} {...chartAxis}/>
   <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} labelFormatter={monthLabel(locale)} formatter={(amount, name) => [money(Number(amount)), names[String(name)] ?? name]}/>
   {!hidden.includes('scheduled') && <Bar xAxisId="scheduled" dataKey="scheduled" name="scheduled" {...plannedBar}/>}
   {!hidden.includes('recorded') && <Bar xAxisId="recorded" dataKey="recorded" name="recorded" {...recordedBar} fill={fill}/>}
  </BarChart></ResponsiveContainer></div>
  <SeriesLegend items={[{ key: 'recorded', label: done, swatch: <i style={{ background: fill }}/> }, { key: 'scheduled', label: planned, swatch: <i className="chart-planned-key"/> }]} hidden={hidden} onToggle={key => setHidden(previous => toggleKey(previous, key))}/>
 </>;
}
