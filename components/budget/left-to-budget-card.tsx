"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { budgetTypeLabels, budgetTypes, remainingTone, type BudgetMode, type BudgetRow, type LeftToBudget } from '@/lib/budget';
import { formatMoney } from '@/lib/format';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { BudgetProgress, useCategoryName } from './budget-rows';

export type BudgetFocus = 'summary' | 'income' | 'expenses';

/** The right-hand card: money not yet given a job, with Summary / Income / Expenses tabs. The Budget page passes `tab` and `onTab`, so the
 * same tabs also narrow its list to that section; without them the card keeps its own tab. */
export function LeftToBudgetCard({ left, rows, mode, currency, tab: chosen, onTab }: { left: LeftToBudget; rows: BudgetRow[]; mode: BudgetMode; currency: string; tab?: BudgetFocus; onTab?: (tab: BudgetFocus) => void }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const [own, setOwn] = useState<BudgetFocus>('summary');
 const tab = chosen ?? own, setTab = onTab ?? setOwn;
 const money = (value: number | null) => value === null ? '—' : formatMoney(value, currency, locale);
 const tone = remainingTone(left.left);
 const income = rows.filter(row => row.direction === 'income' && !row.excluded && (row.budget || row.actual || row.missing));
 const spending = rows.filter(row => row.direction === 'expense' && !row.excluded);
 const buckets = budgetTypes.map(type => {
  const items = spending.filter(row => row.type === type);
  // A plan no rate converts leaves the bucket's planned and remaining unknown.
  const planned = type === 'flexible' && mode === 'flex' ? left.flexible ?? (left.missing ? null : 0) : items.some(row => row.missing) ? null : items.reduce((sum, row) => sum + (row.budget ?? 0) + row.rolloverIn, 0);
  const spent = items.reduce((sum, row) => sum + row.actual, 0);
  return { type, planned, spent, remaining: planned === null ? null : planned - spent };
 }).filter(bucket => bucket.planned !== 0 || bucket.spent);
 return <aside className="panel budget-left" aria-label={t('Left to budget')}>
  <div className="budget-left-figure" data-tone={tone}><strong><RollingText text={money(left.left)}/></strong><span>{t('Left to budget')}<InfoHint>{t('Planned income minus planned spending and goal contributions. Green means money still needs a job; red means you plan to spend more than you earn.')}</InfoHint></span></div>
  <Segmented label={t('Left to budget')} options={[{ value: 'summary', label: t('Summary') }, { value: 'income', label: t('Income') }, { value: 'expenses', label: t('Expenses') }] as const} value={tab} onChange={setTab} className="budget-left-tabs"/>
  {tab === 'summary' && <dl className="budget-left-summary">
   <div><dt>{t('Planned income')}</dt><dd><RollingText text={money(left.income)}/></dd></div>
   <div><dt>{t('Planned spending')}</dt><dd><RollingText text={money(left.expenses)}/></dd></div>
   <div><dt>{t('Contributions')}</dt><dd><RollingText text={money(left.contributions)}/></dd></div>
   <div className="budget-left-total"><dt>{t('Left to budget')}</dt><dd data-tone={tone}><RollingText text={money(left.left)}/></dd></div>
  </dl>}
  {tab === 'income' && (income.length ? <ul className="budget-left-list">{income.map(row => <li key={row.key}><p><span>{name(row)}</span><small>{t('{amount} planned', { amount: money(row.missing ? null : row.budget ?? 0) })}</small></p><BudgetProgress row={row}/><p><small>{t('{amount} earned', { amount: money(row.actual) })}</small><small>{t('{amount} remaining', { amount: money(row.missing ? null : Math.max(0, (row.budget ?? 0) - row.actual)) })}</small></p></li>)}</ul> : <p className="budget-left-empty">{t('Add planned income to see it here.')}</p>)}
  {tab === 'expenses' && (buckets.length ? <ul className="budget-left-list">{buckets.map(bucket => <li key={bucket.type}><p><span>{t(budgetTypeLabels[bucket.type])}</span><small>{t('{amount} planned', { amount: money(bucket.planned) })}</small></p><BudgetProgress row={{ progress: bucket.planned !== null && bucket.planned > 0 ? bucket.spent / bucket.planned : bucket.spent > 0 ? 1 : 0, direction: 'expense', remaining: bucket.remaining }}/><p><small>{t('{amount} spent', { amount: money(bucket.spent) })}</small><small data-tone={remainingTone(bucket.remaining)}>{t((bucket.remaining ?? 0) < 0 ? '{amount} over' : '{amount} remaining', { amount: money(bucket.remaining === null ? null : Math.abs(bucket.remaining)) })}</small></p></li>)}</ul> : <p className="budget-left-empty">{t('You haven’t added any expense budgets yet. Once you do, a summary appears here.')}</p>)}
 </aside>;
}
