"use client";
import { useState, type ReactNode } from 'react';
import { closestCorners, DndContext, DragOverlay, pointerWithin, useDraggable, useDroppable, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, RefreshCw, Settings2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { sortableAccessibility, useSortableSensors } from '@/components/presentation-foundation/sortable';
import { Button } from '@/components/ui/button';
import { isUnbudgeted, remainingTone, type BudgetCategory, type BudgetCategorySetting, type BudgetGroup, type BudgetRow } from '@/lib/budget';
import { moveToGroup } from '@/lib/budget-groups';
import { showError } from '@/lib/feedback';
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

type GroupProps = { group: BudgetGroup; currency: string; open: boolean; onToggle: () => void; showUnbudgeted: boolean; onShowUnbudgeted: () => void; renderPlanned: (row: BudgetRow) => ReactNode; onOpen: (row: BudgetRow) => void; rowMenu?: (row: BudgetRow) => ReactNode; header?: ReactNode; footer?: ReactNode;
 /** Money the group itself carries in (the Flexible bucket in flex mode), and its settings. */
 rolloverIn?: number; onGroupSettings?: () => void;
 /** Inside `GroupMoves`: its categories can be dragged to another group, and others dropped here. */
 movable?: boolean };

/** One collapsible group card: its total in the heading row, its categories below, unbudgeted ones behind a toggle. */
export function BudgetGroupCard({ group, currency, open, onToggle, showUnbudgeted, onShowUnbudgeted, renderPlanned, onOpen, rowMenu, header, footer, rolloverIn = 0, onGroupSettings, movable = false }: GroupProps) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const hidden = group.rows.filter(isUnbudgeted);
 const visible = showUnbudgeted ? group.rows : group.rows.filter(row => !isUnbudgeted(row));
 const { setNodeRef, isOver, active } = useDroppable({ id: groupId(group), disabled: !movable });
 const target = isOver && !group.rows.some(row => row.key === active?.id);
 return <section ref={setNodeRef} className="budget-group" data-open={open || undefined} data-drop-target={target || undefined}>
  <div className="budget-row budget-group-row">
   <span className="budget-group-name">
    <button type="button" className="budget-group-toggle" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{t(group.name)}{rolloverIn !== 0 && <RolledOver amount={rolloverIn} currency={currency}/>}</span></button>
    {onGroupSettings && <Button type="button" variant="ghost" size="icon-xs" aria-label={t('Category settings: {name}', { name: t(group.name) })} onClick={onGroupSettings}><Settings2/></Button>}
   </span>
   <span className="budget-cell">{header ?? (group.missing ? '—' : formatMoney(group.budget, currency, locale))}</span>
   <span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(group.actual, currency, locale)}</span>
   <span className="budget-cell"><RemainingPill value={group.missing ? null : group.remaining} direction={group.direction} currency={currency}/></span>
   <RowEnd/>
  </div>
  {open && <>
   {visible.map(row => <MovableRow key={row.key} id={row.key} label={name(row)} movable={movable}>
    <button type="button" className="budget-category-name" onClick={() => onOpen(row)} aria-label={t('Open {name}', { name: name(row) })}>
     <CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{name(row)}{row.rolloverIn !== 0 && <RolledOver amount={row.rolloverIn} currency={currency}/>}{!!row.scheduled && <small className="budget-rollover">{t('{amount} recurring', { amount: formatMoney(row.scheduled, currency, locale) })}</small>}</span>{row.rollover && <RefreshCw size={13} aria-label={t('Rollover')}/>}
    </button>
    <span className="budget-cell">{renderPlanned(row)}</span>
    <span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(row.actual, currency, locale)}</span>
    <span className="budget-cell"><RemainingPill value={row.remaining} direction={row.direction} currency={currency}/></span>
    <RowEnd>{rowMenu?.(row)}</RowEnd>
    <BudgetProgress row={row}/>
   </MovableRow>)}
   {footer}
   {hidden.length > 0 && <button type="button" className="budget-unbudgeted" onClick={onShowUnbudgeted}>{showUnbudgeted ? <EyeOff size={14}/> : <Eye size={14}/>}{t(showUnbudgeted ? 'Collapse {count} unbudgeted' : 'Show {count} unbudgeted', { count: hidden.length })}</button>}
  </>}
 </section>;
}

const groupId = (group: Pick<BudgetGroup, 'direction' | 'name'>) => group.direction + ':' + group.name;

/** A category row; a movable one has a handle that lifts it into another group. The row stays put while a copy follows the pointer. */
function MovableRow({ id, label, movable, children }: { id: string; label: string; movable: boolean; children: ReactNode }) {
 const { t } = useLanguage();
 const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, disabled: !movable });
 return <div ref={setNodeRef} className="budget-row budget-category-row" data-movable={movable || undefined} data-dragging={isDragging || undefined}>
  {movable && <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label={t('Move {name}', { name: label })} {...attributes} {...listeners}><GripVertical size={15} aria-hidden="true"/></button>}
  {children}
 </div>;
}

// The group under the pointer; with the keyboard (no pointer), the nearest one.
const groupUnder: CollisionDetection = args => { const hits = pointerWithin(args); return hits.length ? hits : closestCorners(args); };

/** Spending groups whose categories can be dragged from one group to another. A drop saves the category's new group
 * the way Category settings does (`moveToGroup`), and the usual Saved notice confirms it. */
export function GroupMoves({ groups, onSave, children }: { groups: readonly BudgetGroup[]; onSave: (setting: BudgetCategorySetting) => Promise<void>; children: ReactNode }) {
 const { t } = useLanguage();
 const name = useCategoryName();
 const sensors = useSortableSensors();
 const [active, setActive] = useState<BudgetRow | null>(null);
 const rowOf = (key: string) => groups.flatMap(group => group.rows).find(row => row.key === key);
 const end = ({ active: dragged, over }: DragEndEvent) => {
  setActive(null);
  const row = rowOf(String(dragged.id)), group = groups.find(item => groupId(item) === over?.id);
  const setting = row && group ? moveToGroup(row, group) : null;
  if (setting) onSave(setting).catch(error => showError(t((error as Error).message)));
 };
 return <DndContext id="budget-groups" sensors={sensors} collisionDetection={groupUnder} onDragStart={event => setActive(rowOf(String(event.active.id)) ?? null)} onDragEnd={end} onDragCancel={() => setActive(null)}
  accessibility={sortableAccessibility(t, key => { const row = rowOf(key); return row ? name(row) : ''; })}>
  {children}
  <DragOverlay dropAnimation={null}>{active && <div className="budget-drag-copy"><CategoryIcon kind={active.custom ? active.name : active.key} size="sm"/><span>{name(active)}</span></div>}</DragOverlay>
 </DndContext>;
}

/** The last column of every budget row: a category's ⋯ menu, empty elsewhere so the columns line up. */
function RowEnd({ children }: { children?: ReactNode }) {
 return <span className="budget-row-end">{children}</span>;
}

/** "+$40 rolled over" under a name: money a rollover fund brings into this month. */
function RolledOver({ amount, currency }: { amount: number; currency: string }) {
 const { t, locale } = useLanguage();
 return <small className="budget-rollover">{t('{amount} rolled over', { amount: formatSignedMoney(amount, currency, locale) })}</small>;
}

/** A grey band naming a section and its columns: the Income / Expenses / Contributions headers. */
export function BudgetSectionHeader({ title }: { title: string }) {
 const { t } = useLanguage();
 return <div className="budget-row budget-section-header"><span>{title}</span><span className="budget-cell">{t('Planned')}</span><span className="budget-cell budget-actual">{t('Actual')}</span><span className="budget-cell">{t('Remaining')}</span><RowEnd/></div>;
}

/** A section's totals. A null plan could not be converted: it and the remaining read —. */
export function BudgetTotalRow({ label, planned, actual, remaining, direction, currency }: { label: string; planned: number | null; actual: number; remaining: number | null; direction: BudgetRow['direction']; currency: string }) {
 const { t, locale } = useLanguage();
 return <div className="budget-row budget-total-row"><span>{label}</span><span className="budget-cell">{planned === null ? '—' : formatMoney(planned, currency, locale)}</span><span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(actual, currency, locale)}</span><span className="budget-cell"><RemainingPill value={remaining} direction={direction} currency={currency}/></span><RowEnd/></div>;
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
    <RowEnd/>
   </div>;
  })}
  <div className="budget-row budget-contributions-link"><DrawerLink className="panel-link" href="/goals">{t('Edit contributions in Goals')}</DrawerLink></div>
 </section>;
}

/** Amounts no rate converts: plans read — (`planned` counts them) and transactions are left out of the actuals (`actual`). */
export function BudgetRateNotice({ planned, actual }: { planned: number; actual: number }) {
 const { t } = useLanguage();
 if (!planned && !actual) return null;
 return <>
  {planned > 0 && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  {actual > 0 && <p role="status" className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
 </>;
}
