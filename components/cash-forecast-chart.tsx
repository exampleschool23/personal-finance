"use client";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, leadArea, moneyTick, monthTick, referenceLine } from '@/components/presentation-foundation/chart';
import type { ForecastSeries } from '@/lib/cash-forecast';
import { niceAxis } from '@/lib/chart-scale';
import { formatDate, formatMoney } from '@/lib/format';

/** One projected balance over the forecast's days. Its own module, loaded through components/charts-lazy.tsx, so the
 * Overview route, whose Lowest balance card shares components/cash-forecast.tsx, and the landing page at `/` load without the chart library. */
export function ForecastChart({ series }: { series: ForecastSeries }) {
 const { t, locale } = useLanguage();
 const axis = niceAxis(series.points.map(point => point.balance));
 // One tick per month start keeps the axis readable at every horizon.
 const ticks = series.points.filter((point, index) => index === 0 || point.date.endsWith('-01')).map(point => point.date);
 return <div className="forecast-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
  <ComposedChart data={series.points} margin={chartMargin} accessibilityLayer>
   <ChartGradient id="forecast-fill"/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="date" ticks={ticks} tickFormatter={monthTick(locale)} minTickGap={24} {...chartAxis}/>
   <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={moneyTick(series.currency, locale)} {...chartValueAxis}/>
   {axis.domain[0] < 0 && <ReferenceLine y={0} {...referenceLine} stroke="var(--negative)"/>}
   <Tooltip {...chartTooltip} labelFormatter={date => formatDate(String(date), locale)} formatter={amount => [formatMoney(Number(amount), series.currency, locale), t('Projected balance')]}/>
   <Area type="stepAfter" dataKey="balance" {...leadArea('forecast-fill')}/>
  </ComposedChart>
 </ResponsiveContainer></div>;
}
