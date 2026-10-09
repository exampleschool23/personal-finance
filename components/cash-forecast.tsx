"use client";
import { Fragment, useMemo, useState } from 'react';
import { CalendarCheck, TriangleAlert, Wallet, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ForecastChart } from '@/components/charts-lazy';
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
import { cashForecast, forecastHorizons, type CashForecastBudget, readAdjustments, seriesIn, type CashForecast, type ForecastAdjustment, type ForecastEvent, type ForecastHorizon, type ForecastSeries } from '@/lib/cash-forecast';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatMonthYear, formatNumber, formatSignedMoney } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { useDisplayMoney } from '@/components/display-money';

type Rates = number | Record<string, number> | undefined;
/** `budget`: Budget's spending lines and this month's spending, which the projection spends what is left of. */
type Props = { owner?: string | null; data: PlanningData; budget?: CashForecastBudget; currency: string; rates: Rates; loading: boolean; error: string; onRetry: () => void };

const storageKey = (owner?: string | null) => 'hoggish-forecast-adjustments:' + (owner ?? 'demo');
function storedAdjustments(owner?: string | null) {
 try { return readAdjustments(JSON.parse(localStorage.getItem(storageKey(owner)) ?? '[]')); } catch { return []; }
}

/** The name of a projected series: an account's own name, or total cash. */
function useSeriesName() {
 const { t } = useLanguage();
 return (series: ForecastSeries) => series.accountId ? series.name : t('Total cash');
}

/** Amounts no rate converts into the display currency are left out of total cash, and the figures say so. */
function MissingRateNote({ forecast, series }: { forecast: CashForecast; series: ForecastSeries | null }) {
 const { t } = useLanguage();
 if (!series) return <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>;
 return forecast.missing > 0 && !series.accountId ? <p role="status" className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p> : null;
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
   <ul>{forecast.belowZero.map(series => <li key={series.id}>{t('{name} goes below zero on {date}', { name: name(series), date: formatDate(series.belowZero!, locale) })}</li>)}</ul>
  </div>
 </div>;
}

/** The Forecast view of Cash flow: projected cash day by day, the lowest point, what drives it, and temporary what-ifs. */
export function CashForecastView({ owner, data, budget, currency, rates, loading, error, onRetry }: Props) {
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
 const forecast = useMemo(() => cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget, adjustments, today, days, currency, rates }), [data, budget, adjustments, today, days, currency, rates]);
 const options = [...forecast.totals, ...forecast.accounts];
 const shown = options.find(series => series.id === selected) ?? forecast.totals[0];
 const accountNames = new Map(forecast.accounts.map(account => [account.id, account.name]));
 if (loading) return <PanelSkeleton label={t('Loading records…')} rows={3}/>;
 if (error) return <InlineError as="div" message={t(error)} onRetry={onRetry}/>;
 // Every figure in the display currency: an account in another currency is converted, or reads — without a rate.
 const view = shown ? seriesIn(shown, currency, rates) : null;
 const money = (amount: number | undefined) => amount === undefined ? '—' : formatMoney(amount, currency, locale);
 const horizon = <Segmented label={t('Forecast horizon')} options={forecastHorizons.map(value => ({ value, label: t('{count} days', { count: formatNumber(value, locale, 0) }) }))} value={days} onChange={setDays}/>;
 return <>
  <section className="panel forecast-panel" aria-labelledby="forecast-title">
   <PanelTitle title={<span id="forecast-title">{t('Projected cash')}</span>} hint={t('Starts from today’s cash balances and adds scheduled income and bills, monthly loan payments, money owed to you, maturing deposits and what is left of your budgets. Items without a cash account change total cash only. Overdue items are left out.')}>{horizon}</PanelTitle>
   {!shown ? <EmptyState icon={<Wallet aria-hidden="true"/>} description={t('Add a cash account to forecast its balance.')}/> : <>
    {options.length > 1 && <NativeSelect className="forecast-series" aria-label={t('Balance to show')} value={shown.id} onChange={event => setSelected(event.target.value)}>
     {options.map(series => <option key={series.id} value={series.id}>{name(series)}{series.accountId ? ' · ' + series.currency : ''}</option>)}
    </NativeSelect>}
    <StatTiles columns={3} label={name(shown)}>
     <StatTile label={t('Cash today')} value={money(view?.start)}/>
     <StatTile label={t('Lowest balance')} value={money(view?.lowest.balance)} tone={view ? signTone(view.lowest.balance, true) : undefined}><p>{formatDate(shown.lowest.date, locale)}</p></StatTile>
     <StatTile label={t('In {count} days', { count: formatNumber(days, locale, 0) })} value={money(view?.end)} tone={view ? signTone(view.end, true) : undefined}>{view && <p>{formatSignedMoney(view.end - view.start, currency, locale)}</p>}</StatTile>
    </StatTiles>
    <MissingRateNote forecast={forecast} series={view}/>
    <BelowZeroWarning forecast={forecast}/>
    {view && <ForecastChart series={view}/>}
   </>}
  </section>
  <WhatIfPanel adjustments={adjustments} currency={currency} today={today} onChange={change}/>
  <section className="panel upcoming-section forecast-events" aria-labelledby="forecast-events">
   <header className="upcoming-section-heading"><h2 id="forecast-events">{t('Cash movements ahead')}<Count value={forecast.events.length}/></h2></header>
   {forecast.months.length ? <div className="table-scroll"><table>
    <thead><tr><th>{t('Name')}</th><th>{t('Date')}</th><th>{t('Amount')}</th></tr></thead>
    <tbody>{forecast.months.map(month => <Fragment key={month.month}>
     <tr className="table-group-row"><th colSpan={3}><div className="table-group-label"><span>{formatMonthYear(month.month, locale)}</span><span className="forecast-month-total">{month.missing ? '—' : formatSignedMoney(month.total, currency, locale)}</span></div></th></tr>
     {month.events.map(event => <EventRow key={event.key} event={event} account={event.accountId ? accountNames.get(event.accountId) : undefined}/>)}
    </Fragment>)}</tbody>
   </table></div> : <EmptyState icon={<CalendarCheck aria-hidden="true"/>} description={t('No scheduled cash movements in this period.')}/>}
  </section>
 </>;
}

function EventRow({ event, account }: { event: ForecastEvent; account?: string }) {
 const { t, locale } = useLanguage();
 const { showSigned } = useDisplayMoney();
 const source = event.source === 'installment' ? t('Monthly payment') : event.source === 'repayment' ? t('Repayment') : event.source === 'adjustment' ? t('What-if change') : event.source === 'budget' ? t('Budget') : t(event.kind);
 return <tr>
  <td><div className="record-name"><CategoryIcon kind={event.source === 'budget' ? event.name : event.kind}/><div><strong>{event.source === 'budget' ? t(event.name) : event.name || t('What-if change')}</strong><small>{account ? source + ' · ' + account : source}</small></div></div></td>
  <td className="muted">{formatDate(event.date, locale)}</td>
  <td className={event.amount > 0 ? 'amount positive' : 'amount'}>{showSigned(event.amount, event.currency)}</td>
 </tr>;
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
   <Button type="submit" disabled={!(amount > 0) || !date || adjustments.length >= 50} title={amount > 0 ? undefined : t('Enter an amount greater than zero.')}>{t('Add change')}</Button>
  </form>
  {adjustments.length > 0 && <ul className="tool-list">{adjustments.map(item => <li key={item.id}>
   <span><strong>{item.name || t('What-if change')}</strong><p>{t(item.frequency === 'Monthly' ? 'Every month' : 'One time')} · {t('From {date}', { date: formatDate(item.date, locale) })}</p></span>
   <span className="row-actions"><strong className={item.amount > 0 ? 'amount positive' : 'amount'}>{formatSignedMoney(item.amount, currency, locale)}</strong><Button size="icon" variant="ghost" aria-label={t('Remove {name}', { name: item.name || t('What-if change') })} onClick={() => onChange(adjustments.filter(other => other.id !== item.id))}><X size={16} aria-hidden="true"/></Button></span>
  </li>)}</ul>}
 </section>;
}

/** Dashboard card: the lowest projected cash in the next 90 days, and any account heading below zero.
 * It waits for the saved Budget (`budgetState`), since the projection spends what is left of it. */
export function LowestBalanceCard({ data, budget, budgetState, currency, rates }: { data: PlanningData; budget?: CashForecastBudget; budgetState?: { loading: boolean; error: string; retry: () => void }; currency: string; rates: Rates }) {
 const { t } = useLanguage();
 const today = depositToday();
 const forecast = useMemo(() => cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget, today, days: 90, currency, rates }), [data, budget, today, currency, rates]);
 return <section className="panel overview-panel forecast-card" aria-label={t('Lowest balance ahead')}>
  <PanelTitle title={t('Lowest balance ahead')}><DrawerLink href="/income-expenses#forecast">{t('View forecast')}</DrawerLink></PanelTitle>
  {budgetState?.loading ? <PanelSkeleton label={t('Loading records…')} rows={2}/> : budgetState?.error ? <InlineError as="div" message={t(budgetState.error)} onRetry={budgetState.retry}/> : <LowestBalanceFigures forecast={forecast}/>}
 </section>;
}

function LowestBalanceFigures({ forecast }: { forecast: CashForecast }) {
 const { t, locale } = useLanguage();
 return <>
  {forecast.totals.length ? <ul className="forecast-card-figures">{forecast.totals.map(total => <li key={total.id}>
   <strong className={signTone(total.lowest.balance, true)}><RollingText text={formatMoney(total.lowest.balance, total.currency, locale)}/></strong>
   <small>{formatDate(total.lowest.date, locale)}</small>
  </li>)}</ul> : <EmptyState icon={<Wallet aria-hidden="true"/>} description={t('Add a cash account to forecast its balance.')}/>}
  {forecast.totals[0] && <MissingRateNote forecast={forecast} series={forecast.totals[0]}/>}
  <BelowZeroWarning forecast={forecast}/>
 </>;
}
