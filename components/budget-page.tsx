"use client";
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw, Settings2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { budgetTypeLabels, budgetTypes, defaultGroups, isUnbudgeted, remainingTone, type BudgetCategory, type BudgetCategorySetting, type BudgetGroup, type BudgetHistory, type BudgetMode, type BudgetRow, type BudgetType, type LeftToBudget } from '@/lib/budget';
import { showError } from '@/lib/feedback';
import { formatMoney, formatMonthShort, formatSignedMoney } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import type { Goal } from '@/lib/planning';

const typeHints: Record<BudgetType, string> = {
 fixed: 'The same every month, such as rent, loan payments or a gym membership.',
 flexible: 'Changes from month to month, such as groceries, eating out and shopping.',
 non_monthly: 'Comes now and then, such as a vacation, car repairs or yearly fees. Save ahead for it.',
};

/** A category's display name: built-in kinds are translated, custom names are shown as typed. */
export function useCategoryName() {
 const { t } = useLanguage();
 return (category: Pick<BudgetCategory, 'name' | 'custom'>) => category.custom ? category.name : t(category.name);
}

/** Remaining money as a pill: green when money is left, red when overspent, grey at zero. */
export function RemainingPill({ value, direction, currency }: { value: number | null; direction: BudgetRow['direction']; currency: string }) {
 const { locale } = useLanguage();
 if (value === null) return <span className="budget-pill">—</span>;
 return <span className="budget-pill" data-tone={remainingTone(value, direction)}>{formatMoney(value, currency, locale)}</span>;
}

/** The progress line under a row: how much of the planned amount is used. */
export function BudgetProgress({ row }: { row: Pick<BudgetRow, 'progress' | 'direction' | 'remaining'> }) {
 const over = row.direction === 'expense' && (row.remaining ?? 0) < 0;
 return <div className="budget-progress" data-over={over || undefined} aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, row.progress * 100))}%` }}/></div>;
}

/** History popover: last month, the monthly average and six monthly bars. */
function HistoryPanel({ history, direction, currency, amount, forward, onForward }: { history: BudgetHistory; direction: BudgetRow['direction']; currency: string; amount: number; forward: boolean; onForward: (value: boolean) => void }) {
 const { t, locale } = useLanguage();
 const peak = Math.max(...history.months.map(item => item.amount), 1);
 return <div className="budget-history">
  <p className="budget-history-title">{t('History')}</p>
  <div className="budget-history-tiles">
   <div><strong>{formatMoney(history.lastMonth, currency, locale)}</strong><span>{t(direction === 'income' ? 'Earned last month' : 'Spent last month')}</span></div>
   <div><strong>{formatMoney(history.average, currency, locale)}</strong><span>{t('Monthly average')}</span></div>
  </div>
  <ol className="budget-history-bars" data-direction={direction}>
   {history.months.map(item => <li key={item.month} title={formatMoney(item.amount, currency, locale)}><span style={{ height: `${Math.max(2, item.amount / peak * 100)}%` }}/><small>{formatMonthShort(item.month, locale)}</small></li>)}
  </ol>
  <label className="budget-history-forward"><input type="checkbox" checked={forward} onChange={event => onForward(event.currentTarget.checked)}/>{t('Apply {amount} to all future months', { amount: formatMoney(amount, currency, locale) })}</label>
 </div>;
}

/** An editable planned amount. Focusing it opens the History popover; leaving it saves. */
export function PlannedInput({ label, value, history, direction, currency, defaultForward, onSave }: { label: string; value: number; history: BudgetHistory; direction: BudgetRow['direction']; currency: string; defaultForward: boolean; onSave: (amount: number, forward: boolean) => Promise<void> }) {
 const { t } = useLanguage();
 const anchor = useRef<HTMLSpanElement>(null);
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState(value);
 const [forward, setForward] = useState(defaultForward);
 function commit() {
  setOpen(false);
  const changed = draft !== value || forward !== defaultForward;
  setForward(defaultForward);
  if (changed) onSave(draft, forward).catch(error => { setDraft(value); showError(t((error as Error).message || 'Could not save changes.')); });
 }
 return <Popover open={open} onOpenChange={next => { if (!next) commit(); }}>
  <PopoverAnchor asChild>
   <span ref={anchor} className="budget-input" onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); (event.target as HTMLElement).blur(); } }}>
    <FormattedNumberInput ariaLabel={label} value={draft} onValueChange={next => setDraft(next)} required={false} displayFractionDigits={0}/>
   </span>
  </PopoverAnchor>
  <PopoverContent className="budget-history-popover" align="end" onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => { if (anchor.current?.contains(event.target as Node)) event.preventDefault(); }}>
   <HistoryPanel history={history} direction={direction} currency={currency} amount={draft} forward={forward} onForward={setForward}/>
  </PopoverContent>
 </Popover>;
}

type GroupProps = { group: BudgetGroup; currency: string; open: boolean; onToggle: () => void; showUnbudgeted: boolean; onShowUnbudgeted: () => void; renderPlanned: (row: BudgetRow) => ReactNode; onSettings: (row: BudgetRow) => void; header?: ReactNode; footer?: ReactNode };

/** One collapsible group card: its total in the heading row, its categories below, unbudgeted ones behind a toggle. */
export function BudgetGroupCard({ group, currency, open, onToggle, showUnbudgeted, onShowUnbudgeted, renderPlanned, onSettings, header, footer }: GroupProps) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const hidden = group.rows.filter(isUnbudgeted);
 const visible = showUnbudgeted ? group.rows : group.rows.filter(row => !isUnbudgeted(row));
 return <section className="budget-group" data-open={open || undefined}>
  <div className="budget-row budget-group-row">
   <button type="button" className="budget-group-toggle" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{t(group.name)}</span></button>
   <span className="budget-cell">{header ?? formatMoney(group.budget, currency, locale)}</span>
   <span className="budget-cell">{formatMoney(group.actual, currency, locale)}</span>
   <span className="budget-cell"><RemainingPill value={group.remaining} direction={group.direction} currency={currency}/></span>
  </div>
  {open && <>
   {visible.map(row => <div className="budget-row budget-category-row" key={row.key}>
    <button type="button" className="budget-category-name" onClick={() => onSettings(row)} aria-label={t('Category settings: {name}', { name: name(row) })}>
     <CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{name(row)}{row.rolloverIn !== 0 && <small className="budget-rollover">{t('{amount} rolled over', { amount: formatSignedMoney(row.rolloverIn, currency, locale) })}</small>}</span>{row.rollover && <RefreshCw size={13} aria-label={t('Rollover')}/>}
    </button>
    <span className="budget-cell">{renderPlanned(row)}</span>
    <span className="budget-cell">{formatMoney(row.actual, currency, locale)}</span>
    <span className="budget-cell"><RemainingPill value={row.remaining} direction={row.direction} currency={currency}/></span>
    <BudgetProgress row={row}/>
   </div>)}
   {footer}
   {hidden.length > 0 && <button type="button" className="budget-unbudgeted" onClick={onShowUnbudgeted}>{showUnbudgeted ? <EyeOff size={14}/> : <Eye size={14}/>}{t(showUnbudgeted ? 'Collapse {count} unbudgeted' : 'Show {count} unbudgeted', { count: hidden.length })}</button>}
  </>}
 </section>;
}

/** A grey band naming a section and its columns: the Income / Expenses / Contributions headers. */
export function BudgetSectionHeader({ title }: { title: string }) {
 const { t } = useLanguage();
 return <div className="budget-row budget-section-header"><span>{title}</span><span className="budget-cell">{t('Planned')}</span><span className="budget-cell">{t('Actual')}</span><span className="budget-cell">{t('Remaining')}</span></div>;
}

export function BudgetTotalRow({ label, planned, actual, remaining, direction, currency }: { label: string; planned: number; actual: number; remaining: number; direction: BudgetRow['direction']; currency: string }) {
 const { locale } = useLanguage();
 return <div className="budget-row budget-total-row"><span>{label}</span><span className="budget-cell">{formatMoney(planned, currency, locale)}</span><span className="budget-cell">{formatMoney(actual, currency, locale)}</span><span className="budget-cell"><RemainingPill value={remaining} direction={direction} currency={currency}/></span></div>;
}

/** Goals with a planned monthly saving. Contributions are edited on the goal itself. */
export function ContributionRows({ goals, currency, amountOf }: { goals: Goal[]; currency: string; amountOf: (goal: Goal) => number | null }) {
 const { t, locale } = useLanguage();
 return <section className="budget-group" data-open>
  {goals.map(goal => {
   const amount = amountOf(goal);
   return <div className="budget-row budget-category-row" key={goal.id}>
    <span className="budget-category-name"><span className="category-icon" data-size="sm" aria-hidden="true">{goalEmoji(goal)}</span><span>{goal.name}</span></span>
    <span className="budget-cell">{amount === null ? '—' : formatMoney(amount, currency, locale)}</span>
    <span className="budget-cell budget-empty-cell">—</span>
    <span className="budget-cell budget-empty-cell">—</span>
   </div>;
  })}
  <div className="budget-row budget-contributions-link"><DrawerLink className="panel-link" href="/goals">{t('Edit contributions in Goals')}</DrawerLink></div>
 </section>;
}

/** The right-hand card: money not yet given a job, with Summary / Income / Expenses tabs. */
export function LeftToBudgetCard({ left, rows, mode, currency }: { left: LeftToBudget; rows: BudgetRow[]; mode: BudgetMode; currency: string }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const [tab, setTab] = useState<'summary' | 'income' | 'expenses'>('summary');
 const money = (value: number) => formatMoney(value, currency, locale);
 const tone = remainingTone(left.left);
 const income = rows.filter(row => row.direction === 'income' && !row.excluded && (row.budget || row.actual));
 const spending = rows.filter(row => row.direction === 'expense' && !row.excluded);
 const buckets = budgetTypes.map(type => {
  const items = spending.filter(row => row.type === type);
  const planned = type === 'flexible' && mode === 'flex' ? left.flexible ?? 0 : items.reduce((sum, row) => sum + (row.budget ?? 0) + row.rolloverIn, 0);
  const spent = items.reduce((sum, row) => sum + row.actual, 0);
  return { type, planned, spent, remaining: planned - spent };
 }).filter(bucket => bucket.planned || bucket.spent);
 return <aside className="panel budget-left" aria-label={t('Left to budget')}>
  <div className="budget-left-figure" data-tone={tone}><strong>{money(left.left)}</strong><span>{t('Left to budget')}<InfoHint>{t('Planned income minus planned spending and goal contributions. Green means money still needs a job; red means you plan to spend more than you earn.')}</InfoHint></span></div>
  <Segmented label={t('Left to budget')} options={[{ value: 'summary', label: t('Summary') }, { value: 'income', label: t('Income') }, { value: 'expenses', label: t('Expenses') }] as const} value={tab} onChange={setTab} className="budget-left-tabs"/>
  {tab === 'summary' && <dl className="budget-left-summary">
   <div><dt>{t('Planned income')}</dt><dd>{money(left.income)}</dd></div>
   <div><dt>{t('Planned spending')}</dt><dd>{money(left.expenses)}</dd></div>
   <div><dt>{t('Contributions')}</dt><dd>{money(left.contributions)}</dd></div>
   <div className="budget-left-total"><dt>{t('Left to budget')}</dt><dd data-tone={tone}>{money(left.left)}</dd></div>
  </dl>}
  {tab === 'income' && (income.length ? <ul className="budget-left-list">{income.map(row => <li key={row.key}><p><span>{name(row)}</span><small>{t('{amount} planned', { amount: money(row.budget ?? 0) })}</small></p><BudgetProgress row={row}/><p><small>{t('{amount} earned', { amount: money(row.actual) })}</small><small>{t('{amount} remaining', { amount: money(Math.max(0, (row.budget ?? 0) - row.actual)) })}</small></p></li>)}</ul> : <p className="budget-left-empty">{t('Add planned income to see it here.')}</p>)}
  {tab === 'expenses' && (buckets.length ? <ul className="budget-left-list">{buckets.map(bucket => <li key={bucket.type}><p><span>{t(budgetTypeLabels[bucket.type])}</span><small>{t('{amount} planned', { amount: money(bucket.planned) })}</small></p><BudgetProgress row={{ progress: bucket.planned > 0 ? bucket.spent / bucket.planned : bucket.spent > 0 ? 1 : 0, direction: 'expense', remaining: bucket.remaining }}/><p><small>{t('{amount} spent', { amount: money(bucket.spent) })}</small><small data-tone={remainingTone(bucket.remaining)}>{t(bucket.remaining < 0 ? '{amount} over' : '{amount} remaining', { amount: money(Math.abs(bucket.remaining)) })}</small></p></li>)}</ul> : <p className="budget-left-empty">{t('You haven’t added any expense budgets yet. Once you do, a summary appears here.')}</p>)}
 </aside>;
}

/** Category settings: type, group, rollover and whether the category counts in the budget. */
export function CategorySettingsDialog({ category, groups, month, onSave, onClose }: { category: BudgetCategory; groups: string[]; month: string; onSave: (setting: BudgetCategorySetting) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const name = useCategoryName();
 const [type, setType] = useState(category.type);
 const typeGroup = (value: BudgetType) => defaultGroups[value];
 const [group, setGroup] = useState(category.group);
 const [newGroup, setNewGroup] = useState('');
 const [rollover, setRollover] = useState(category.rollover);
 const [excluded, setExcluded] = useState(category.excluded);
 const [busy, setBusy] = useState(false);
 const expense = category.direction === 'expense';
 const choices = [...new Set([...budgetTypes.map(typeGroup), ...groups])].filter(item => item !== defaultGroups.income);
 async function submit() {
  setBusy(true);
  const chosen = group === '__new' ? newGroup.trim() : group;
  // A group that only follows the type is not stored, so changing the type moves the category along.
  const custom = expense && chosen && chosen !== typeGroup(type) ? chosen : null;
  try {
   await onSave({ category_key: category.key, budget_type: expense ? type : 'fixed', group_name: custom, rollover: expense && rollover, rollover_start: expense && rollover ? category.rolloverStart ?? month : null, excluded });
   onClose();
  } catch (error) { showError(t((error as Error).message)); }
  finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle className="budget-dialog-title"><CategoryIcon kind={category.custom ? category.name : category.key}/>{name(category)}</DialogTitle>
   <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     {expense && <div className="budget-choice-list" role="radiogroup" aria-label={t('Budget type')}>
      <p className="budget-dialog-label">{t('Budget type')}</p>
      {budgetTypes.map(value => <label key={value} className="budget-choice"><input type="radio" name="budget-type" checked={type === value} onChange={() => { if (group === typeGroup(type)) setGroup(typeGroup(value)); setType(value); }}/><span><strong>{t(budgetTypeLabels[value])}</strong><small>{t(typeHints[value])}</small></span></label>)}
     </div>}
     {expense && <label className="budget-dialog-label">{t('Group')}
      <select className="budget-select" value={group} onChange={event => setGroup(event.currentTarget.value)}>
       {choices.map(item => <option key={item} value={item}>{t(item)}</option>)}
       <option value="__new">{t('New group…')}</option>
      </select>
      {group === '__new' && <input className="budget-text" value={newGroup} maxLength={60} placeholder={t('Group name')} onChange={event => setNewGroup(event.currentTarget.value)} required/>}
     </label>}
     {expense && <label className="budget-check"><input type="checkbox" checked={rollover} onChange={event => setRollover(event.currentTarget.checked)}/><span><strong>{t('Make this category a rollover fund')}</strong><small>{t('Money left at the end of a month carries into the next one, and overspending is taken from it. Best for non-monthly costs.')}</small></span></label>}
     <label className="budget-check"><input type="checkbox" checked={excluded} onChange={event => setExcluded(event.currentTarget.checked)}/><span><strong>{t('Exclude this category from the budget')}</strong><small>{t('Its transactions stay recorded, but it is left out of budget totals.')}</small></span></label>
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || (group === '__new' && !newGroup.trim())}>{t(busy ? 'Saving…' : 'Save')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

/** Budget settings: Flex or Category style, the default edit scope, and recalculating defaults from history. */
export function BudgetSettingsDialog({ mode, applyForward, onSave, onRecalculate, onClose }: { mode: BudgetMode; applyForward: boolean; onSave: (mode: BudgetMode, applyForward: boolean) => Promise<void>; onRecalculate: () => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const [style, setStyle] = useState(mode);
 const [forward, setForward] = useState(applyForward);
 const [busy, setBusy] = useState(false);
 async function run(action: () => Promise<void>) {
  setBusy(true);
  try { await action(); onClose(); } catch (error) { showError(t((error as Error).message)); } finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle className="budget-dialog-title"><Settings2 size={18}/>{t('Budget settings')}</DialogTitle>
   <form onSubmit={event => { event.preventDefault(); run(() => onSave(style, forward)); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <div className="budget-choice-list" role="radiogroup" aria-label={t('Budget style')}>
      <p className="budget-dialog-label">{t('Budget style')}</p>
      <label className="budget-choice"><input type="radio" name="budget-style" checked={style === 'flex'} onChange={() => setStyle('flex')}/><span><strong>{t('Flex budget')} <span className="status-badge">{t('Recommended')}</span></strong><small>{t('One amount for all flexible spending. Fixed and non-monthly costs are planned on their own.')}</small></span></label>
      <label className="budget-choice"><input type="radio" name="budget-style" checked={style === 'category'} onChange={() => setStyle('category')}/><span><strong>{t('Category budget')}</strong><small>{t('Plan every category on its own, the traditional way.')}</small></span></label>
     </div>
     <div className="budget-choice-list" role="radiogroup" aria-label={t('By default, apply budget changes to')}>
      <p className="budget-dialog-label">{t('By default, apply budget changes to')}</p>
      <label className="budget-choice"><input type="radio" name="budget-scope" checked={!forward} onChange={() => setForward(false)}/><span><strong>{t('This month only')}</strong><small>{t('A change applies to the month you are editing. You can still apply one change to all future months from its History.')}</small></span></label>
      <label className="budget-choice"><input type="radio" name="budget-scope" checked={forward} onChange={() => setForward(true)}/><span><strong>{t('All future months')}</strong><small>{t('A change applies to the month you are editing and every month after it. You can untick this for a single change.')}</small></span></label>
     </div>
     <div className="budget-recalculate">
      <span><strong>{t('Recalculate default budgets')}</strong><small>{t('Sets each category to its six-month average, rounded up to a whole amount, from this month on. Amounts you typed are replaced.')}</small></span>
      <Button type="button" variant="outline" onClick={() => run(onRecalculate)}>{t('Recalculate')}</Button>
     </div>
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy}>{t(busy ? 'Saving…' : 'Save')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}
