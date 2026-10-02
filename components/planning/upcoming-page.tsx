"use client";
import { Fragment, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Count } from '@/components/presentation-foundation/count';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatMonthYear, formatNumber, weekdayLabels } from '@/lib/format';
import { frequencyLabels, income } from '@/lib/finance';
import { depositToday } from '@/lib/deposit-interest';
import { shiftMonth } from '@/lib/budget';
import { convertAmount } from '@/lib/market';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import { calendarWeeks, daysFrom, monthOccurrences, recurringSummary, type RecurringItem } from '@/lib/recurring';
import { AccountOperation, type Operation } from './account-operation';

type Props = { data: PlanningData; save: (action: string, data: unknown) => Promise<void>; currency: string; rates?: number | Record<string, number> };

/** "in 3 days", "today", "2 days ago": how far a due date is from today. */
function useDueLabel() {
 const { t, locale } = useLanguage();
 return (today: string, date: string) => {
  const days = daysFrom(today, date);
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  return days > 0 ? t('in {count} days', { count: formatNumber(days, locale, 0) }) : t('{count} days ago', { count: formatNumber(-days, locale, 0) });
 };
}

/** One summary bar: what already came in (or went out) against the month's total. */
function SummaryBar({ label, done, remaining, doneLabel, currency, tone }: { label: string; done: number; remaining: number; doneLabel: string; currency: string; tone: 'income' | 'expense' }) {
 const { t, locale } = useLanguage();
 const total = done + remaining;
 return <div className="recurring-bar" data-tone={tone}>
  <p><strong>{label}</strong><span>{t('{amount} total', { amount: formatMoney(total, currency, locale) })}</span></p>
  <div className="progress-track"><div style={{ width: `${total > 0 ? done / total * 100 : 0}%` }}/></div>
  <p><small>{t(doneLabel, { amount: formatMoney(done, currency, locale) })}</small><small>{t('{amount} remaining', { amount: formatMoney(remaining, currency, locale) })}</small></p>
 </div>;
}

export function UpcomingPage({ data, save, currency, rates }: Props) {
 const { t, locale } = useLanguage(), today = depositToday();
 const dueLabel = useDueLabel();
 const [operation, setOperation] = useState<Operation | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const [month, setMonth] = useState(today.slice(0, 7));
 const [view, setView] = useState<'list' | 'calendar'>('list');
 const items = monthOccurrences(data.records, data.occurrences, month, today, data.debtPayments);
 const summary = recurringSummary(items, (amount, unit) => convertAmount(amount, unit, currency, rates));
 const reminders = upcomingPayments(data.records, data.occurrences, today, undefined, data.debtPayments).filter(item => item.type !== 'scheduled');
 const skipped = data.occurrences.filter(o => o.status === 'dismissed' && data.records.some(r => r.id === o.record_id && r.frequency !== 'Once'));
 async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
 const payDebt = (record: RecurringItem['record']) => setOperation({ action: record.kind === 'Mortgage' ? 'mortgage' : 'repayment', target_id: record.id, date: today, amount: 0 });
 const pay = (item: RecurringItem) => item.installment ? payDebt(item.record) : setOperation({ action: 'occurrence', target_id: item.record.id, date: item.date, amount: item.amount });
 const skip = (item: RecurringItem) => run(() => save('exception', { target_id: item.record.id, date: item.date, skip: true }));
 const status = (item: RecurringItem) => item.status === 'paid' ? <span className="status-badge is-paid">{t(item.direction === 'income' ? 'Received' : 'Paid')}</span>
  : item.status === 'skipped' ? <span className="status-badge">{t('Skipped')}</span>
  : <span className={item.status === 'overdue' ? 'status-badge is-overdue' : 'status-badge'}>{dueLabel(today, item.date)}</span>;
 return <>
  <PageHeader title={t('Recurring')} hint={<><p>{t('Every scheduled income and bill, month by month. Record a payment only after it happens; a reminder never moves money.')}</p><p>{t('Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p></>}>
   <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></Button>
    <Button variant="outline" size="icon" aria-label={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></Button>
    <Button variant="outline" disabled={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}>{t('Today')}</Button>
   </div>
   <Segmented label={t('Recurring view')} options={[{ value: 'list', label: t('List') }, { value: 'calendar', label: t('Calendar') }] as const} value={view} onChange={setView}/>
  </PageHeader>
  <ErrorPopup message={error}/>
  <section className="panel recurring-summary" aria-label={formatMonthYear(month, locale)}>
   <h2>{formatMonthYear(month, locale)}</h2>
   <SummaryBar label={t('Income')} done={summary.income.done} remaining={summary.income.remaining} doneLabel="{amount} received" currency={currency} tone="income"/>
   <SummaryBar label={t('Expenses')} done={summary.expense.done} remaining={summary.expense.remaining} doneLabel="{amount} paid" currency={currency} tone="expense"/>
  </section>
  {view === 'list' ? <section className="panel recurring-list" aria-label={t('Recurring')}>
   {items.length ? <ul>{items.map((item, index) => <Fragment key={item.key}>
    {item.date !== items[index - 1]?.date && <li className="transaction-day-heading"><h3>{formatDate(item.date, locale)}</h3></li>}
    <li className="recurring-row" data-status={item.status}>
     <span className="transaction-merchant"><CategoryIcon kind={item.record.kind}/><span><strong>{item.record.name}</strong><small>{t(frequencyLabels[item.installment ? 'Monthly' : item.record.frequency])} · {t(item.record.kind)}</small></span></span>
     {status(item)}
     <strong className={income.includes(item.record.kind) ? 'transaction-amount positive' : 'transaction-amount'}>{formatMoney(item.amount, item.record.currency, locale)}</strong>
     <div className="row-actions">{(item.status === 'due' || item.status === 'overdue') && <>
      <Button size="sm" variant="outline" disabled={busy || (!item.installment && item.date > today)} onClick={() => pay(item)}>{t('Record payment')}</Button>
      {!item.installment && <Button size="sm" variant="ghost" disabled={busy} onClick={() => skip(item)} aria-label={t('Skip this occurrence') + ': ' + item.record.name}>{t('Skip')}</Button>}
     </>}</div>
    </li>
   </Fragment>)}</ul> : <EmptyState icon={<Repeat aria-hidden="true"/>} description={t('Nothing is scheduled this month. Add a monthly or weekly income or expense to see it here.')}/>}
  </section> : <RecurringCalendar month={month} items={items} today={today}/>}
  <section className="panel upcoming-section" aria-labelledby="upcoming-reminders">
   <header className="upcoming-section-heading"><h2 id="upcoming-reminders">{t('Debt repayments and deposit maturities')}<Count value={reminders.length}/></h2></header>
   {reminders.length > 0 ? <div className="table-scroll"><table><thead><tr><th>{t('Name')}</th><th>{t('Date')}</th><th>{t('Amount')}</th><th>{t('Actions')}</th></tr></thead><tbody>{reminders.map(item => <tr key={item.key}>
    <td><div className="record-name"><CategoryIcon kind={item.record.kind}/><div><strong>{item.record.name}</strong><small>{t(item.record.kind)}</small></div></div></td>
    <td className={item.overdue ? 'negative' : 'muted'}>{formatDate(item.date, locale)}<small className="block">{dueLabel(today, item.date)}</small></td>
    <td className="amount">{formatMoney(item.amount, item.record.currency, locale)}</td>
    <td><div className="row-actions">{item.type === 'maturity'
     ? <Button size="sm" disabled={busy || item.date > today} variant="outline" onClick={() => run(() => save('dismiss', { id: crypto.randomUUID(), target_id: item.record.id, date: item.date }))}>{t('Dismiss reminder')}</Button>
     : <Button size="sm" variant="outline" onClick={() => payDebt(item.record)}>{t('Record payment')}</Button>}</div></td>
   </tr>)}</tbody></table></div> : <EmptyState icon={<CalendarCheck aria-hidden="true"/>} description={t('No unpaid items in this period.')}/>}
  </section>
  <details className="panel tools-panel"><summary>{t('Skipped occurrences')}{skipped.length > 0 && <Count value={skipped.length}/>}</summary><ul className="tool-list">{skipped.map(o => <li key={o.id}><span>{data.records.find(r => r.id === o.record_id)?.name} · {formatDate(o.due_on, locale)}</span><Button size="sm" disabled={busy} variant="outline" onClick={() => run(() => save('exception', { target_id: o.record_id, date: o.due_on, skip: false }))}>{t('Restore occurrence')}</Button></li>)}</ul></details>
  {operation && <AccountOperation operation={operation} records={data.records} save={save} onClose={() => setOperation(null)}/>}
 </>;
}

/** The month as a Monday-first grid, each day holding its scheduled items as chips. */
function RecurringCalendar({ month, items, today }: { month: string; items: RecurringItem[]; today: string }) {
 const { t, locale } = useLanguage();
 const byDay = new Map<string, RecurringItem[]>();
 for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
 return <section className="panel recurring-calendar" aria-label={t('Calendar')}>
  <div className="recurring-calendar-grid" role="grid">
   <div role="row" className="recurring-calendar-week">{weekdayLabels(locale).map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
   {calendarWeeks(month).map((week, index) => <div role="row" className="recurring-calendar-week" key={index}>{week.map((day, position) => <div role="gridcell" key={day ?? 'empty' + position} className="recurring-calendar-day" data-empty={!day || undefined} data-today={day === today || undefined}>
    {day && <><span className="recurring-calendar-date">{formatNumber(Number(day.slice(8)), locale, 0)}</span>
     {(byDay.get(day) ?? []).map(item => <span key={item.key} className="recurring-chip" data-direction={item.direction} data-status={item.status} title={`${item.record.name} · ${formatMoney(item.amount, item.record.currency, locale)}`}><span>{item.record.name}</span><strong>{formatMoney(item.amount, item.record.currency, locale)}</strong></span>)}</>}
   </div>)}</div>)}
  </div>
 </section>;
}
