"use client";
import { Fragment, useState } from 'react';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Count } from '@/components/presentation-foundation/count';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate, formatMoney, formatMonthYear, formatNumber, weekdayLabels } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { shiftMonth } from '@/lib/calendar-days';
import { convertAmount } from '@/lib/market';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import { archivedSchedules, calendarWeeks, carriedOverdue, monthOccurrences, onlyDirection, recurringSummary, type ArchiveTarget, type RecurringItem } from '@/lib/recurring';
import { AccountOperation, type Operation } from './account-operation';
import { ArchivedFold, OccurrenceRow, useDueLabel } from './recurring-rows';
import { useScheduleDeletion } from './delete-schedule-dialog';
import { useColumnsFit } from '@/hooks/use-columns-fit';
import { useRecurringDetails } from './recurring-details';
import { paymentsFrom } from '@/lib/payment-account';
import { AddRecurringMenu, type RecurringKind } from './add-recurring-menu';

/** The Recurring page's views, switched from tabs beside its title: the month as a list or a calendar, subscriptions and reminders. */
export type RecurringView = 'list' | 'calendar' | 'subscriptions' | 'reminders';
type Props = { data: PlanningData; save: (action: string, data: unknown) => Promise<void>; currency: string; rates?: number | Record<string, number>; view: RecurringView; onView: (view: RecurringView) => void; onEdit?: (record: RecurringItem['record']) => void; onAddRecurring?: (kind: RecurringKind) => void;
 /** Archiving moves a schedule out of the month and back. */
 onArchive?: (target: ArchiveTarget, archived: boolean) => Promise<void>;
 /** Moves a schedule to Recently deleted, keeping its recorded payments in history or deleting them too. */
 onDelete?: (target: ArchiveTarget, removeHistory: boolean) => Promise<void> };
type Direction = RecurringItem['direction'];

/** One summary bar: what already came in (or went out) against the month's total. Tapping it shows only that side in the list; tapping again shows everything. */
function SummaryBar({ label, done, remaining, doneLabel, currency, tone, pressed, onPress }: { label: string; done: number; remaining: number; doneLabel: string; currency: string; tone: Direction; pressed: boolean; onPress: () => void }) {
 const { t, locale } = useLanguage();
 const total = done + remaining;
 return <button type="button" className="recurring-bar" data-tone={tone} aria-pressed={pressed} onClick={onPress}>
  <span className="recurring-bar-line"><strong>{label}</strong><span>{t('{amount} total', { amount: formatMoney(total, currency, locale) })}</span></span>
  <span className="progress-track"><span style={{ width: `${total > 0 ? done / total * 100 : 0}%` }}/></span>
  <span className="recurring-bar-line"><small>{t(doneLabel, { amount: formatMoney(done, currency, locale) })}</small><small>{t('{amount} remaining', { amount: formatMoney(remaining, currency, locale) })}</small></span>
 </button>;
}

/** The month's incomes and bills, as a list or a calendar, with what came in and went out. */
export function UpcomingPage({ data, save, currency, rates, view, onView, onEdit, onAddRecurring, onArchive, onDelete }: Props) {
 const { t, locale } = useLanguage(), today = depositToday();
 const { entered } = useDisplayMoney();
 const dueLabel = useDueLabel();
 const [operation, setOperation] = useState<Operation | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const [month, setMonth] = useState(today.slice(0, 7));
 // The month's payments show in the list and calendar views; the other views belong to the screen.
 const scheduled = view === 'list' || view === 'calendar';
 const items = monthOccurrences(data.records, data.occurrences, month, today, data.debtPayments);
 // Payments left open in earlier months stay at the top of the current month until they are recorded (0 counts) or skipped, so none is forgotten. They are not this month's totals.
 const carried = month === today.slice(0, 7) ? carriedOverdue(data.records, data.occurrences, month, today) : [];
 const summary = recurringSummary(items, (amount, unit) => convertAmount(amount, unit, currency, rates));
 // Tapping Income or Expenses narrows the list and calendar to that side.
 const [only, setOnly] = useState<Direction | null>(null);
 const toggle = (direction: Direction) => setOnly(only === direction ? null : direction);
 const { shown, shownCarried } = onlyDirection(items, carried, only);
 const reminders = upcomingPayments(data.records, data.occurrences, today, undefined, data.debtPayments).filter(item => item.type !== 'scheduled');
 const skipped = data.occurrences.filter(o => o.status === 'dismissed' && data.records.some(r => r.id === o.record_id && r.frequency !== 'Once'));
 async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
 const payDebt = (record: RecurringItem['record']) => setOperation({ action: record.kind === 'Mortgage' ? 'mortgage' : 'repayment', target_id: record.id, date: today, amount: 0 });
 // A recorded occurrence takes another payment, starting at what is still to come.
 const pay = (item: RecurringItem) => item.installment ? payDebt(item.record) : setOperation({ action: 'occurrence', target_id: item.record.id, date: item.date, ...(item.status === 'paid' ? { extra: true, amount: Math.max(Math.ceil(item.amount - (item.recorded ?? item.amount)), 0) } : { amount: item.amount }) });
 // Tapping a row shows its history and totals; Edit is in its ⋯ menu and Record payment on the row.
 const details = useRecurringDetails(data, today);
 const archive = onArchive && ((target: ArchiveTarget, archived = true) => run(() => onArchive(target, archived)));
 const archived = archivedSchedules(data.records);
 const deletion = useScheduleDeletion(data, onDelete);
 // Rows stay on one line while their name keeps room beside status, amount and actions; two lines only when this month's content needs it.
 const rows = useColumnsFit<HTMLUListElement>('.recurring-row');
 const skip = (item: RecurringItem, skipped = true) => run(() => save('exception', { target_id: item.record.id, date: item.date, skip: skipped }));
 const row = (item: RecurringItem, dated = false) => <OccurrenceRow key={item.key} item={item} dated={dated} today={today} busy={busy} categories={data.categories} onEdit={onEdit} onOpen={details.open} onPay={pay} onSkip={skip} onRestore={item => skip(item, false)} onArchive={archive && (() => archive({ source: 'record', record: item.record }))} onDelete={deletion.open}/>;
 return <>
  <PageHeader title={t('Recurring')} tabs={<Segmented className="page-tabs" as="nav" label={t('Recurring view')} options={[{ value: 'list', label: t('List') }, { value: 'calendar', label: t('Calendar') }, { value: 'subscriptions', label: t('Subscriptions') }, { value: 'reminders', label: t('Reminders') }] as const} value={view} onChange={onView}/>} hint={<><p>{t('Every scheduled income and bill, month by month. Record a payment only after it happens; a reminder never moves money.')}</p><p>{t('Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p></>}>
   {scheduled && <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></Button>
    <Button variant="outline" size="icon" aria-label={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></Button>
    <TodayButton current={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}/>
   </div>}
   {onAddRecurring && <AddRecurringMenu onAdd={onAddRecurring}/>}
  </PageHeader>
  <ErrorPopup message={error}/>
  {scheduled && <>
  <section className="panel recurring-summary" aria-label={formatMonthYear(month, locale)}>
   <h2>{formatMonthYear(month, locale)}</h2>
   <SummaryBar label={t('Income')} done={summary.income.done} remaining={summary.income.remaining} doneLabel="{amount} received" currency={currency} tone="income" pressed={only === 'income'} onPress={() => toggle('income')}/>
   <SummaryBar label={t('Expenses')} done={summary.expense.done} remaining={summary.expense.remaining} doneLabel="{amount} paid" currency={currency} tone="expense" pressed={only === 'expense'} onPress={() => toggle('expense')}/>
  </section>
  {view === 'list' ? <section className="panel recurring-list" aria-label={t('Recurring')}>
   {shown.length || shownCarried.length ? <ul ref={rows}>
    {shownCarried.length > 0 && <li className="transaction-day-heading"><h3>{t('Open from earlier months')}<Count value={shownCarried.length}/></h3></li>}
    {shownCarried.map(item => row(item, true))}
    {shown.map((item, index) => <Fragment key={item.key}>
     {item.date !== shown[index - 1]?.date && <li className="transaction-day-heading"><h3>{formatDate(item.date, locale)}</h3></li>}
     {row(item)}
    </Fragment>)}
   </ul> : <EmptyState icon={<Repeat aria-hidden="true"/>} description={t('Nothing is scheduled this month. Add a monthly or weekly income or expense to see it here.')}/>}
  </section> : <RecurringCalendar month={month} items={shown} reminders={reminders} today={today}/>}
  {/* Only when a debt payment or deposit maturity is due this month; an empty card is just noise. */}
  {reminders.length > 0 && <section className="panel upcoming-section" aria-labelledby="upcoming-reminders">
   <header className="upcoming-section-heading"><h2 id="upcoming-reminders">{t('Debt repayments and deposit maturities')}<Count value={reminders.length}/></h2></header>
   <div className="table-scroll"><table><thead><tr><th>{t('Name')}</th><th>{t('Date')}</th><th>{t('Amount')}</th><th>{t('Actions')}</th></tr></thead><tbody>{reminders.map(item => <tr key={item.key}>
    <td><div className="record-name"><CategoryIcon kind={item.record.kind}/><div><strong>{item.record.name}</strong><small>{t(item.record.kind)}</small></div></div></td>
    <td className={item.overdue ? 'negative' : 'muted'}>{formatDate(item.date, locale)}<small className="block">{dueLabel(today, item.date)}</small></td>
    <td className="amount">{entered(item.amount, item.record.currency)}</td>
    <td><div className="row-actions">{item.type === 'maturity'
     ? <Button size="sm" disabled={busy || item.date > today} variant="outline" onClick={() => run(() => save('dismiss', { id: crypto.randomUUID(), target_id: item.record.id, date: item.date }))}>{t('Dismiss reminder')}</Button>
     : <Button size="sm" variant="outline" onClick={() => payDebt(item.record)}>{t('Record payment')}</Button>}</div></td>
   </tr>)}</tbody></table></div>
  </section>}
  {/* Only when something was skipped: an empty fold is just noise. */}
  {skipped.length > 0 && <details className="panel tools-panel"><summary>{t('Skipped occurrences')}<Count value={skipped.length}/></summary><ul className="tool-list">{skipped.map(o => <li key={o.id}><span>{data.records.find(r => r.id === o.record_id)?.name} · {formatDate(o.due_on, locale)}{o.notes && <> · {o.notes}</>}</span><Button size="sm" disabled={busy} variant="outline" onClick={() => run(() => save('exception', { target_id: o.record_id, date: o.due_on, skip: false }))}>{t('Restore occurrence')}</Button></li>)}</ul></details>}
  {archive && <ArchivedFold records={archived} busy={busy} onRestore={target => archive(target, false)}/>}
  </>}
  {details.dialog}
  {deletion.dialog}
  {operation && <AccountOperation operation={operation} records={data.records} activity={paymentsFrom(data.activity, data.debtPayments)} save={save} onClose={() => setOperation(null)}/>}
 </>;
}

/** The month as a Monday-first grid, each day holding its scheduled items as chips. */
function RecurringCalendar({ month, items, reminders, today }: { month: string; items: RecurringItem[]; reminders: ReturnType<typeof upcomingPayments>; today: string }) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
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
     {(byDay.get(day) ?? []).map(item => <span key={item.key} className="recurring-chip" data-direction={item.direction} data-status={item.status} title={`${item.record.name} · ${entered(item.amount, item.record.currency)}`}><span>{item.record.name}</span><strong>{entered(item.amount, item.record.currency)}</strong></span>)}
     {(dueByDay.get(day) ?? []).map(item => <span key={item.key} className="recurring-chip" data-direction={item.type === 'maturity' || item.record.kind === 'Money lent' ? 'income' : 'expense'} data-status={item.overdue ? 'overdue' : 'due'} title={`${item.record.name} · ${t(item.record.kind)} · ${entered(item.amount, item.record.currency)}`}><span>{item.record.name}</span><strong>{entered(item.amount, item.record.currency)}</strong></span>)}</>}
   </div>)}</div>)}
  </div>
 </section>;
}
