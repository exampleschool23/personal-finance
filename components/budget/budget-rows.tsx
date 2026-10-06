"use client";
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw, Settings2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { Button } from '@/components/ui/button';
import { isUnbudgeted, remainingTone, type BudgetCategory, type BudgetGroup, type BudgetRow } from '@/lib/budget';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import type { Goal } from '@/lib/planning';

/** A category's display name: built-in kinds are translated, custom names are shown as typed. */
export function useCategoryName() {
 const { t } = useLanguage();
 return (category: Pick<BudgetCategory, 'name' | 'custom'>) => category.custom ? category.name : t(category.name);
}

/** Remaining money as a pill: green when money is left, red when overspent, grey at zero. */
function RemainingPill({ value, direction, currency }: { value: number | null; direction: BudgetRow['direction']; currency: string }) {
 const { locale } = useLanguage();
 if (value === null) return <span className="budget-pill">—</span>;
 return <span className="budget-pill" data-tone={remainingTone(value, direction)}>{formatMoney(value, currency, locale)}</span>;
}

/** The progress line under a row: how much of the planned amount is used. */
export function BudgetProgress({ row }: { row: Pick<BudgetRow, 'progress' | 'direction' | 'remaining'> }) {
 const over = row.direction === 'expense' && (row.remaining ?? 0) < 0;
 return <div className="budget-progress" data-over={over || undefined} aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, row.progress * 100))}%` }}/></div>;
}

type GroupProps = { group: BudgetGroup; currency: string; open: boolean; onToggle: () => void; showUnbudgeted: boolean; onShowUnbudgeted: () => void; renderPlanned: (row: BudgetRow) => ReactNode; onSettings: (row: BudgetRow) => void; header?: ReactNode; footer?: ReactNode;
 /** Money the group itself carries in (the Flexible bucket in flex mode), and its settings. */
 rolloverIn?: number; onGroupSettings?: () => void };

/** One collapsible group card: its total in the heading row, its categories below, unbudgeted ones behind a toggle. */
export function BudgetGroupCard({ group, currency, open, onToggle, showUnbudgeted, onShowUnbudgeted, renderPlanned, onSettings, header, footer, rolloverIn = 0, onGroupSettings }: GroupProps) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const hidden = group.rows.filter(isUnbudgeted);
 const visible = showUnbudgeted ? group.rows : group.rows.filter(row => !isUnbudgeted(row));
 return <section className="budget-group" data-open={open || undefined}>
  <div className="budget-row budget-group-row">
   <span className="budget-group-name">
    <button type="button" className="budget-group-toggle" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{t(group.name)}{rolloverIn !== 0 && <RolledOver amount={rolloverIn} currency={currency}/>}</span></button>
    {onGroupSettings && <Button type="button" variant="ghost" size="icon-xs" aria-label={t('Category settings: {name}', { name: t(group.name) })} onClick={onGroupSettings}><Settings2/></Button>}
   </span>
   <span className="budget-cell">{header ?? formatMoney(group.budget, currency, locale)}</span>
   <span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(group.actual, currency, locale)}</span>
   <span className="budget-cell"><RemainingPill value={group.remaining} direction={group.direction} currency={currency}/></span>
  </div>
  {open && <>
   {visible.map(row => <div className="budget-row budget-category-row" key={row.key}>
    <button type="button" className="budget-category-name" onClick={() => onSettings(row)} aria-label={t('Category settings: {name}', { name: name(row) })}>
     <CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{name(row)}{row.rolloverIn !== 0 && <RolledOver amount={row.rolloverIn} currency={currency}/>}</span>{row.rollover && <RefreshCw size={13} aria-label={t('Rollover')}/>}
    </button>
    <span className="budget-cell">{renderPlanned(row)}</span>
    <span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(row.actual, currency, locale)}</span>
    <span className="budget-cell"><RemainingPill value={row.remaining} direction={row.direction} currency={currency}/></span>
    <BudgetProgress row={row}/>
   </div>)}
   {footer}
   {hidden.length > 0 && <button type="button" className="budget-unbudgeted" onClick={onShowUnbudgeted}>{showUnbudgeted ? <EyeOff size={14}/> : <Eye size={14}/>}{t(showUnbudgeted ? 'Collapse {count} unbudgeted' : 'Show {count} unbudgeted', { count: hidden.length })}</button>}
  </>}
 </section>;
}

/** "+$40 rolled over" under a name: money a rollover fund brings into this month. */
function RolledOver({ amount, currency }: { amount: number; currency: string }) {
 const { t, locale } = useLanguage();
 return <small className="budget-rollover">{t('{amount} rolled over', { amount: formatSignedMoney(amount, currency, locale) })}</small>;
}

/** A grey band naming a section and its columns: the Income / Expenses / Contributions headers. */
export function BudgetSectionHeader({ title }: { title: string }) {
 const { t } = useLanguage();
 return <div className="budget-row budget-section-header"><span>{title}</span><span className="budget-cell">{t('Planned')}</span><span className="budget-cell budget-actual">{t('Actual')}</span><span className="budget-cell">{t('Remaining')}</span></div>;
}

export function BudgetTotalRow({ label, planned, actual, remaining, direction, currency }: { label: string; planned: number; actual: number; remaining: number; direction: BudgetRow['direction']; currency: string }) {
 const { t, locale } = useLanguage();
 return <div className="budget-row budget-total-row"><span>{label}</span><span className="budget-cell">{formatMoney(planned, currency, locale)}</span><span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(actual, currency, locale)}</span><span className="budget-cell"><RemainingPill value={remaining} direction={direction} currency={currency}/></span></div>;
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
    <span className="budget-cell budget-empty-cell budget-actual">—</span>
    <span className="budget-cell budget-empty-cell">—</span>
   </div>;
  })}
  <div className="budget-row budget-contributions-link"><DrawerLink className="panel-link" href="/goals">{t('Edit contributions in Goals')}</DrawerLink></div>
 </section>;
}
