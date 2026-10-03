"use client";
import { closestCorners, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Move } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { SortableItem, sortableAccessibility, useSortableSensors } from '@/components/presentation-foundation/sortable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { columnOf, dashboardCardLabels, dashboardColumnIds, dashboardColumns, defaultDashboardLayout, dropCard, toggleCard, type DashboardCard, type DashboardColumn, type DashboardLayout } from '@/lib/dashboard-layout';

const sameLayout = (a: DashboardLayout, b: DashboardLayout) => JSON.stringify(a.columns) === JSON.stringify(b.columns);

/** Drag and drop: a card follows the pointer (or the arrow keys), the others make room, and the layout is saved once on drop. */
function useCardDrag(layout: DashboardLayout, onChange: (layout: DashboardLayout) => void, sensors: ReturnType<typeof useSensors>) {
 const { t } = useLanguage();
 const [preview, setPreview] = useState<DashboardLayout | null>(null);
 // Crossing into the other column moves the card there while it is held, so that column opens a gap for it.
 function over({ active, over }: DragOverEvent) {
  if (!over) return;
  setPreview(current => {
   const base = current ?? layout, card = active.id as DashboardCard, target = over.id as DashboardCard | DashboardColumn;
   const column = target === 'left' || target === 'right' ? target : columnOf(base, target);
   return column === columnOf(base, card) ? base : dropCard(base, card, target);
  });
 }
 function end({ active, over }: DragEndEvent) {
  const base = preview ?? layout;
  const card = active.id as DashboardCard, target = over?.id as DashboardCard | DashboardColumn | undefined;
  // Released over its own column's empty space: the card keeps the place it was given while held.
  const next = !target ? layout : target === columnOf(base, card) ? base : dropCard(base, card, target);
  setPreview(null);
  if (!sameLayout(next, layout)) onChange(next);
 }
 const context = { sensors, collisionDetection: closestCorners, onDragOver: over, onDragEnd: end, onDragCancel: () => setPreview(null),
  accessibility: sortableAccessibility(t, id => t(dashboardCardLabels[id as DashboardCard] ?? '')) };
 return { shown: preview ?? layout, context };
}

/** One column and the cards in it; an empty column still takes a dropped card. */
function DropColumn({ id, cards, className, children }: { id: DashboardColumn; cards: DashboardCard[]; className: string; children: ReactNode }) {
 const { setNodeRef } = useDroppable({ id });
 return <SortableContext id={id} items={cards} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className={className} data-column={id}>{children}</div></SortableContext>;
}

/** While rearranging, the whole card is the handle: a mouse lifts it after a 4px move, a finger after a short hold, so the page still scrolls. */
function useBoardSensors() {
 return useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}

/** The dashboard's two columns. Cards only move in rearrange mode, where they wiggle and can be dragged anywhere in either column. */
export function DashboardBoard({ layout, cards, arranging = false, onChange }: { layout: DashboardLayout; cards: Record<DashboardCard, ReactNode>; arranging?: boolean; onChange: (layout: DashboardLayout) => void }) {
 const { t } = useLanguage();
 const { shown, context } = useCardDrag(layout, onChange, useBoardSensors());
 const columns = dashboardColumns(shown);
 return <DndContext id="dashboard-board" {...context}>
  <div className="dashboard-grid" data-arranging={arranging || undefined}>{dashboardColumnIds.map(column => {
   const placed = columns[column].filter(card => cards[card]);
   return <DropColumn key={column} id={column} cards={placed} className="dashboard-column">{placed.map(card => <SortableItem key={card} id={card} label={t(dashboardCardLabels[card])} className="dashboard-card">{cards[card]}</SortableItem>)}</DropColumn>;
  })}</div>
 </DndContext>;
}

function CustomizeRow({ card, hidden, onToggle }: { card: DashboardCard; hidden: boolean; onToggle: () => void }) {
 const { t } = useLanguage();
 const id = `customize-${card}`;
 return <SortableItem id={card} label={t(dashboardCardLabels[card])} as="li" className="customize-row">
  <label htmlFor={id}>{t(dashboardCardLabels[card])}</label>
  <Switch id={id} checked={!hidden} onCheckedChange={onToggle}/>
 </SortableItem>;
}

/** Customize: every card in its column, a switch to show or hide it, and the same drag handle to move it. */
export function CustomizeDashboardDialog({ layout, onChange, onRearrange, onClose }: { layout: DashboardLayout; onChange: (layout: DashboardLayout) => void; onRearrange: () => void; onClose: () => void }) {
 const { t } = useLanguage();
 const { shown, context } = useCardDrag(layout, onChange, useSortableSensors());
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
  <DialogContent className="customize-dialog sm:max-w-2xl">
   <DialogTitle>{t('Customize dashboard')}</DialogTitle>
   <DndContext id="customize-dashboard" {...context}>
    <div className="customize-grid">{dashboardColumnIds.map(column => <DropColumn key={column} id={column} cards={shown.columns[column]} className="customize-column">
     <ul>{shown.columns[column].map(card => <CustomizeRow key={card} card={card} hidden={shown.hidden.includes(card)} onToggle={() => onChange(toggleCard(layout, card))}/>)}</ul>
    </DropColumn>)}</div>
   </DndContext>
   <div className="customize-footer"><Button variant="outline" size="sm" onClick={() => onChange(defaultDashboardLayout)}>{t('Reset to default')}</Button><Button size="sm" onClick={onRearrange}><Move size={16} aria-hidden="true"/>{t('Rearrange cards')}</Button></div>
  </DialogContent>
 </Dialog>;
}
