"use client";
import type { MouseEvent } from 'react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DoneTick } from '@/components/presentation-foundation/done-tick';
import { ProgressLine } from '@/components/presentation-foundation/progress-line';
import { Count } from '@/components/presentation-foundation/count';
import { RowMenu, type RowMenuItem } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import type { ExpensePlan } from '@/lib/expense-plans';
import { frequencyLabels, income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { daysFrom, type ArchiveTarget, type RecurringItem, type RecurringPlan } from '@/lib/recurring';

/** "in 3 days", "today", "yesterday", "2 days ago": how far a due date is from today. */
export function useDueLabel() {
 const { t, locale } = useLanguage();
 return (today: string, date: string) => {
  const days = daysFrom(today, date);
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  if (days === -1) return t('Yesterday');
  return days > 0 ? t('in {count} days', { count: formatNumber(days, locale, 0) }) : t('{count} days ago', { count: formatNumber(-days, locale, 0) });
 };
}

/** A row's name: a button that opens its form when the row can be tapped, plain text otherwise. */
function RowName({ name, label, detail, onOpen }: { name: string; label: string; detail: string; onOpen?: () => void }) {
 return <span>{onOpen ? <button type="button" className="recurring-edit" aria-label={label} onClick={onOpen}>{name}</button> : <strong>{name}</strong>}<small>{detail}</small></span>;
}

/** Tapping a row outside its buttons and menu does what its name does. */
const rowTap = (action?: () => void) => action && ((event: MouseEvent) => { if (!(event.target as HTMLElement).closest('button,a,[role=menu]')) action(); });

type OccurrenceProps = { item: RecurringItem; dated: boolean; today: string; busy: boolean; onEdit?: (record: Entry) => void; onPay: (item: RecurringItem) => void; onSkip: (item: RecurringItem) => void; onArchive?: () => void; onDelete?: (target: ArchiveTarget) => void };

/** One scheduled income or bill on its day: its status, the scheduled amount, and recording, skipping or archiving it. */
/** A schedule's or plan's ⋯ menu: Skip while an occurrence is open, then Archive and Delete where they are offered. */
function scheduleMenu(t: (key: string) => string, busy: boolean, { skip, archive, remove }: { skip?: () => void; archive?: () => void; remove?: () => void }): RowMenuItem[] {
 return [...(skip ? [{ label: t('Skip this occurrence'), disabled: busy, onSelect: skip }] : []), ...(archive ? [{ label: t('Archive'), disabled: busy, onSelect: archive }] : []), ...(remove ? [{ label: t('Delete'), destructive: true, disabled: busy, onSelect: remove }] : [])];
}

export function OccurrenceRow({ item, dated, today, busy, onEdit, onPay, onSkip, onArchive, onDelete }: OccurrenceProps) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 // A payment is recorded once it happens: before its date the button waits and says when. A recorded one takes further payments; a skipped one none.
 const early = !item.installment && item.date > today, open = item.status === 'due' || item.status === 'overdue';
 const edit = onEdit && (() => onEdit(item.record));
 // A settled payment names what actually arrived or left, beside the scheduled amount.
 const paid = item.status === 'paid', recorded = item.recorded ?? item.amount;
 const status = paid ? <ProgressLine value={recorded} target={item.amount} tone={item.direction} label={t(item.direction === 'income' ? 'Received' : 'Paid') + ' · ' + formatMoney(recorded, item.record.currency, locale)}/>
  : item.status === 'skipped' ? <span className="status-badge">{t('Skipped')}</span>
  : <span className={item.status === 'overdue' ? 'status-badge is-overdue' : 'status-badge'}>{dueLabel(today, item.date)}</span>;
 // Archiving takes the whole schedule out of Recurring; its recorded payments stay. Loan payments follow their loan instead.
 const menu = item.installment ? [] : scheduleMenu(t, busy, { skip: open ? () => onSkip(item) : undefined, archive: onArchive, remove: onDelete && (() => onDelete({ source: 'record', record: item.record })) });
 return <li className="recurring-row" data-status={item.status} data-editable={edit ? '' : undefined} onClick={rowTap(edit)}>
  <span className="transaction-merchant"><DoneTick done={paid}/><CategoryIcon kind={item.record.kind}/><RowName name={item.record.name} label={t('Edit {name}', { name: item.record.name })} onOpen={edit} detail={[t(frequencyLabels[item.installment ? 'Monthly' : item.record.frequency]), t(item.record.kind), dated ? formatDate(item.date, locale) : null].filter(Boolean).join(' · ')}/></span>
  {status}
  <strong className={income.includes(item.record.kind) ? 'transaction-amount positive' : 'transaction-amount'}>{formatMoney(item.amount, item.record.currency, locale)}</strong>
  <div className="row-actions"><span title={early ? t('You can record it from {date}.', { date: formatDate(item.date, locale) }) : undefined}><Button size="sm" variant="outline" disabled={busy || early || item.status === 'skipped'} onClick={() => onPay(item)}>{t('Record payment')}</Button></span>
   {menu.length > 0 && <RowMenu label={t('Actions for {name}', { name: item.record.name })} items={menu}/>}
  </div>
 </li>;
}

/** The month's spending plans under the dated bills, as on the Spending tab: spent against planned with a progress bar, tapped to record spending. */
export function PlanRows({ plans, onSpend, onArchive, onDelete }: { plans: RecurringPlan[]; onSpend?: (plan: ExpensePlan) => void; onArchive?: (plan: ExpensePlan) => void; onDelete?: (target: ArchiveTarget) => void }) {
 const { t, locale } = useLanguage();
 if (!plans.length) return null;
 return <>
  <li className="transaction-day-heading"><h3>{t('Spending plans')}<Count value={plans.length}/></h3></li>
  {plans.map(({ plan, planned, spent }) => {
   const spend = onSpend && (() => onSpend(plan));
   return <li key={'plan:' + plan.id} className="recurring-row" data-editable={spend ? '' : undefined} onClick={rowTap(spend)}>
    <span className="transaction-merchant"><DoneTick done={false}/><CategoryIcon kind={plan.category}/><RowName name={plan.name} label={t('Record spending') + ' · ' + plan.name} onOpen={spend} detail={[t(frequencyLabels.Monthly), t(plan.category)].join(' · ')}/></span>
    <ProgressLine value={spent} target={planned} tone="expense"/>
    <strong className="transaction-amount">{formatMoney(spent, plan.currency, locale)} / {formatMoney(planned, plan.currency, locale)}</strong>
    <div className="row-actions">{spend && <Button size="sm" variant="outline" onClick={spend}>{t('Record spending')}</Button>}{(onArchive || onDelete) && <RowMenu label={t('Actions for {name}', { name: plan.name })} items={scheduleMenu(t, false, { archive: onArchive && (() => onArchive(plan)), remove: onDelete && (() => onDelete({ source: 'plan', plan })) })}/>}</div>
   </li>;
  })}
 </>;
}

/** Archived incomes, bills and plans, folded at the foot of the page, each with Restore. Only when there are some: an empty fold is just noise. */
export function ArchivedFold({ records, plans, busy, onRestore }: { records: Entry[]; plans: readonly ExpensePlan[]; busy: boolean; onRestore: (target: ArchiveTarget) => void }) {
 const { t, locale } = useLanguage();
 if (!records.length && !plans.length) return null;
 const restore = (target: ArchiveTarget, name: string, detail: string, amount: string) => <li key={target.source + (target.source === 'plan' ? target.plan.id : target.record.id)}><span>{[name, detail, amount].join(' · ')}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => onRestore(target)}>{t('Restore')}</Button></li>;
 return <details className="panel tools-panel"><summary>{t('Archived')}<Count value={records.length + plans.length}/></summary><ul className="tool-list">
  {records.map(record => restore({ source: 'record', record }, record.name, t(record.kind), formatMoney(record.amount, record.currency, locale)))}
  {plans.map(plan => restore({ source: 'plan', plan }, plan.name, t(plan.category), formatMoney(plan.amount, plan.currency, locale)))}
 </ul></details>;
}
