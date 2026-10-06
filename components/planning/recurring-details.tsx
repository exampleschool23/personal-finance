"use client";
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { SeriesLegend, toggleKey } from '@/components/presentation-foundation/series-legend';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';
import { frequencyLabels, type Entry } from '@/lib/finance';
import { formatCompactMoney, formatDate, formatMoney, formatMonthShort, formatMonthYear, formatNumber, formatPercent } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import type { RecurringItem } from '@/lib/recurring';
import { nextOccurrence, scheduleTrack } from '@/lib/recurring-history';
import { useDueLabel } from './recurring-rows';
import { BarChart3 } from 'lucide-react';

type Props = { item: RecurringItem; data: PlanningData; today: string; onClose: () => void; onEdit?: (record: Entry) => void; onPay?: (item: RecurringItem) => void };
type Track = ReturnType<typeof scheduleTrack>;

/** The details dialog the Recurring list opens on a tap: `open` shows an occurrence's schedule, `dialog` renders it. Edit and Record payment close it first. */
export function useRecurringDetails(data: PlanningData, today: string, onEdit: ((record: Entry) => void) | undefined, onPay: (item: RecurringItem) => void) {
 const [item, setItem] = useState<RecurringItem | null>(null);
 const close = () => setItem(null);
 const edit = onEdit && ((record: Entry) => { close(); onEdit(record); });
 return { open: setItem, dialog: item && <RecurringDetails item={item} data={data} today={today} onClose={close} onEdit={edit} onPay={next => { close(); onPay(next); }}/> };
}

/** Month by month, what was recorded (solid) inside the outline of what was scheduled, so a short payment shows an unfilled top. */
function HistoryChart({ track, currency, fill, done }: { track: Track; currency: string; fill: string; done: string }) {
 const { t, locale } = useLanguage();
 const [hidden, setHidden] = useState<string[]>([]);
 const money = (value: number) => formatMoney(value, currency, locale);
 const names: Record<string, string> = { recorded: done, scheduled: t('Scheduled payment') };
 return <>
  <div className="portfolio-chart"><ResponsiveContainer width="100%" height={220}><BarChart data={track.points} accessibilityLayer margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
   <CartesianGrid stroke="var(--border)" strokeOpacity={.6} strokeDasharray="2 6" vertical={false}/>
   <XAxis xAxisId="scheduled" dataKey="month" hide/>
   <XAxis xAxisId="recorded" dataKey="month" tickFormatter={month => formatMonthShort(String(month), locale)} minTickGap={16} axisLine={false} tickLine={false} tickMargin={10}/>
   <YAxis width="auto" tickFormatter={amount => formatCompactMoney(Number(amount), currency, locale)} axisLine={false} tickLine={false} tickMargin={8}/>
   <Tooltip cursor={{ fill: 'var(--accent)', fillOpacity: .45 }} labelFormatter={month => formatMonthYear(String(month), locale)} formatter={(amount, name) => [money(Number(amount)), names[String(name)] ?? name]} contentStyle={{ background: 'var(--background)', borderColor: 'var(--border)', borderRadius: 12 }}/>
   {!hidden.includes('scheduled') && <Bar xAxisId="scheduled" dataKey="scheduled" name="scheduled" fill="transparent" stroke="var(--muted-foreground)" strokeDasharray="4 3" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false}/>}
   {!hidden.includes('recorded') && <Bar xAxisId="recorded" dataKey="recorded" name="recorded" fill={fill} fillOpacity={.8} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false}/>}
  </BarChart></ResponsiveContainer></div>
  <SeriesLegend items={[{ key: 'recorded', label: done, swatch: <i style={{ background: fill }}/> }, { key: 'scheduled', label: t('Scheduled payment'), swatch: <i className="recurring-details-key"/> }]} hidden={hidden} onToggle={key => setHidden(previous => toggleKey(previous, key))}/>
 </>;
}

/** Each occurrence in the period, newest first: its date, whether it was settled, and what came against what was scheduled. */
function PaymentList({ items, currency, today, done, income }: { items: RecurringItem[]; currency: string; today: string; done: string; income: boolean }) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const money = (value: number) => formatMoney(value, currency, locale);
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

/** A scheduled income or bill at a glance: what came in or went out month by month against what was scheduled, the totals, and each past payment. Edit and Record payment sit at its foot. */
export function RecurringDetails({ item, data, today, onClose, onEdit, onPay }: Props) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const [months, setMonths] = useState(12);
 const { record, direction } = item;
 const track = useMemo(() => scheduleTrack(item, data, today, months), [item, data, today, months]);
 const next = useMemo(() => nextOccurrence(item, data, today), [item, data, today]);
 const money = (value: number) => formatMoney(value, record.currency, locale);
 const income = direction === 'income';
 const done = t(income ? 'Received' : 'Paid'), fill = income ? 'var(--positive)' : 'var(--foreground)';
 const early = next && !item.installment && next.date > today;
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="recurring-details sm:max-w-2xl">
  <header className="recurring-details-head"><CategoryIcon kind={record.kind}/><div><DialogTitle>{record.name}</DialogTitle><DialogDescription>{[t(frequencyLabels[item.installment ? 'Monthly' : record.frequency]), t(record.kind), money(item.amount)].join(' · ')}</DialogDescription></div></header>
  <StatTiles columns={3} label={t('Summary')}>
   <StatTile label={t(income ? 'Received in this period' : 'Paid in this period')} value={money(track.recorded)} tone={income && track.recorded > 0 ? 'positive' : undefined}>{track.percent !== null && <p>{t('{percent} of {amount}', { percent: formatPercent(track.percent, locale, 0), amount: money(track.scheduled) })}</p>}</StatTile>
   <StatTile label={t('Average a month')} value={money(track.average)}/>
   <StatTile label={t('Next payment')} rolling={false} value={next ? formatDate(next.date, locale) : '—'}>{next && <p className={next.status === 'overdue' ? 'negative' : undefined}>{dueLabel(today, next.date)}</p>}</StatTile>
  </StatTiles>
  <section className="recurring-details-chart" aria-label={t('History')}>
   <div className="recurring-details-bar"><h3>{t('History')}</h3><Segmented label={t('History period')} options={[6, 12, 24].map(value => ({ value, label: t('{count} months', { count: formatNumber(value, locale, 0) }) }))} value={months} onChange={setMonths}/></div>
   {track.scheduled > 0 ? <HistoryChart track={track} currency={record.currency} fill={fill} done={done}/> : <EmptyState icon={<BarChart3 aria-hidden="true"/>} description={t('Nothing recorded in this period.')}/>}
  </section>
  <PaymentList items={track.history} currency={record.currency} today={today} done={done} income={income}/>
  <FormFooter onCancel={onClose} cancelLabel={t('Close')}>
   {onEdit && <Button type="button" variant="outline" onClick={() => onEdit(record)}>{t('Edit')}</Button>}
   {onPay && next && <Button type="button" disabled={early} title={early ? t('You can record it from {date}.', { date: formatDate(next.date, locale) }) : undefined} onClick={() => onPay(next)}>{t('Record payment')}</Button>}
  </FormFooter>
 </DialogContent></Dialog>;
}
