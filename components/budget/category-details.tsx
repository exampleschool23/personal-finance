"use client";
import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { HistoryChart } from '@/components/presentation-foundation/history-chart';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { remainingTone, type BudgetHistory, type BudgetRow } from '@/lib/budget';
import { categoryMonth } from '@/lib/budget-details';
import type { Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatMonthYear, formatPercent } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { useCategoryName } from './budget-rows';

type Props = { row: BudgetRow; history: BudgetHistory; data: Pick<PlanningData, 'records' | 'investmentLinks'>; splits: readonly TransactionSplit[]; bills: Entry[]; month: string; today: string; currency: string;
 rates?: number | Record<string, number>; onEditBill?: (bill: Entry) => void; onClose: () => void };

/** A Budget category at a glance, opened by tapping its name: this month against the plan, who the money went to or came
 * from, its recurring bills, the last months against their plans, and each payment. It only reads; Edit is in the row's ⋯ menu. */
export function CategoryDetailsDialog({ row, history, data, splits, bills, month, today, currency, rates, onEditBill, onClose }: Props) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const { show } = useDisplayMoney();
 const details = useMemo(() => categoryMonth(data, row.key, month, { splits, today, currency, rates }), [data, splits, row.key, month, today, currency, rates]);
 const money = (value: number) => formatMoney(value, currency, locale);
 const income = row.direction === 'income';
 const accounts = useMemo(() => new Map(data.records.map(record => [record.id, record.name])), [data.records]);
 const points = history.months.map(item => ({ month: item.month, recorded: item.amount, scheduled: item.planned ?? 0 }));
 const label = (payee: string) => payee || name(row);
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="recurring-details budget-details sm:max-w-2xl">
  <header className="recurring-details-head"><CategoryIcon kind={row.custom ? row.name : row.key}/><div><DialogTitle>{name(row)}</DialogTitle><DialogDescription>{[formatMonthYear(month, locale), t(row.group)].join(' · ')}</DialogDescription></div></header>
  <Summary row={row} history={history} money={money} income={income}/>
  {details.payees.length > 0 && <section className="recurring-details-history" aria-label={t(income ? 'Where the money came from' : 'Where the money went')}>
   <h3>{t(income ? 'Where the money came from' : 'Where the money went')}</h3>
   <ul>{details.payees.slice(0, 8).map(payee => <li key={payee.name.toLocaleLowerCase()}>
    <span>{label(payee.name)}</span>
    <strong className={income ? 'positive' : undefined}>{money(payee.amount)}{details.total > 0 && <small>{formatPercent(payee.amount / details.total * 100, locale, 0)}</small>}</strong>
   </li>)}</ul>
  </section>}
  {bills.length > 0 && <section className="recurring-details-history" aria-label={t('Recurring')}>
   <h3>{t('Recurring')}</h3>
   <ul>{bills.map(bill => <li key={bill.id}>
    <span>{onEditBill ? <Button type="button" variant="link" size="sm" onClick={() => onEditBill(bill)}>{bill.name}</Button> : bill.name}</span>
    <strong>{show(bill.amount, bill.currency)}</strong>
   </li>)}</ul>
  </section>}
  <section className="recurring-details-chart" aria-label={t('History')}>
   <div className="recurring-details-bar"><h3>{t('History')}</h3></div>
   {points.some(point => point.recorded || point.scheduled) ? <HistoryChart points={points} currency={currency} fill={income ? 'var(--positive)' : 'var(--foreground)'} done={t(income ? 'Received' : 'Spent')} outline={t('Planned')}/> : <EmptyState icon={<BarChart3 aria-hidden="true"/>} description={t('Nothing recorded in this period.')}/>}
  </section>
  {details.payments.length > 0 && <section className="recurring-details-history" aria-label={t('Transactions')}>
   <h3>{t('Transactions')}</h3>
   <ul>{details.payments.slice(0, 30).map(payment => <li key={payment.id}>
    <span>{label(payment.name)}<small className="muted">{[formatDate(payment.date, locale), payment.record?.account_id && accounts.get(payment.record.account_id)].filter(Boolean).join(' · ')}</small></span>
    <strong className={income ? 'positive' : undefined}>{payment.amount === null ? '—' : money(payment.amount)}</strong>
   </li>)}</ul>
   {details.missing > 0 && <p role="status" className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
  </section>}
 </DialogContent></Dialog>;
}

/** The three tiles: this month against the plan, what is left of it (and its share), and the average with last month beside it.
 * Every tile carries a second line when there is a plan, so none is left with a blank bottom half. */
function Summary({ row, history, money, income }: { row: BudgetRow; history: BudgetHistory; money: (value: number) => string; income: boolean }) {
 const { t, locale } = useLanguage();
 const planned = row.budget !== null;
 const share = planned && row.remaining !== null && row.budget! > 0 ? formatPercent(row.remaining / row.budget! * 100, locale, 0) : null;
 return <StatTiles columns={3} label={t('Summary')}>
  <StatTile label={t(income ? 'Received this month' : 'Spent this month')} value={money(row.actual)} tone={income && row.actual > 0 ? 'positive' : undefined}>{planned && <p>{t('of {amount}', { amount: money(row.budget!) })}</p>}</StatTile>
  <StatTile label={t('Remaining')} value={row.remaining === null ? '—' : money(row.remaining)} tone={!income && remainingTone(row.remaining) === 'negative' ? 'negative' : undefined}>{share && <p>{t('{percent} of {amount}', { percent: share, amount: money(row.budget!) })}</p>}</StatTile>
  <StatTile label={t('Average a month')} value={money(history.average)}>{planned && <p>{t('Last month')} {money(history.lastMonth)}</p>}</StatTile>
 </StatTiles>;
}
