"use client";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';

type Translate = ReturnType<typeof useLanguage>['t'];

/** Screen-reader guidance and announcements for every drag and drop, named by the moved item. */
export function sortableAccessibility(t: Translate, nameOf: (id: string) => string) {
 const announcements: Announcements = {
  onDragStart: ({ active }) => t('Picked up {name}.', { name: nameOf(String(active.id)) }),
  onDragOver: () => undefined,
  onDragEnd: ({ active }) => t('Dropped {name}.', { name: nameOf(String(active.id)) }),
  onDragCancel: ({ active }) => t('Stopped moving {name}.', { name: nameOf(String(active.id)) }),
 };
 return { announcements, screenReaderInstructions: { draggable: t('Press space to pick up a card, the arrow keys to move it and space again to drop it.') } };
}

/** Pointer (after a 4px move, so clicks still work) and keyboard sensors shared by every sortable surface. */
export function useSortableSensors() {
 return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}

/** One list the person can put in their own order. `onMove` receives the moved id and the id it was dropped on. */
export function SortableList({ id, items, nameOf, onMove, disabled = false, children }: { id: string; items: string[]; nameOf: (id: string) => string; onMove: (active: string, over: string) => void; disabled?: boolean; children: ReactNode }) {
 const { t } = useLanguage();
 const sensors = useSortableSensors();
 const end = ({ active, over }: DragEndEvent) => { if (over && active.id !== over.id) onMove(String(active.id), String(over.id)); };
 return <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} accessibility={sortableAccessibility(t, nameOf)}>
  <SortableContext items={items} strategy={verticalListSortingStrategy} disabled={disabled}>{children}</SortableContext>
 </DndContext>;
}

/** A row or card that can be dragged: the whole element moves, and only its six-dot handle lifts it. */
export function SortableItem({ id, label, as: Tag = 'div', className, children }: { id: string; label: string; as?: 'div' | 'li'; className?: string; children: ReactNode }) {
 const { t } = useLanguage();
 const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
 return <Tag ref={setNodeRef} className={['sortable-item', className].filter(Boolean).join(' ')} data-dragging={isDragging || undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
  <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label={t('Move {name}', { name: label })} {...attributes} {...listeners}><GripVertical size={15} aria-hidden="true"/></button>
  {children}
 </Tag>;
}
