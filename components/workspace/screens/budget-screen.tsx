"use client";
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { BudgetGroupCard, BudgetProgress, BudgetRateNotice, BudgetSectionHeader, BudgetTotalRow, ContributionRows, useCategoryName } from '@/components/budget/budget-rows';
import { LeftToBudgetCard, type BudgetFocus } from '@/components/budget/left-to-budget-card';
import { PlannedInput } from '@/components/budget/planned-input';
import { BudgetSettingsDialog, CategorySettingsDialog, type BudgetFigures } from '@/components/budget/settings-dialogs';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { StatTile } from '@/components/presentation-foundation/stat-tile';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { signTone } from '@/components/presentation-foundation/tone';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useBudget } from '@/hooks/use-budget';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { ageOfMoneyTrend } from '@/lib/age-of-money';
import { budgetCategories, budgetedIn, budgetHistory, budgetOverall, budgetReadRange, budgetRows, budgetRowsForMode, flexBucketBudget, flexBucketCategory, flexBucketKey, flexBucketPlan, flexBucketRollover, goalContribution, groupRows, leftToBudget, monthActuals, monthsBetween, suggestedBudget, type BudgetAmount, type BudgetCategory, type BudgetOverall, type BudgetRow, type MonthActuals } from '@/lib/budget';
import { shiftMonth } from '@/lib/calendar-days';
import { depositMonth, depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { formatMoney, formatMonthShort, formatMonthYear, formatNumber, formatYear } from '@/lib/format';
import { convertAmount, marketRates } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';

export function BudgetScreen() {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const { user, demo, reload, currency, market, planning, transactionTools, workspaceLoading } = useWorkspace();
 const budget = useBudget(user, demo, reload);
 const today = depositToday(), thisMonth = depositMonth();
 const [month, setMonth] = useState(thisMonth);
 const [view, setView] = useState<'month' | 'year'>('month');
 const [focus, setFocus] = useState<BudgetFocus>('summary');
 const [closed, setClosed] = useState<Set<string>>(new Set());
 const [unbudgeted, setUnbudgeted] = useState<Set<string>>(new Set());
 const [editing, setEditing] = useState<{ category: BudgetCategory; figures?: BudgetFigures } | null>(null);
 const [settingsOpen, setSettingsOpen] = useState(false);
 const rates = marketRates(market);
 const live = !!user && !demo;
 const removed = planning.data.removedKinds ?? [];

 const settingsOnly = budgetCategories(planning.data.categories, budget.state.categories, removed);
 const range = budgetReadRange(month, view, [...settingsOnly, flexBucketCategory(budget.state.categories)]);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to}&from=${range.from}`, user, live, reload, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const history = useMemo(() => new Map(monthsBetween(range.from, range.to).map(item => [item, monthActuals(data, splits, item, currency, today, rates)])), [range.from, range.to, data, splits, currency, today, rates]);
 const categories = budgetCategories(data.categories, budget.state.categories, removed);
 const flex = budget.state.mode === 'flex';
 const categoryRows = budgetRows(categories, budget.state.amounts, history, month, currency, rates);
 const flexBudget = flex ? flexBucketBudget(budget.state.amounts, categoryRows, month, currency, rates) : null;
 const bucket = flexBucketCategory(budget.state.categories);
 const bucketRollover = flex ? flexBucketRollover(bucket, categories, budget.state.amounts, history, month, currency, rates) : 0;
 const bucketMissing = flex && (flexBudget === null || bucketRollover === null);
 const rows = budgetRowsForMode(categoryRows, budget.state.mode);
 const groups = groupRows(rows, flex);
 const goals = data.goals.filter(goal => goalContribution(goal, today) > 0);
 const contributionOf = (goal: (typeof goals)[number]) => convertAmount(goalContribution(goal, today), goal.currency ?? currency, currency, rates);
 // A contribution no rate converts leaves the total unknown, never counted as zero.
 const missingContributions = goals.filter(goal => contributionOf(goal) === null).length;
 const contributions = missingContributions ? null : goals.reduce((sum, goal) => sum + (contributionOf(goal) ?? 0), 0);
 const left = leftToBudget(rows, budget.state.mode, flexBudget, contributions, missingContributions);
 const customGroups = [...new Set(budget.state.categories.map(item => item.group_name).filter((item): item is string => !!item))];

 const save = (key: string) => (amount: number, forward: boolean) => budget.saveAmount(key, month, amount, currency, forward);
 const historyOf = (key: string) => {
  if (key !== flexBucketKey) return budgetHistory(key, month, history, past => budgetedIn(budget.state.amounts, key, past, currency, rates));
  // The Flexible bucket's history is the sum of its categories.
  const keys = rows.filter(row => row.direction === 'expense' && row.type === 'flexible' && !row.excluded).map(row => row.key);
  return budgetHistory(keys, month, history, past => flexBucketPlan(budget.state.amounts, categories, past, currency, rates));
 };
 // In flex mode a flexible category has no plan of its own; the bucket above it holds the amount.
 const planned = (row: BudgetRow) => flex && row.direction === 'expense' && row.type === 'flexible' ? <span className="budget-pill">—</span> : <PlannedInput key={row.key + month + (row.budget ?? 0)} label={t('Planned for {name}', { name: name(row) })} value={row.missing && row.budget === null ? null : row.budget ?? 0} history={historyOf(row.key)} direction={row.direction} currency={currency} defaultForward={budget.state.applyForward} onSave={save(row.key)}/>;
 async function recalculate() {
  const targets = rows.filter(row => !row.excluded).map(row => ({ key: row.key, amount: suggestedBudget(budgetHistory(row.key, month, history).average) })).filter(item => item.amount > 0);
  if (flex) targets.push({ key: flexBucketKey, amount: suggestedBudget(historyOf(flexBucketKey).average) });
  if (targets.length) await budget.saveAmounts(month, currency, targets.map(target => ({ category_key: target.key, amount: target.amount, applies_forward: true })));
 }
 const toggle = (set: Set<string>, update: (next: Set<string>) => void, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); update(next); };
 const card = (group: (typeof groups)[number]) => {
  const id = group.direction + ':' + group.name;
  const isBucket = flex && group.type === 'flexible';
  const bucketRow = isBucket ? { budget: flexBudget, rolloverIn: bucketRollover ?? 0, rolloverMissing: bucketRollover === null, actual: group.actual, remaining: bucketMissing ? null : (flexBudget ?? 0) + (bucketRollover ?? 0) - group.actual } : null;
  return <BudgetGroupCard key={id} group={bucketRow ? { ...group, budget: bucketRow.budget ?? 0, remaining: bucketRow.remaining ?? 0, missing: group.missing + (bucketMissing ? 1 : 0) } : group} currency={currency}
   open={!closed.has(id)} onToggle={() => toggle(closed, setClosed, id)} showUnbudgeted={unbudgeted.has(id)} onShowUnbudgeted={() => toggle(unbudgeted, setUnbudgeted, id)}
   renderPlanned={planned} onSettings={row => setEditing({ category: row, figures: row.direction === 'expense' ? row : undefined })}
   rolloverIn={bucketRow?.rolloverIn} onGroupSettings={bucketRow ? () => setEditing({ category: bucket, figures: bucketRow }) : undefined}
   header={bucketRow ? <PlannedInput key={'flex' + month + (flexBudget ?? 0)} label={t('Planned for {name}', { name: t('Flexible') })} value={flexBudget} history={historyOf(flexBucketKey)} direction="expense" currency={currency} defaultForward={budget.state.applyForward} onSave={save(flexBucketKey)}/> : undefined}/>;
 };
 const income = groups.filter(group => group.direction === 'income');
 const spending = groups.filter(group => group.direction === 'expense');
 const sum = (list: typeof groups, key: 'budget' | 'actual') => list.reduce((total, group) => total + group[key], 0);
 // A section's plan is unknown (—) while one of its amounts has no usable rate.
 const planOf = (list: typeof groups) => list.some(group => group.missing) ? null : sum(list, 'budget');
 // Like each group's Planned figure, the total includes money rolled over; in flex mode that is the bucket's and the other funds'.
 const spendingPlanned = !flex ? planOf(spending) : left.expenses === null || bucketMissing || spending.some(group => group.missing) ? null : left.expenses + (bucketRollover ?? 0) + rows.filter(row => row.direction === 'expense' && !row.excluded).reduce((total, row) => total + row.rolloverIn, 0);
 const incomePlanned = planOf(income);
 const loading = workspaceLoading || budget.loading || (live ? remote.initialLoading : planning.loading);
 const error = budget.error || (live ? remote.error : planning.error);

 return <div data-page="Budget" className="content budget-content">
  <PageHeader title={t('Budget')} tabs={<Segmented className="page-tabs" as="nav" label={t('Budget view')} options={[{ value: 'month', label: t('Month') }, { value: 'year', label: t('Year') }] as const} value={view} onChange={setView}/>} hint={t(view === 'year' ? 'Past months show actual amounts with the plan below; later months show the plan.' : 'Plan what you expect to earn and spend each month. Actual amounts come from your transactions; remaining is the difference.')}>
   <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t(view === 'year' ? 'Previous year' : 'Previous month')} onClick={() => setMonth(shiftMonth(month, view === 'year' ? -12 : -1))}><ChevronLeft size={16}/></Button>
    {/* The period being planned, between the arrows that move it. */}
    <strong className="budget-period" aria-live="polite">{view === 'year' ? formatYear(Number(month.slice(0, 4)), locale) : formatMonthYear(month, locale)}</strong>
    <Button variant="outline" size="icon" aria-label={t(view === 'year' ? 'Next year' : 'Next month')} onClick={() => setMonth(shiftMonth(month, view === 'year' ? 12 : 1))}><ChevronRight size={16}/></Button>
    <TodayButton current={month === thisMonth} onClick={() => setMonth(thisMonth)}/>
   </div>
   <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings size={16} aria-hidden="true"/>{t('Settings')}</Button>
  </PageHeader>
  <BudgetRateNotice planned={left.missing} actual={history.get(month)?.missing ?? 0}/>
  {error ? <InlineError message={t(error)} onRetry={() => { budget.retry(); remote.retry(); }}/> : loading ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : view === 'year' ? <BudgetYear rows={categories} month={month} history={history} amounts={budget.state.amounts} currency={currency} rates={rates} today={today}/> : <div className="budget-layout">
   {/* Summary shows every section; Income or Expenses in the Left to budget card narrows the list to that side. */}
   <div className="budget-table" data-focus={focus}>
    <div className="budget-section" data-section="income">
    <BudgetSectionHeader title={t('Income')}/>
    {income.map(card)}
    <BudgetTotalRow label={t('Total income')} planned={incomePlanned} actual={sum(income, 'actual')} remaining={incomePlanned === null ? null : incomePlanned - sum(income, 'actual')} direction="income" currency={currency}/>
    </div>
    <div className="budget-section" data-section="expenses">
    <BudgetSectionHeader title={t('Expenses')}/>
    {spending.map(card)}
    <BudgetTotalRow label={t('Total expenses')} planned={spendingPlanned} actual={sum(spending, 'actual')} remaining={spendingPlanned === null ? null : spendingPlanned - sum(spending, 'actual')} direction="expense" currency={currency}/>
    {goals.length > 0 && <>
     <BudgetSectionHeader title={t('Contributions')}/>
     <ContributionRows goals={goals} currency={currency} amountOf={contributionOf}/>
     <BudgetTotalRow label={t('Total contributions')} planned={contributions} actual={0} remaining={contributions} direction="income" currency={currency}/>
    </>}
    </div>
   </div>
   <div className="budget-side">
    <LeftToBudgetCard left={left} rows={rows} mode={budget.state.mode} currency={currency} tab={focus} onTab={setFocus}/>
    <AgeOfMoneyTile records={data.records} currency={currency} today={today} rates={rates}/>
   </div>
  </div>}
  {editing && <CategorySettingsDialog category={editing.category} figures={editing.figures} groups={customGroups} month={month} currency={currency} onSave={budget.saveCategory} onClose={() => setEditing(null)}/>}
  {settingsOpen && <BudgetSettingsDialog mode={budget.state.mode} applyForward={budget.state.applyForward} onSave={budget.saveSettings} onRecalculate={recalculate} onClose={() => setSettingsOpen(false)}/>}
 </div>;
}

/** Age of Money: how many days money sits in cash accounts before it is spent, and its change over 30 days. */
function AgeOfMoneyTile({ records, currency, today, rates }: { records: Entry[]; currency: string; today: string; rates?: number | Record<string, number> }) {
 const { t, locale } = useLanguage();
 const age = useMemo(() => ageOfMoneyTrend(records, currency, today, rates, new Set(records.filter(record => record.kind === 'Cash').map(record => record.id))), [records, currency, today, rates]);
 const days = (count: number) => count === 1 ? t('1 day') : t('{count} days', { count: formatNumber(count, locale, 0) });
 const change = age.change === null ? null : age.change === 0 ? t('No change vs 30 days ago') : t('{change} vs 30 days ago', { change: (age.change > 0 ? '+' : '\u2212') + days(Math.abs(age.change)) });
 return <StatTile label={t('Age of Money')} value={age.days === null ? '—' : days(Math.round(age.days))} hint={<>
  {t('How long money waits before you spend it: the average age of the money behind your last 10 expenses. Income is matched to spending in the order it arrived, across your cash accounts. A higher number means more of a buffer.')}
  {age.skipped > 0 && <> {t('Records without an exchange rate to {currency} are left out: {count}.', { currency, count: formatNumber(age.skipped, locale, 0) })}</>}
 </>}>{change && <p>{change}</p>}</StatTile>;
}

/** The Year view: every month of the year side by side. Past and current months show what happened; later months show the plan. */
function BudgetYear({ rows, month, history, amounts, currency, rates, today }: { rows: BudgetCategory[]; month: string; history: ReadonlyMap<string, MonthActuals>; amounts: BudgetAmount[]; currency: string; rates?: number | Record<string, number>; today: string }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const months = monthsBetween(month.slice(0, 4) + '-01', month.slice(0, 4) + '-12');
 const current = today.slice(0, 7);
 const table = months.map(item => budgetRows(rows, amounts, history, item, currency, rates));
 const visible = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => !row.excluded && table.some(list => list[index].budget !== 0 || list[index].actual));
 // A plan no rate converts (budget null) reads —, and so does a total that would add it.
 const plan = (value: number | null) => value === null ? '—' : formatMoney(value, currency, locale);
 return <section className="panel budget-year">
  {visible.length ? <div className="budget-year-scroll"><table>
   <thead><tr><th scope="col">{t('Category')}</th>{months.map(item => <th scope="col" key={item} data-current={item === current || undefined}>{formatMonthShort(item, locale)}</th>)}<th scope="col">{t('Total')}</th></tr></thead>
   <tbody>{visible.map(({ row, index }) => {
    const cells = table.map(list => list[index]);
    const total = cells.reduce<number | null>((sum, cell, position) => { const value = months[position] <= current ? cell.actual : cell.budget; return sum === null || value === null ? null : sum + value; }, 0);
    return <tr key={row.key}>
     <th scope="row">{name(row)}</th>
     {cells.map((cell, position) => {
      const past = months[position] <= current;
      const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
      if (!cell.actual && cell.budget === 0) return <td key={months[position]} {...marks}>—</td>;
      return <td key={months[position]} {...marks}>
       <span>{past ? formatMoney(cell.actual, currency, locale) : plan(cell.budget)}</span>
       {past && <small>{t('of {amount}', { amount: plan(cell.budget) })}</small>}
       {past && cell.budget ? <BudgetProgress row={cell}/> : null}
      </td>;
     })}
     <td><strong>{plan(total)}</strong></td>
    </tr>;
   })}</tbody>
   <BudgetYearOverall months={months} overall={table.map(budgetOverall)} current={current} currency={currency}/>
  </table></div> : <p className="budget-left-empty">{t('Nothing planned or recorded this year yet.')}</p>}
 </section>;
}

/** The Year view's overall rows: income, spending and what is left, per month and for the year. Past months show actuals with the plan below. */
function BudgetYearOverall({ months, overall, current, currency }: { months: string[]; overall: BudgetOverall[]; current: string; currency: string }) {
 const { t, locale } = useLanguage();
 const lines = [
  { label: t('Total income'), actual: (item: BudgetOverall) => item.income, plan: (item: BudgetOverall) => item.plannedIncome },
  { label: t('Total expenses'), actual: (item: BudgetOverall) => item.expenses, plan: (item: BudgetOverall) => item.plannedExpenses },
  { label: t('Net'), net: true, actual: (item: BudgetOverall) => item.income - item.expenses, plan: (item: BudgetOverall) => item.plannedIncome - item.plannedExpenses },
 ];
 return <tfoot>{lines.map(line => {
  const total = overall.some((item, position) => months[position] > current && item.missing) ? null : overall.reduce((sum, item, position) => sum + (months[position] <= current ? line.actual(item) : line.plan(item)), 0);
  const plan = (item: BudgetOverall) => item.missing ? '—' : formatMoney(line.plan(item), currency, locale);
  return <tr key={line.label} data-net={line.net || undefined}>
   <th scope="row">{line.label}</th>
   {overall.map((item, position) => {
    const past = months[position] <= current;
    const value = past ? line.actual(item) : line.plan(item);
    const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
    if (!item.income && !item.expenses && !item.plannedIncome && !item.plannedExpenses && !item.missing) return <td key={months[position]} {...marks}>—</td>;
    return <td key={months[position]} {...marks} data-tone={line.net && (past || !item.missing) ? signTone(value, true) : undefined}>
     <span>{past ? formatMoney(value, currency, locale) : plan(item)}</span>
     {past && <small>{t('of {amount}', { amount: plan(item) })}</small>}
    </td>;
   })}
   <td data-tone={line.net && total !== null ? signTone(total, true) : undefined}><strong>{total === null ? '—' : formatMoney(total, currency, locale)}</strong></td>
  </tr>;
 })}</tfoot>;
}
