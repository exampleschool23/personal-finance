"use client";
import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { HistoryChart } from '@/components/presentation-foundation/history-chart';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { frequencyLabels } from '@/lib/finance';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import type { RecurringItem } from '@/lib/recurring';
import { nextOccurrence, scheduleTrack } from '@/lib/recurring-history';
import { useDueLabel } from './recurring-rows';
import { BarChart3 } from 'lucide-react';

type Props = { item: RecurringItem; data: PlanningData; today: string; onClose: () => void };

/** The details dialog the Recurring list opens on a tap: `open` shows an occurrence's schedule, `dialog` renders it. Edit and
 * Record payment stay on the row, so the dialog only reads; its × closes it. */
export function useRecurringDetails(data: PlanningData, today: string) {
 const [item, setItem] = useState<RecurringItem | null>(null);
 return { open: setItem, dialog: item && <RecurringDetails item={item} data={data} today={today} onClose={() => setItem(null)}/> };
}

/** Each occurrence in the period, newest first: its date, whether it was settled, and what came against what was scheduled. */
function PaymentList({ items, money, today, done, income }: { items: RecurringItem[]; money: (value: number) => string; today: string; done: string; income: boolean }) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const label = (entry: RecurringItem) => entry.status === 'paid' ? done : entry.status === 'skipped' ? t('Skipped') : dueLabel(today, entry.date);
 if (!items.length) return null;
 return <section className="recurring-details-history" aria-label={t('Payments')}>
  <h3>{t('Payments')}</h3>
  <ul>{items.slice(0, 12).map(entry => <li key={entry.key} data-status={entry.status}>
   <span>{formatDate(entry.date, locale)}<span className={entry.status === 'overdue' ? 'status-badge is-overdue' : 'status-badge'}>{label(entry)}</span></span>
   <strong className={entry.status === 'paid' && income ? 'positive' : undefined}>{entry.status === 'paid' ? money(entry.recorded ?? entry.amount) : '—'}<small>{t('of {amount}', { amount: money(entry.amount) })}</small></strong>
  </li>)}</ul>
 </section>;
}

/** A scheduled income or bill at a glance: what came in or went out month by month against what was scheduled, the totals, and each past payment. */
export function RecurringDetails({ item, data, today, onClose }: Props) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const [months, setMonths] = useState(12);
 const { record, direction } = item;
 const track = useMemo(() => scheduleTrack(item, data, today, months), [item, data, today, months]);
 const next = useMemo(() => nextOccurrence(item, data, today), [item, data, today]);
 // Every figure in the display currency; without a rate they read "—" and the chart gives way to a note.
 const { convert, show, currency = record.currency } = useDisplayMoney();
 const money = (value: number) => show(value, record.currency);
 const points = convert(1, record.currency) === null ? null : track.points.map(point => ({ ...point, scheduled: convert(point.scheduled, record.currency)!, recorded: convert(point.recorded, record.currency)! }));
 const income = direction === 'income';
 const done = t(income ? 'Received' : 'Paid'), fill = income ? 'var(--positive)' : 'var(--foreground)';
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="recurring-details sm:max-w-2xl">
  <header className="recurring-details-head"><CategoryIcon kind={record.kind}/><div><DialogTitle>{record.name}</DialogTitle><DialogDescription>{[t(frequencyLabels[item.installment ? 'Monthly' : record.frequency]), t(record.kind), money(item.amount)].join(' · ')}</DialogDescription></div></header>
  <StatTiles columns={3} label={t('Summary')}>
   <StatTile label={t(income ? 'Received in this period' : 'Paid in this period')} value={money(track.recorded)} tone={income && track.recorded > 0 ? 'positive' : undefined}>{track.percent !== null && <p>{t('{percent} of {amount}', { percent: formatPercent(track.percent, locale, 0), amount: money(track.scheduled) })}</p>}</StatTile>
   <StatTile label={t('Average a month')} value={money(track.average)}/>
   <StatTile label={t('Next payment')} rolling={false} value={next ? formatDate(next.date, locale) : '—'}>{next && <p className={next.status === 'overdue' ? 'negative' : undefined}>{dueLabel(today, next.date)}</p>}</StatTile>
  </StatTiles>
  <section className="recurring-details-chart" aria-label={t('History')}>
   <div className="recurring-details-bar"><h3>{t('History')}</h3><Segmented label={t('History period')} options={[6, 12, 24].map(value => ({ value, label: t('{count} months', { count: formatNumber(value, locale, 0) }) }))} value={months} onChange={setMonths}/></div>
   {track.scheduled <= 0 ? <EmptyState icon={<BarChart3 aria-hidden="true"/>} description={t('Nothing recorded in this period.')}/> : points ? <HistoryChart points={points} currency={currency} fill={fill} done={done}/> : <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  </section>
  <PaymentList items={track.history} money={money} today={today} done={done} income={income}/>
 </DialogContent></Dialog>;
}
