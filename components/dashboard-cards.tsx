"use client";
import { ChartPie, Goal as GoalIcon, ReceiptText } from 'lucide-react';
import { BudgetProgress } from '@/components/budget/budget-rows';
import type { WorkspaceBudget } from '@/hooks/use-budget';
import { budgetCategories, budgetReadRange, budgetRows, budgetRowsForMode, leftToBudget, monthActuals, monthsBetween, remainingTone } from '@/lib/budget';
import { flexPlan } from '@/lib/budget-schedules';
import { marketRates, type MarketData } from '@/lib/market';
import { signedAmount } from '@/lib/transaction-list';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { depositMonth, depositToday } from '@/lib/deposit-interest';
import { expenses, income, normalizeEntry, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatMonthYear, formatPercent } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { orderedGoals } from '@/lib/goal-order';
import { goalCurrency, goalCurrentValue } from '@/lib/goal-projection';
import { investmentGoalCompletion } from '@/lib/investment-goals';
import { emptyPlanning, type Goal, type PlanningData } from '@/lib/planning';
import { shownName } from '@/lib/record-names';

/** The most recent income and spending, newest first: the "Transactions · Most recent" card. */
export function recentTransactions(records: Entry[], today: string, limit = 5) {
 return records.filter(record => record.frequency === 'Once' && record.date <= today && (income.includes(record.kind) || expenses.includes(record.kind)))
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, limit);
}

export function RecentTransactionsCard({ owner = null, demo = false, revision = 0, data: provided }: { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData }) {
 const { t, locale } = useLanguage();
 const { show } = useDisplayMoney();
 const today = depositToday();
 const remote = useOwnerResource('/api/planning?scope=review&month=' + today.slice(0, 7), owner, !!owner && !demo, revision, emptyPlanning);
 const records = owner && !demo ? remote.data.records.map(normalizeEntry) : provided.records;
 const recent = recentTransactions(records, today);
 return <section className="panel overview-panel dashboard-transactions">
  <PanelTitle title={t('Transactions')}><DrawerLink href="/transactions">{t('View all')}</DrawerLink></PanelTitle>
  {owner && !demo && remote.loading ? <LoadingPlaceholder label={t('Loading records…')} rows={4}/> : recent.length ? <ul className="overview-list overview-due">{recent.map(record => {
   const incoming = income.includes(record.kind);
   return <li key={record.id}><CategoryIcon kind={record.kind}/><span>{shownName(record, t)}<small>{t(record.kind)} · {formatDate(record.date, locale)}</small></span><strong className={incoming ? 'positive' : undefined}>{incoming ? '+' : ''}{show(Math.abs(signedAmount(record)), record.currency)}</strong></li>;
  })}</ul> : <EmptyState icon={<ReceiptText/>} description={t('No transactions recorded this month or last.')}/>}
 </section>;
}

/** Open goals in the person's own order (the order on the Goals page): the "Goals · Your top priorities" card. */
export function topGoals(goals: Goal[], order: readonly string[] = [], limit = 2) {
 return orderedGoals(goals.filter(goal => !goal.archived && !goal.completed_on), order).slice(0, limit);
}

/** `netWorth` gives the current net worth in a currency, or null when it cannot be converted. */
export function GoalsCard({ goals, order, data, currency, netWorth }: { goals: Goal[]; order: readonly string[]; data: Pick<PlanningData, 'records' | 'holdingAccounts'>; currency: string; netWorth: (currency: string) => number | null }) {
 const { t, locale } = useLanguage();
 const { show } = useDisplayMoney();
 const top = topGoals(goals, order);
 return <section className="panel overview-panel dashboard-goals">
  <PanelTitle title={t('Goals')}><DrawerLink href="/goals">{t('View all')}</DrawerLink></PanelTitle>
  {top.length ? <ul className="dashboard-goal-list">{top.map(goal => {
   const unit = goalCurrency(goal, data, currency), investment = goal.kind === 'investment';
   const value = investment ? null : goalCurrentValue(goal, netWorth(unit));
   const percent = investment ? investmentGoalCompletion(goal, data) : value === null || !(goal.target > 0) ? null : Math.max(0, Math.min(100, value / goal.target * 100));
   const amount = investment ? (percent === null ? '—' : formatPercent(percent, locale, 0)) : value === null ? '—' : show(value, unit);
   const target = investment ? null : t('{amount} target', { amount: show(goal.target, unit) });
   const date = goal.target_date ? formatDate(goal.target_date, locale) : null;
   return <li key={goal.id}><span className="dashboard-goal-cover" aria-hidden="true">{goalEmoji(goal)}</span><div><p><span>{goal.name}</span><strong>{amount}</strong></p><div className="progress-track"><div style={{ width: `${percent ?? 0}%` }}/></div><small>{[target, date].filter(Boolean).join(' · ') || t('No target date')}</small></div></li>;
  })}</ul> : <EmptyState icon={<GoalIcon/>} description={t('Set a goal to watch your savings grow.')}><DrawerLink href="/goals">{t('Add goal')}</DrawerLink></EmptyState>}
 </section>;
}

/** Weekly recap: last week's money in and out against the week before, where most went, and what is due this week. */
/** Spent against planned. A plan no rate converts is unknown: it reads — with the note, rather than leaving that amount out. */
function BudgetCardTotal({ plan, spent, currency }: { plan: number | null; spent: number; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 if (plan === null) return <div className="dashboard-budget-total"><p><strong>{money(spent)}</strong><span>{t('of {amount}', { amount: '—' })}</span></p><small>{t('Exchange rate unavailable.')}</small></div>;
 return <>
  <div className="dashboard-budget-total"><p><strong>{money(spent)}</strong><span>{t('of {amount}', { amount: money(plan) })}</span></p><small data-tone={remainingTone(plan - spent)}>{t(plan - spent < 0 ? '{amount} over' : '{amount} remaining', { amount: money(Math.abs(plan - spent)) })}</small></div>
  <BudgetProgress row={{ progress: spent / plan, direction: 'expense', remaining: plan - spent }}/>
 </>;
}

/** This month's budget at a glance: planned spending against what is spent, and the categories closest to their limit.
 * `budget` is the workspace's one Budget (`useWorkspace().budget`), so an edit on Budget shows here at once. */
export function BudgetCard({ owner = null, demo = false, revision = 0, budget, data: provided, currency, market, splits }: { owner?: string | null; demo?: boolean; revision?: number; budget: Pick<WorkspaceBudget, 'state' | 'loading'>; data: PlanningData; currency: string; market: MarketData | null; splits: TransactionSplit[] }) {
 const { t, locale } = useLanguage();
 const today = depositToday(), month = depositMonth();
 const removed = provided.removedKinds ?? [];
 // Rollover categories need every month since their rollover started.
 const range = budgetReadRange(month, 'month', budgetCategories(provided.categories, budget.state.categories, removed));
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${month}&from=${range.from}`, owner, !!owner && !demo, revision, emptyPlanning);
 const data = owner && !demo ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided;
 const rates = marketRates(market);
 const history = new Map(monthsBetween(range.from, month).map(item => [item, monthActuals(data, splits, item, currency, today, rates)]));
 const categories = budgetCategories(data.categories, budget.state.categories, removed);
 const rows = budgetRows(categories, budget.state.amounts, history, month, currency, rates, provided.records).filter(row => row.direction === 'expense' && !row.excluded);
 // The Flexible plan as Budget and the forecasts count it.
 const flexible = budget.state.mode === 'flex' ? flexPlan({ amounts: budget.state.amounts, schedules: provided.records }, categories, month, currency, rates) : null;
 const plan = leftToBudget(rows, budget.state.mode, flexible, 0).expenses, spent = rows.reduce((sum, row) => sum + row.actual, 0);
 // In flex mode flexible categories share one bucket, so only fixed categories keep a budget of their own here, as on the Budget page.
 const watched = budgetRowsForMode(rows, budget.state.mode).filter(row => row.budget).sort((a, b) => b.progress - a.progress).slice(0, 3);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const loading = (owner && !demo && remote.loading) || budget.loading;
 return <section className="panel overview-panel dashboard-budget" aria-label={t('Budget')}>
  <PanelTitle title={<>{t('Budget')} <span className="panel-figure">{formatMonthYear(month, locale)}</span></>}><DrawerLink href="/budget">{t('View all')}</DrawerLink></PanelTitle>
  {loading ? <LoadingPlaceholder label={t('Loading records…')} rows={3}/> : plan === null || plan > 0 ? <>
   <BudgetCardTotal plan={plan} spent={spent} currency={currency}/>
   <ul className="overview-list dashboard-budget-list">{watched.map(row => <li key={row.key}><CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{row.custom ? row.name : t(row.name)}<BudgetProgress row={row}/></span><strong data-tone={remainingTone(row.remaining)}>{row.remaining === null ? '—' : money(row.remaining)}</strong></li>)}</ul>
  </> : <EmptyState icon={<ChartPie/>} description={t('Plan this month’s spending to track it here.')}><DrawerLink href="/budget">{t('Set up a budget')}</DrawerLink></EmptyState>}
 </section>;
}
