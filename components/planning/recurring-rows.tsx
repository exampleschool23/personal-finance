"use client";
import type { MouseEvent } from 'react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DoneTick } from '@/components/presentation-foundation/done-tick';
import { ProgressLine } from '@/components/presentation-foundation/progress-line';
import { Count } from '@/components/presentation-foundation/count';
import { RowMenu, type RowMenuItem } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import type { Category } from '@/lib/planning';
import { shownName } from '@/lib/record-names';
import { frequencyLabels, income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { daysFrom, type ArchiveTarget, type RecurringItem } from '@/lib/recurring';

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

type OccurrenceProps = { item: RecurringItem; dated: boolean; today: string; busy: boolean; categories?: readonly Category[]; onEdit?: (record: Entry) => void; onOpen?: (item: RecurringItem) => void; onPay: (item: RecurringItem) => void; onSkip: (item: RecurringItem) => void; /** Undoes a skip: the occurrence is due again. */onRestore?: (item: RecurringItem) => void; onArchive?: () => void; onDelete?: (target: ArchiveTarget) => void };

/** A schedule's ⋯ menu: Edit, Skip while an occurrence is open, then Archive and Delete where they are offered. */
function scheduleMenu(t: (key: string) => string, busy: boolean, { edit, skip, restore, archive, remove }: { edit?: () => void; skip?: () => void; restore?: () => void; archive?: () => void; remove?: () => void }): RowMenuItem[] {
 return [...(edit ? [{ label: t('Edit'), onSelect: edit }] : []), ...(skip ? [{ label: t('Skip this occurrence'), disabled: busy, onSelect: skip }] : []), ...(restore ? [{ label: t('Restore occurrence'), disabled: busy, onSelect: restore }] : []), ...(archive ? [{ label: t('Archive'), disabled: busy, onSelect: archive }] : []), ...(remove ? [{ label: t('Delete'), deletes: true, disabled: busy, onSelect: remove }] : [])];
}

/** An occurrence's ⋯ menu. Archiving takes the whole schedule out of Recurring; its recorded payments stay. Loan payments follow their loan instead, so they offer only Edit. */
function occurrenceMenu(t: (key: string) => string, busy: boolean, item: RecurringItem, actions: Parameters<typeof scheduleMenu>[2]) {
 return scheduleMenu(t, busy, item.installment ? { edit: actions.edit } : actions);
}

/** Tapping a row shows its history when it can, editing sits in the ⋯ menu; without a history view the tap edits. */
function rowActions(t: (key: string, values?: Record<string, string>) => string, item: RecurringItem, onEdit?: (record: Entry) => void, onOpen?: (item: RecurringItem) => void) {
 const edit = onEdit && (() => onEdit(item.record));
 return { edit, open: onOpen ? () => onOpen(item) : edit, openLabel: onOpen ? item.record.name : t('Edit {name}', { name: item.record.name }) };
}

/** A custom category is named, with its own icon, as on Transactions; built-in ones by their translated kind. */
const customCategory = (record: Entry, categories: readonly Category[]) => record.custom_category_id ? categories.find(row => row.id === record.custom_category_id)?.name : undefined;
/** The line under an occurrence's name: how often, its category and, in the dated list, its day. */
const occurrenceDetail = (t: (key: string) => string, locale: string, item: RecurringItem, category: string | undefined, dated: boolean) =>
 [t(frequencyLabels[item.installment ? 'Monthly' : item.record.frequency]), category ?? t(item.record.kind), dated ? formatDate(item.date, locale) : null].filter(Boolean).join(' · ');

/** One scheduled income or bill on its day: its status, the scheduled amount, and recording, skipping or archiving it. */
export function OccurrenceRow({ item, dated, today, busy, categories = [], onEdit, onOpen, onPay, onSkip, onRestore, onArchive, onDelete }: OccurrenceProps) {
 const { t, locale } = useLanguage();
 // A payment is recorded once it happens: before its date the button waits and says when. A recorded one takes further payments; a skipped one none.
 const early = !item.installment && item.date > today, pending = item.status === 'due' || item.status === 'overdue';
 const { edit, open, openLabel } = rowActions(t, item, onEdit, onOpen);
 const paid = item.status === 'paid';
 const category = customCategory(item.record, categories);
 const status = <OccurrenceStatus item={item} today={today}/>;
 const menu = occurrenceMenu(t, busy, item, { edit: onOpen && edit, skip: pending ? () => onSkip(item) : undefined, restore: item.status === 'skipped' && onRestore ? () => onRestore(item) : undefined, archive: onArchive, remove: onDelete && (() => onDelete({ source: 'record', record: item.record })) });
 return <li className="recurring-row" data-status={item.status} data-editable={open ? '' : undefined} onClick={rowTap(open)}>
  <span className="transaction-merchant"><DoneTick done={paid}/><CategoryIcon kind={category ?? item.record.kind}/><RowName name={shownName(item.record, t)} label={openLabel} onOpen={open} detail={occurrenceDetail(t, locale, item, category, dated)}/></span>
  {status}
  <strong className={income.includes(item.record.kind) ? 'transaction-amount positive' : 'transaction-amount'}>{formatMoney(item.amount, item.record.currency, locale)}</strong>
  <div className="row-actions"><span title={early ? t('You can record it from {date}.', { date: formatDate(item.date, locale) }) : undefined}><Button size="sm" variant="outline" disabled={busy || early || item.status === 'skipped'} onClick={() => onPay(item)}>{t('Record payment')}</Button></span>
   {menu.length > 0 && <RowMenu label={t('Actions for {name}', { name: item.record.name })} items={menu}/>}
  </div>
 </li>;
}

/** What a settled payment brought in or paid out against its schedule, as it was entered (its own currency), beside the
 * scheduled amount in the schedule's currency; one in another currency that could not be converted says so rather
 * than showing a figure in the wrong currency. Open ones say when. Recurring shows entered amounts (AGENTS.md). */
function OccurrenceStatus({ item, today }: { item: RecurringItem; today: string }) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const label = t(item.direction === 'income' ? 'Received' : 'Paid');
 if (item.status === 'paid' && item.recorded === null) return <span className="status-badge">{label} · {t('Exchange rate unavailable.')}</span>;
 if (item.status === 'paid') { const recorded = item.recorded ?? item.amount, shown = item.entered ?? { amount: recorded, currency: item.record.currency }; return <ProgressLine value={recorded} target={item.amount} tone={item.direction} label={label + ' · ' + formatMoney(shown.amount, shown.currency, locale)}/>; }
 if (item.status === 'skipped') return <span className="status-badge">{t('Skipped')}</span>;
 return <span className={item.status === 'overdue' ? 'status-badge is-overdue' : 'status-badge'}>{dueLabel(today, item.date)}</span>;
}

/** Archived incomes and bills, folded at the foot of the page, each with Restore. Only when there are some: an empty fold is just noise. */
export function ArchivedFold({ records, busy, onRestore }: { records: Entry[]; busy: boolean; onRestore: (target: ArchiveTarget) => void }) {
 const { t, locale } = useLanguage();
 if (!records.length) return null;
 const restore = (target: ArchiveTarget, name: string, detail: string, amount: string) => <li key={target.record.id}><span>{[name, detail, amount].join(' · ')}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => onRestore(target)}>{t('Restore')}</Button></li>;
 return <details className="panel tools-panel"><summary>{t('Archived')}<Count value={records.length}/></summary><ul className="tool-list">
  {records.map(record => restore({ source: 'record', record }, record.name, t(record.kind), formatMoney(record.amount, record.currency, locale)))}
 </ul></details>;
}
