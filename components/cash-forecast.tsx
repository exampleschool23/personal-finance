"use client";
import { Fragment, useMemo, useState } from 'react';
import { CalendarCheck, TriangleAlert, Wallet, X } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, leadArea, moneyTick, monthTick, referenceLine } from '@/components/presentation-foundation/chart';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cashForecast, forecastHorizons, readAdjustments, type CashForecast, type ForecastAdjustment, type ForecastEvent, type ForecastHorizon, type ForecastSeries } from '@/lib/cash-forecast';
import { niceAxis } from '@/lib/chart-scale';
import { depositToday } from '@/lib/deposit-interest';
import type { ExpensePlan } from '@/lib/expense-plans';
import { formatDate, formatMoney, formatMonthYear, formatNumber, formatSignedMoney } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import { RollingText } from '@/components/presentation-foundation/rolling-text';

type Rates = number | Record<string, number> | undefined;
type Props = { owner?: string | null; data: PlanningData; plans: readonly ExpensePlan[]; plansMonth?: string; currency: string; rates: Rates; loading: boolean; error: string; onRetry: () => void };

const storageKey = (owner?: string | null) => 'hoggish-forecast-adjustments:' + (owner ?? 'demo');
function storedAdjustments(owner?: string | null) {
 try { return readAdjustments(JSON.parse(localStorage.getItem(storageKey(owner)) ?? '[]')); } catch { return []; }
}

/** The name of a projected series: an account's own name, or total cash (with its currency when totals are kept apart). */
function useSeriesName() {
 const { t } = useLanguage();
 return (series: ForecastSeries, forecast: CashForecast) => series.accountId ? series.name : forecast.totals.length > 1 ? t('Total cash · {currency}', { currency: series.currency }) : t('Total cash');
}

/** Accounts and totals projected to dip below zero, each with the first day it happens. */
function BelowZeroWarning({ forecast }: { forecast: CashForecast }) {
 const { t, locale } = useLanguage();
 const name = useSeriesName();
 if (!forecast.belowZero.length) return null;
 return <div className="forecast-warning" role="status">
  <TriangleAlert aria-hidden="true"/>
  <div>
   <strong>{t('Projected to go below zero')}<InfoHint>{t('Move money or reduce spending before that day to avoid an overdraft.')}</InfoHint></strong>
   <ul>{forecast.belowZero.map(series => <li key={series.id}>{t('{name} goes below zero on {date}', { name: name(series, forecast), date: formatDate(series.belowZero!, locale) })}</li>)}</ul>
  </div>
 </div>;
}

/** The Forecast view of Cash flow: projected cash day by day, the lowest point, what drives it, and temporary what-ifs. */
export function CashForecastView({ owner, data, plans, plansMonth, currency, rates, loading, error, onRetry }: Props) {
 const { t, locale } = useLanguage();
 const name = useSeriesName();
 const today = depositToday();
 const [days, setDays] = useState<ForecastHorizon>(90);
 const [selected, setSelected] = useState('');
 const [adjustments, setAdjustments] = useState<ForecastAdjustment[]>(() => storedAdjustments(owner));
 const change = (next: ForecastAdjustment[]) => {
  setAdjustments(next);
  try { localStorage.setItem(storageKey(owner), JSON.stringify(next)); } catch { /* What-ifs still work for this visit when storage is blocked. */ }
 };
 const forecast = useMemo(() => cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, plans, plansMonth, adjustments, today, days, currency, rates }), [data, plans, plansMonth, adjustments, today, days, currency, rates]);
 const options = [...forecast.totals, ...forecast.accounts];
 const shown = options.find(series => series.id === selected) ?? forecast.totals[0];
 const accountNames = new Map(forecast.accounts.map(account => [account.id, account.name]));
 if (loading) return <PanelSkeleton label={t('Loading records…')} rows={3}/>;
 if (error) return <InlineError as="div" message={t(error)} onRetry={onRetry}/>;
 const money = (amount: number, code = shown?.currency ?? currency) => formatMoney(amount, code, locale);
 const horizon = <Segmented label={t('Forecast horizon')} options={forecastHorizons.map(value => ({ value, label: t('{count} days', { count: formatNumber(value, locale, 0) }) }))} value={days} onChange={setDays}/>;
 return <>
  <section className="panel forecast-panel" aria-labelledby="forecast-title">
   <PanelTitle title={<span id="forecast-title">{t('Projected cash')}</span>} hint={t('Starts from today’s cash balances and adds scheduled income and bills, monthly loan payments, money owed to you, maturing deposits and expense plan allowances. Items without a cash account change total cash only. Overdue items are left out.')}>{horizon}</PanelTitle>
   {!shown ? <EmptyState icon={<Wallet aria-hidden="true"/>} description={t('Add a cash account to forecast its balance.')}/> : <>
    {options.length > 1 && <NativeSelect className="forecast-series" aria-label={t('Balance to show')} value={shown.id} onChange={event => setSelected(event.target.value)}>
     {options.map(series => <option key={series.id} value={series.id}>{name(series, forecast)}{series.accountId ? ' · ' + series.currency : ''}</option>)}
    </NativeSelect>}
    <StatTiles columns={3} label={name(shown, forecast)}>
     <StatTile label={t('Cash today')} value={money(shown.start)}/>
     <StatTile label={t('Lowest balance')} value={money(shown.lowest.balance)} tone={signTone(shown.lowest.balance, true)}><p>{formatDate(shown.lowest.date, locale)}</p></StatTile>
     <StatTile label={t('In {count} days', { count: formatNumber(days, locale, 0) })} value={money(shown.end)} tone={signTone(shown.end, true)}><p>{formatSignedMoney(shown.end - shown.start, shown.currency, locale)}</p></StatTile>
    </StatTiles>
    <BelowZeroWarning forecast={forecast}/>
    <ForecastChart series={shown}/>
   </>}
  </section>
  <WhatIfPanel adjustments={adjustments} currency={currency} today={today} onChange={change}/>
  <section className="panel upcoming-section forecast-events" aria-labelledby="forecast-events">
   <header className="upcoming-section-heading"><h2 id="forecast-events">{t('Cash movements ahead')}<Count value={forecast.events.length}/></h2></header>
   {forecast.months.length ? <div className="table-scroll"><table>
    <thead><tr><th>{t('Name')}</th><th>{t('Date')}</th><th>{t('Amount')}</th></tr></thead>
    <tbody>{forecast.months.map(month => <Fragment key={month.month}>
     <tr className="table-group-row"><th colSpan={3}><div className="table-group-label"><span>{formatMonthYear(month.month, locale)}</span><span className="forecast-month-total">{month.totals.map(total => formatSignedMoney(total.amount, total.currency, locale)).join(' · ')}</span></div></th></tr>
     {month.events.map(event => <EventRow key={event.key} event={event} account={event.accountId ? accountNames.get(event.accountId) : undefined}/>)}
    </Fragment>)}</tbody>
   </table></div> : <EmptyState icon={<CalendarCheck aria-hidden="true"/>} description={t('No scheduled cash movements in this period.')}/>}
  </section>
 </>;
}

function EventRow({ event, account }: { event: ForecastEvent; account?: string }) {
 const { t, locale } = useLanguage();
 const source = event.source === 'installment' ? t('Monthly payment') : event.source === 'repayment' ? t('Repayment') : event.source === 'plan' ? t('Monthly expense plan') : event.source === 'adjustment' ? t('What-if change') : t(event.kind);
 return <tr>
  <td><div className="record-name"><CategoryIcon kind={event.kind}/><div><strong>{event.name || t('What-if change')}</strong><small>{account ? source + ' · ' + account : source}</small></div></div></td>
  <td className="muted">{formatDate(event.date, locale)}</td>
  <td className={event.amount > 0 ? 'amount positive' : 'amount'}>{formatSignedMoney(event.amount, event.currency, locale)}</td>
 </tr>;
}

function ForecastChart({ series }: { series: ForecastSeries }) {
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

/** Temporary changes ("−500 every month from June") that update the projection at once. They stay in this browser and never touch records. */
function WhatIfPanel({ adjustments, currency, today, onChange }: { adjustments: ForecastAdjustment[]; currency: string; today: string; onChange: (next: ForecastAdjustment[]) => void }) {
 const { t, locale } = useLanguage();
 const [label, setLabel] = useState('');
 const [direction, setDirection] = useState<'out' | 'in'>('out');
 const [amount, setAmount] = useState(0);
 const [frequency, setFrequency] = useState<ForecastAdjustment['frequency']>('Monthly');
 const [date, setDate] = useState(today);
 const add = () => {
  if (!(amount > 0) || !date) return;
  onChange([...adjustments, { id: crypto.randomUUID(), name: label.trim(), amount: direction === 'out' ? -amount : amount, frequency, date }]);
  setLabel(''); setAmount(0);
 };
 return <section className="panel forecast-what-if" aria-labelledby="forecast-what-if">
  <PanelTitle title={<span id="forecast-what-if">{t('What if')}</span>} count={adjustments.length > 0 ? <Count value={adjustments.length}/> : undefined} hint={t('Try a one-off or monthly change. It changes only this forecast and stays in this browser.')}/>
  <form className="forecast-what-if-form" onSubmit={event => { event.preventDefault(); add(); }}>
   <label>{t('Name')}<Input value={label} maxLength={120} placeholder={t('e.g. New car payment')} onChange={event => setLabel(event.target.value)}/></label>
   <Segmented label={t('Direction')} options={[{ value: 'out', label: t('Money out') }, { value: 'in', label: t('Money in') }] as const} value={direction} onChange={setDirection}/>
   <label>{t('Amount')}<FormattedNumberInput value={amount} required={false} onValueChange={setAmount} ariaLabel={t('Amount')}/></label>
   <Segmented label={t('Repeats')} options={[{ value: 'Once', label: t('One time') }, { value: 'Monthly', label: t('Every month') }] as const} value={frequency} onChange={setFrequency}/>
   <label>{t('Start date')}<DatePicker value={date} min={today} onChange={setDate}/></label>
   <Button type="submit" disabled={!(amount > 0) || !date || adjustments.length >= 50}>{t('Add change')}</Button>
  </form>
  {adjustments.length > 0 && <ul className="tool-list">{adjustments.map(item => <li key={item.id}>
   <span><strong>{item.name || t('What-if change')}</strong><p>{t(item.frequency === 'Monthly' ? 'Every month' : 'One time')} · {t('From {date}', { date: formatDate(item.date, locale) })}</p></span>
   <span className="row-actions"><strong className={item.amount > 0 ? 'amount positive' : 'amount'}>{formatSignedMoney(item.amount, currency, locale)}</strong><Button size="icon" variant="ghost" aria-label={t('Remove {name}', { name: item.name || t('What-if change') })} onClick={() => onChange(adjustments.filter(other => other.id !== item.id))}><X size={16} aria-hidden="true"/></Button></span>
  </li>)}</ul>}
 </section>;
}

/** Dashboard card: the lowest projected cash in the next 90 days, and any account heading below zero. */
export function LowestBalanceCard({ data, plans, plansMonth, currency, rates }: { data: PlanningData; plans: readonly ExpensePlan[]; plansMonth?: string; currency: string; rates: Rates }) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const forecast = useMemo(() => cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, plans, plansMonth, today, days: 90, currency, rates }), [data, plans, plansMonth, today, currency, rates]);
 return <section className="panel overview-panel forecast-card" aria-label={t('Lowest balance ahead')}>
  <PanelTitle title={t('Lowest balance ahead')}><DrawerLink href="/income-expenses#forecast">{t('View forecast')}</DrawerLink></PanelTitle>
  {forecast.totals.length ? <ul className="forecast-card-figures">{forecast.totals.map(total => <li key={total.id}>
   <strong className={signTone(total.lowest.balance, true)}><RollingText text={formatMoney(total.lowest.balance, total.currency, locale)}/></strong>
   <small>{formatDate(total.lowest.date, locale)}</small>
  </li>)}</ul> : <EmptyState icon={<Wallet aria-hidden="true"/>} description={t('Add a cash account to forecast its balance.')}/>}
  <BelowZeroWarning forecast={forecast}/>
 </section>;
}
