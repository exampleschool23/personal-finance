"use client";
import { Goal as GoalIcon, ReceiptText } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';
import { expenses, income, normalizeEntry, type Entry } from '@/lib/finance';
import { formatDate, formatMoney } from '@/lib/format';
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
  <PanelTitle title={<>{t('Transactions')} <span className="panel-figure">{t('Most recent')}</span></>}><DrawerLink href="/income-expenses">{t('View all')}</DrawerLink></PanelTitle>
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
