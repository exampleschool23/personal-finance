"use client";
import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { columnOf, dashboardCardLabels, dashboardColumnIds, dashboardColumns, defaultDashboardLayout, dropCard, toggleCard, type DashboardCard, type DashboardColumn, type DashboardLayout } from '@/lib/dashboard-layout';

const sameLayout = (a: DashboardLayout, b: DashboardLayout) => JSON.stringify(a.columns) === JSON.stringify(b.columns);

/** Monarch's drag and drop: a card follows the pointer (or the arrow keys), the others make room, and the layout is saved once on drop. */
function useCardDrag(layout: DashboardLayout, onChange: (layout: DashboardLayout) => void) {
 const { t } = useLanguage();
 const [preview, setPreview] = useState<DashboardLayout | null>(null);
 const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
 const name = (id: unknown) => t(dashboardCardLabels[id as DashboardCard] ?? '');
 const announcements: Announcements = {
  onDragStart: ({ active }) => t('Picked up {name}.', { name: name(active.id) }),
  onDragOver: () => undefined,
  onDragEnd: ({ active }) => t('Dropped {name}.', { name: name(active.id) }),
  onDragCancel: ({ active }) => t('Stopped moving {name}.', { name: name(active.id) }),
 };
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
  accessibility: { announcements, screenReaderInstructions: { draggable: t('Press space to pick up a card, the arrow keys to move it and space again to drop it.') } } };
 return { shown: preview ?? layout, context };
}

/** One column and the cards in it; an empty column still takes a dropped card. */
function DropColumn({ id, cards, className, children }: { id: DashboardColumn; cards: DashboardCard[]; className: string; children: ReactNode }) {
 const { setNodeRef } = useDroppable({ id });
 return <SortableContext id={id} items={cards} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className={className} data-column={id}>{children}</div></SortableContext>;
}

/** A card or row that can be dragged: its outer element moves, and only the six-dot handle lifts it. */
function Sortable({ card, as: Tag, className, children }: { card: DashboardCard; as: 'div' | 'li'; className: string; children: ReactNode }) {
 const { t } = useLanguage();
 const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card });
 return <Tag ref={setNodeRef} className={className} data-dragging={isDragging || undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
  <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label={t('Move {name}', { name: t(dashboardCardLabels[card]) })} {...attributes} {...listeners}><GripVertical size={15} aria-hidden="true"/></button>
  {children}
 </Tag>;
}

/** The dashboard's two columns. Hover a card for its handle and drag it anywhere in either column. */
export function DashboardBoard({ layout, cards, onChange }: { layout: DashboardLayout; cards: Record<DashboardCard, ReactNode>; onChange: (layout: DashboardLayout) => void }) {
 const { shown, context } = useCardDrag(layout, onChange);
 const columns = dashboardColumns(shown);
 return <DndContext id="dashboard-board" {...context}>
  <div className="dashboard-grid">{dashboardColumnIds.map(column => {
   const placed = columns[column].filter(card => cards[card]);
   return <DropColumn key={column} id={column} cards={placed} className="dashboard-column">{placed.map(card => <Sortable key={card} card={card} as="div" className="dashboard-card">{cards[card]}</Sortable>)}</DropColumn>;
  })}</div>
 </DndContext>;
}

function CustomizeRow({ card, hidden, onToggle }: { card: DashboardCard; hidden: boolean; onToggle: () => void }) {
 const { t } = useLanguage();
 const id = `customize-${card}`;
 return <Sortable card={card} as="li" className="customize-row">
  <label htmlFor={id}>{t(dashboardCardLabels[card])}</label>
  <Switch id={id} checked={!hidden} onCheckedChange={onToggle}/>
 </Sortable>;
}

/** Customize: every card in its column, a switch to show or hide it, and the same drag handle to move it. */
export function CustomizeDashboardDialog({ layout, onChange, onClose }: { layout: DashboardLayout; onChange: (layout: DashboardLayout) => void; onClose: () => void }) {
 const { t } = useLanguage();
 const { shown, context } = useCardDrag(layout, onChange);
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
  <DialogContent className="customize-dialog sm:max-w-2xl">
   <DialogTitle>{t('Customize dashboard')}</DialogTitle>
   <DndContext id="customize-dashboard" {...context}>
    <div className="customize-grid">{dashboardColumnIds.map(column => <DropColumn key={column} id={column} cards={shown.columns[column]} className="customize-column">
     <ul>{shown.columns[column].map(card => <CustomizeRow key={card} card={card} hidden={shown.hidden.includes(card)} onToggle={() => onChange(toggleCard(layout, card))}/>)}</ul>
    </DropColumn>)}</div>
   </DndContext>
   <div className="customize-footer"><Button variant="outline" size="sm" onClick={() => onChange(defaultDashboardLayout)}>{t('Reset to default')}</Button></div>
  </DialogContent>
 </Dialog>;
}
