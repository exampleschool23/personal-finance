"use client";
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Fragment, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
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
import { shiftMonth } from '@/lib/calendar-days';
import { convertAmount } from '@/lib/market';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import { calendarWeeks, carriedOverdue, daysFrom, monthOccurrences, recurringSummary, type RecurringItem } from '@/lib/recurring';
import { AccountOperation, type Operation } from './account-operation';

/** The Recurring page's views, switched from tabs beside its title: the month as a list or a calendar, subscriptions and reminders. */
export type RecurringView = 'list' | 'calendar' | 'subscriptions' | 'reminders';
type Props = { data: PlanningData; save: (action: string, data: unknown) => Promise<void>; currency: string; rates?: number | Record<string, number>; view: RecurringView; onView: (view: RecurringView) => void; onAdd?: (direction: 'income' | 'expense') => void; onEdit?: (record: RecurringItem['record']) => void };

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

export function UpcomingPage({ data, save, currency, rates, view, onView, onAdd, onEdit }: Props) {
 const { t, locale } = useLanguage(), today = depositToday();
 const dueLabel = useDueLabel();
 const [operation, setOperation] = useState<Operation | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const [month, setMonth] = useState(today.slice(0, 7));
 // The month's payments show in the list and calendar views; the other views belong to the screen.
 const scheduled = view === 'list' || view === 'calendar';
 const items = monthOccurrences(data.records, data.occurrences, month, today, data.debtPayments);
 // Payments left open in earlier months stay at the top of the current month until they are recorded (0 counts) or skipped, so none is forgotten. They are not this month's totals.
 const carried = month === today.slice(0, 7) ? carriedOverdue(data.records, data.occurrences, month, today) : [];
 const summary = recurringSummary(items, (amount, unit) => convertAmount(amount, unit, currency, rates));
 const reminders = upcomingPayments(data.records, data.occurrences, today, undefined, data.debtPayments).filter(item => item.type !== 'scheduled');
 const skipped = data.occurrences.filter(o => o.status === 'dismissed' && data.records.some(r => r.id === o.record_id && r.frequency !== 'Once'));
 async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
 const payDebt = (record: RecurringItem['record']) => setOperation({ action: record.kind === 'Mortgage' ? 'mortgage' : 'repayment', target_id: record.id, date: today, amount: 0 });
 const pay = (item: RecurringItem) => item.installment ? payDebt(item.record) : setOperation({ action: 'occurrence', target_id: item.record.id, date: item.date, amount: item.amount });
 const skip = (item: RecurringItem) => run(() => save('exception', { target_id: item.record.id, date: item.date, skip: true }));
 // A settled payment names what actually arrived or left, beside the scheduled amount.
 const status = (item: RecurringItem) => item.status === 'paid' ? <span className="status-badge is-paid">{t(item.direction === 'income' ? 'Received' : 'Paid')}{item.recorded !== undefined && <> · {formatMoney(item.recorded, item.record.currency, locale)}</>}</span>
  : item.status === 'skipped' ? <span className="status-badge">{t('Skipped')}</span>
  : <span className={item.status === 'overdue' ? 'status-badge is-overdue' : 'status-badge'}>{dueLabel(today, item.date)}</span>;
  // A payment is recorded once it happens: before its date the button waits and says when.
 const row = (item: RecurringItem, dated = false) => {
  const early = !item.installment && item.date > today;
  // Tapping a row (outside its buttons) opens the schedule's form to change its date, amount or anything else.
  const edit = onEdit && ((event: MouseEvent) => { if (!(event.target as HTMLElement).closest('button,a,[role=menu]')) onEdit(item.record); });
  return <li key={item.key} className="recurring-row" data-status={item.status} data-editable={onEdit ? '' : undefined} onClick={edit}>
   <span className="transaction-merchant"><CategoryIcon kind={item.record.kind}/><span>{onEdit ? <button type="button" className="recurring-edit" aria-label={t('Edit {name}', { name: item.record.name })} onClick={() => onEdit(item.record)}>{item.record.name}</button> : <strong>{item.record.name}</strong>}<small>{[t(frequencyLabels[item.installment ? 'Monthly' : item.record.frequency]), t(item.record.kind), dated ? formatDate(item.date, locale) : null].filter(Boolean).join(' · ')}</small></span></span>
   {status(item)}
   <strong className={income.includes(item.record.kind) ? 'transaction-amount positive' : 'transaction-amount'}>{formatMoney(item.amount, item.record.currency, locale)}</strong>
   <div className="row-actions">{(item.status === 'due' || item.status === 'overdue') && <>
    <span title={early ? t('You can record it from {date}.', { date: formatDate(item.date, locale) }) : undefined}><Button size="sm" variant="outline" disabled={busy || early} onClick={() => pay(item)}>{t('Record payment')}</Button></span>
    {!item.installment && <RowMenu label={t('Actions for {name}', { name: item.record.name })} items={[{ label: t('Skip this occurrence'), disabled: busy, onSelect: () => skip(item) }]}/>}
   </>}</div>
  </li>;
 };
 return <>
  <PageHeader title={t('Recurring')} tabs={<Segmented className="page-tabs" as="nav" label={t('Recurring view')} options={[{ value: 'list', label: t('List') }, { value: 'calendar', label: t('Calendar') }, { value: 'subscriptions', label: t('Subscriptions') }, { value: 'reminders', label: t('Reminders') }] as const} value={view} onChange={onView}/>} hint={<><p>{t('Every scheduled income and bill, month by month. Record a payment only after it happens; a reminder never moves money.')}</p><p>{t('Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p></>}>
   {scheduled && <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></Button>
    <Button variant="outline" size="icon" aria-label={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></Button>
    <Button variant="outline" disabled={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}>{t('Today')}</Button>
   </div>}
   {/* A new schedule opens the usual income or expense form, already repeating monthly. */}
   {onAdd && <><Button variant="outline" onClick={() => onAdd('income')}><Plus size={17} aria-hidden="true"/>{t('Add income')}</Button><Button onClick={() => onAdd('expense')}><Plus size={17} aria-hidden="true"/>{t('Add expense')}</Button></>}
  </PageHeader>
  <ErrorPopup message={error}/>
  {scheduled && <>
  <section className="panel recurring-summary" aria-label={formatMonthYear(month, locale)}>
   <h2>{formatMonthYear(month, locale)}</h2>
   <SummaryBar label={t('Income')} done={summary.income.done} remaining={summary.income.remaining} doneLabel="{amount} received" currency={currency} tone="income"/>
   <SummaryBar label={t('Expenses')} done={summary.expense.done} remaining={summary.expense.remaining} doneLabel="{amount} paid" currency={currency} tone="expense"/>
  </section>
  {view === 'list' ? <section className="panel recurring-list" aria-label={t('Recurring')}>
   {items.length || carried.length ? <ul>
    {carried.length > 0 && <li className="transaction-day-heading"><h3>{t('Open from earlier months')}<Count value={carried.length}/></h3></li>}
    {carried.map(item => row(item, true))}
    {items.map((item, index) => <Fragment key={item.key}>
     {item.date !== items[index - 1]?.date && <li className="transaction-day-heading"><h3>{formatDate(item.date, locale)}</h3></li>}
     {row(item)}
    </Fragment>)}
   </ul> : <EmptyState icon={<Repeat aria-hidden="true"/>} description={t('Nothing is scheduled this month. Add a monthly or weekly income or expense to see it here.')}/>}
  </section> : <RecurringCalendar month={month} items={items} reminders={reminders} today={today}/>}
  {/* Only when a debt payment or deposit maturity is due this month; an empty card is just noise. */}
  {reminders.length > 0 && <section className="panel upcoming-section" aria-labelledby="upcoming-reminders">
   <header className="upcoming-section-heading"><h2 id="upcoming-reminders">{t('Debt repayments and deposit maturities')}<Count value={reminders.length}/></h2></header>
   <div className="table-scroll"><table><thead><tr><th>{t('Name')}</th><th>{t('Date')}</th><th>{t('Amount')}</th><th>{t('Actions')}</th></tr></thead><tbody>{reminders.map(item => <tr key={item.key}>
    <td><div className="record-name"><CategoryIcon kind={item.record.kind}/><div><strong>{item.record.name}</strong><small>{t(item.record.kind)}</small></div></div></td>
    <td className={item.overdue ? 'negative' : 'muted'}>{formatDate(item.date, locale)}<small className="block">{dueLabel(today, item.date)}</small></td>
    <td className="amount">{formatMoney(item.amount, item.record.currency, locale)}</td>
    <td><div className="row-actions">{item.type === 'maturity'
     ? <Button size="sm" disabled={busy || item.date > today} variant="outline" onClick={() => run(() => save('dismiss', { id: crypto.randomUUID(), target_id: item.record.id, date: item.date }))}>{t('Dismiss reminder')}</Button>
     : <Button size="sm" variant="outline" onClick={() => payDebt(item.record)}>{t('Record payment')}</Button>}</div></td>
   </tr>)}</tbody></table></div>
  </section>}
  {/* Only when something was skipped: an empty fold is just noise. */}
  {skipped.length > 0 && <details className="panel tools-panel"><summary>{t('Skipped occurrences')}<Count value={skipped.length}/></summary><ul className="tool-list">{skipped.map(o => <li key={o.id}><span>{data.records.find(r => r.id === o.record_id)?.name} · {formatDate(o.due_on, locale)}{o.notes && <> · {o.notes}</>}</span><Button size="sm" disabled={busy} variant="outline" onClick={() => run(() => save('exception', { target_id: o.record_id, date: o.due_on, skip: false }))}>{t('Restore occurrence')}</Button></li>)}</ul></details>}
  </>}
  {operation && <AccountOperation operation={operation} records={data.records} save={save} onClose={() => setOperation(null)}/>}
 </>;
}

/** The month as a Monday-first grid, each day holding its scheduled items as chips. */
function RecurringCalendar({ month, items, reminders, today }: { month: string; items: RecurringItem[]; reminders: ReturnType<typeof upcomingPayments>; today: string }) {
 const { t, locale } = useLanguage();
 const byDay = new Map<string, RecurringItem[]>();
 for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
 // Debt repayments and maturities sit on the calendar too, so it agrees with the list below it.
 const dueByDay = new Map<string, typeof reminders>();
 for (const item of reminders) dueByDay.set(item.date, [...(dueByDay.get(item.date) ?? []), item]);
 return <section className="panel recurring-calendar" aria-label={t('Calendar')}>
  <div className="recurring-calendar-grid" role="grid">
   <div role="row" className="recurring-calendar-week">{weekdayLabels(locale).map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
   {calendarWeeks(month).map((week, index) => <div role="row" className="recurring-calendar-week" key={index}>{week.map((day, position) => <div role="gridcell" key={day ?? 'empty' + position} className="recurring-calendar-day" data-empty={!day || undefined} data-today={day === today || undefined}>
    {day && <><span className="recurring-calendar-date">{formatNumber(Number(day.slice(8)), locale, 0)}</span>
     {(byDay.get(day) ?? []).map(item => <span key={item.key} className="recurring-chip" data-direction={item.direction} data-status={item.status} title={`${item.record.name} · ${formatMoney(item.amount, item.record.currency, locale)}`}><span>{item.record.name}</span><strong>{formatMoney(item.amount, item.record.currency, locale)}</strong></span>)}
     {(dueByDay.get(day) ?? []).map(item => <span key={item.key} className="recurring-chip" data-direction={item.type === 'maturity' || item.record.kind === 'Money lent' ? 'income' : 'expense'} data-status={item.overdue ? 'overdue' : 'due'} title={`${item.record.name} · ${t(item.record.kind)} · ${formatMoney(item.amount, item.record.currency, locale)}`}><span>{item.record.name}</span><strong>{formatMoney(item.amount, item.record.currency, locale)}</strong></span>)}</>}
   </div>)}</div>)}
  </div>
 </section>;
}
