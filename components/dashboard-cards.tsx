"use client";
import { ArrowDown, ArrowUp, CalendarDays, ChartPie, Goal as GoalIcon, ReceiptText } from 'lucide-react';
import { BudgetProgress } from '@/components/budget-page';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useBudget } from '@/hooks/use-budget';
import { budgetCategories, budgetedIn, budgetReadRange, budgetRows, flexBucketKey, leftToBudget, monthActuals, monthsBetween, remainingTone, shiftMonth } from '@/lib/budget';
import { dashboardCardLabels, dashboardCards, defaultDashboardLayout, moveCard, pinnedCard, toggleCard, type DashboardLayout } from '@/lib/dashboard-layout';
import { expensePlanMonth } from '@/lib/expense-plans';
import type { MarketData } from '@/lib/market';
import type { TransactionSplit } from '@/lib/transaction-tools';
import { weeklyRecap } from '@/lib/weekly-recap';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';
import { expenses, income, normalizeEntry, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatMonthYear } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { emptyPlanning, type Goal, type PlanningData } from '@/lib/planning';

/** The most recent income and spending, newest first: Monarch's "Transactions · Most recent" card. */
export function recentTransactions(records: Entry[], today: string, limit = 5) {
 return records.filter(record => record.frequency === 'Once' && record.date <= today && (income.includes(record.kind) || expenses.includes(record.kind)))
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, limit);
}

export function RecentTransactionsCard({ owner = null, demo = false, revision = 0, data: provided }: { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData }) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const remote = useOwnerResource('/api/planning?scope=review&month=' + today.slice(0, 7), owner, !!owner && !demo, revision, emptyPlanning);
 const records = owner && !demo ? remote.data.records.map(normalizeEntry) : provided.records;
 const recent = recentTransactions(records, today);
 return <section className="panel overview-panel dashboard-transactions">
  <PanelTitle title={<>{t('Transactions')} <span className="panel-figure">{t('Most recent')}</span></>}><DrawerLink href="/transactions">{t('View all')}</DrawerLink></PanelTitle>
  {owner && !demo && remote.loading ? <LoadingPlaceholder label={t('Loading records…')} rows={4}/> : recent.length ? <ul className="overview-list overview-due">{recent.map(record => {
   const incoming = income.includes(record.kind);
   return <li key={record.id}><CategoryIcon kind={record.kind}/><span>{record.name}<small>{t(record.kind)} · {formatDate(record.date, locale)}</small></span><strong className={incoming ? 'positive' : undefined}>{incoming ? '+' : ''}{formatMoney(record.amount, record.currency, locale)}</strong></li>;
  })}</ul> : <EmptyState icon={<ReceiptText/>} description={t('No transactions recorded this month or last.')}/>}
 </section>;
}

/** Open savings goals by priority, with progress: Monarch's "Goals · Your top priorities" card. */
export function topGoals(goals: Goal[], limit = 2) {
 return goals.filter(goal => !goal.archived && !goal.completed_on).sort((a, b) => (a.funding_priority ?? 99) - (b.funding_priority ?? 99)).slice(0, limit);
}

export function GoalsCard({ goals, currency }: { goals: Goal[]; currency: string }) {
 const { t, locale } = useLanguage();
 const top = topGoals(goals);
 return <section className="panel overview-panel dashboard-goals">
  <PanelTitle title={<>{t('Goals')} <span className="panel-figure">{t('Your top priorities')}</span></>}><DrawerLink href="/goals">{t('View all')}</DrawerLink></PanelTitle>
  {top.length ? <ul className="dashboard-goal-list">{top.map(goal => {
   const unit = goal.currency ?? currency, progress = goal.target > 0 ? Math.min(100, goal.allocated / goal.target * 100) : 0;
   return <li key={goal.id}><span className="dashboard-goal-cover" aria-hidden="true">{goalEmoji(goal)}</span><div><p><span>{goal.name}</span><strong>{formatMoney(goal.allocated, unit, locale)}</strong></p><div className="progress-track"><div style={{ width: `${progress}%` }}/></div><small>{t('{amount} target', { amount: formatMoney(goal.target, unit, locale) })}{goal.target_date ? ' · ' + formatDate(goal.target_date, locale) : ''}</small></div></li>;
  })}</ul> : <EmptyState icon={<GoalIcon/>} description={t('Set a goal to watch your savings grow.')}><DrawerLink href="/goals">{t('Add goal')}</DrawerLink></EmptyState>}
 </section>;
}

/** Monarch's weekly recap: last week's money in and out against the week before, where most went, and what is due this week. */
export function WeeklyRecapCard({ owner = null, demo = false, revision = 0, data: provided, currency, market }: { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData; currency: string; market: MarketData | null }) {
 const { t, locale } = useLanguage();
 const today = depositToday(), month = today.slice(0, 7);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${month}&from=${shiftMonth(month, -1)}`, owner, !!owner && !demo, revision, emptyPlanning);
 const data = owner && !demo ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided;
 const recap = weeklyRecap(data.records, data.occurrences, today, currency, market?.rates ?? market?.fx?.rate);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const topName = recap.top ? data.categories.find(category => category.id === recap.top!.key)?.name ?? t(recap.top.key) : null;
 const net = recap.received - recap.spent;
 return <section className="panel overview-panel weekly-recap" aria-label={t('Your weekly recap')}>
  <PanelTitle title={<>{t('Your weekly recap')} <span className="panel-figure">{formatDate(recap.from, locale)} – {formatDate(recap.to, locale)}</span></>}/>
  {owner && !demo && remote.loading ? <LoadingPlaceholder label={t('Loading records…')} rows={3}/> : !recap.received && !recap.spent ? <EmptyState icon={<CalendarDays/>} description={t('A quiet week. Record income and spending to see your recap.')}/> : <ul className="weekly-recap-list">
   <li><span aria-hidden="true">💰</span><p>{net >= 0 ? t('You saved {amount} last week.', { amount: money(net) }) : t('You spent {amount} more than you earned last week.', { amount: money(-net) })}</p></li>
   <li><span aria-hidden="true">📉</span><p>{recap.spendingChange > 0 ? t('{amount} more spending than the week before', { amount: money(recap.spendingChange) }) : recap.spendingChange < 0 ? t('{amount} less spending than the week before', { amount: money(-recap.spendingChange) }) : t('Same spending as the week before')}</p></li>
   {recap.top && topName && <li><span aria-hidden="true">🏷</span><p>{t('Top spending: {category} · {amount}', { category: topName, amount: money(recap.top.amount) })}</p></li>}
   <li><span aria-hidden="true">📅</span><p>{recap.upcoming.count ? t('{count} bills due this week · {amount}', { count: recap.upcoming.count, amount: money(recap.upcoming.total) }) : t('No bills due this week')}</p></li>
  </ul>}
 </section>;
}

/** This month's budget at a glance: planned spending against what is spent, and the categories closest to their limit. */
export function BudgetCard({ owner = null, demo = false, revision = 0, data: provided, currency, market, splits }: { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData; currency: string; market: MarketData | null; splits: TransactionSplit[] }) {
 const { t, locale } = useLanguage();
 const today = depositToday(), month = expensePlanMonth();
 const budget = useBudget(owner, demo, revision);
 // Rollover categories need every month since their rollover started.
 const range = budgetReadRange(month, 'month', budgetCategories(provided.categories, budget.state.categories));
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${month}&from=${range.from}`, owner, !!owner && !demo, revision, emptyPlanning);
 const data = owner && !demo ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided;
 const rates = market?.rates ?? market?.fx?.rate;
 const history = new Map(monthsBetween(range.from, month).map(item => [item, monthActuals(data, splits, item, currency, today, rates)]));
 const rows = budgetRows(budgetCategories(data.categories, budget.state.categories), budget.state.amounts, history, month, currency, rates).filter(row => row.direction === 'expense' && !row.excluded);
 const flexible = budget.state.mode === 'flex' ? budgetedIn(budget.state.amounts, flexBucketKey, month, currency, rates) ?? 0 : null;
 const planned = leftToBudget(rows, budget.state.mode, flexible, 0).expenses, spent = rows.reduce((sum, row) => sum + row.actual, 0);
 const watched = rows.filter(row => row.budget).sort((a, b) => b.progress - a.progress).slice(0, 3);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const loading = (owner && !demo && remote.loading) || budget.loading;
 return <section className="panel overview-panel dashboard-budget" aria-label={t('Budget')}>
  <PanelTitle title={<>{t('Budget')} <span className="panel-figure">{formatMonthYear(month, locale)}</span></>}><DrawerLink href="/budget">{t('View all')}</DrawerLink></PanelTitle>
  {loading ? <LoadingPlaceholder label={t('Loading records…')} rows={3}/> : planned > 0 ? <>
   <div className="dashboard-budget-total"><p><strong>{money(spent)}</strong><span>{t('of {amount}', { amount: money(planned) })}</span></p><small data-tone={remainingTone(planned - spent)}>{t(planned - spent < 0 ? '{amount} over' : '{amount} remaining', { amount: money(Math.abs(planned - spent)) })}</small></div>
   <BudgetProgress row={{ progress: spent / planned, direction: 'expense', remaining: planned - spent }}/>
   <ul className="overview-list dashboard-budget-list">{watched.map(row => <li key={row.key}><CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{row.custom ? row.name : t(row.name)}<BudgetProgress row={row}/></span><strong data-tone={remainingTone(row.remaining)}>{row.remaining === null ? '—' : money(row.remaining)}</strong></li>)}</ul>
  </> : <EmptyState icon={<ChartPie/>} description={t('Plan this month’s spending to track it here.')}><DrawerLink href="/budget">{t('Set up a budget')}</DrawerLink></EmptyState>}
 </section>;
}

/** Customize: show or hide each dashboard card and move it within its column. */
export function CustomizeDashboardDialog({ layout, onChange, onClose }: { layout: DashboardLayout; onChange: (layout: DashboardLayout) => void; onClose: () => void }) {
 const { t } = useLanguage();
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Customize dashboard')}</DialogTitle>
   {(['left', 'right'] as const).map(column => {
    const cards = layout.order.filter(card => (dashboardCards[column] as readonly string[]).includes(card));
    return <section key={column} className="customize-column" aria-label={t(column === 'left' ? 'Left column' : 'Right column')}>
     <p className="budget-dialog-label">{t(column === 'left' ? 'Left column' : 'Right column')}</p>
     <ul>{cards.map((card, index) => <li key={card}>
      <label className="customize-toggle"><input type="checkbox" checked={!layout.hidden.includes(card)} onChange={() => onChange(toggleCard(layout, card))}/>{t(dashboardCardLabels[card])}</label>
      {card !== pinnedCard && <><Button size="icon" variant="ghost" disabled={index === 0 || cards[index - 1] === pinnedCard} aria-label={t('Move {name} up', { name: t(dashboardCardLabels[card]) })} onClick={() => onChange(moveCard(layout, card, -1))}><ArrowUp size={15}/></Button>
      <Button size="icon" variant="ghost" disabled={index === cards.length - 1} aria-label={t('Move {name} down', { name: t(dashboardCardLabels[card]) })} onClick={() => onChange(moveCard(layout, card, 1))}><ArrowDown size={15}/></Button></>}
     </li>)}</ul>
    </section>;
   })}
   <div className="record-form-footer"><Button variant="outline" onClick={() => onChange(defaultDashboardLayout)}>{t('Reset to default')}</Button><Button onClick={onClose}>{t('Done')}</Button></div>
  </DialogContent>
 </Dialog>;
}
