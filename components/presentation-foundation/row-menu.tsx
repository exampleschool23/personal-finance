"use client";
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type RowMenuItem = { label: string; onSelect: () => void; disabled?: boolean; destructive?: boolean; deletes?: boolean };

/** A row's rare actions behind one ⋯ button, so the row itself shows at most its main action. Falsy items are skipped; a delete carries the bin. */
export function RowMenu({ label, items }: { label: string; items: readonly (RowMenuItem | false | null | undefined)[] }) {
 const shown = items.filter((item): item is RowMenuItem => !!item);
 if (!shown.length) return null;
 return <DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="row-menu" aria-label={label}><MoreHorizontal size={18} aria-hidden="true"/></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">{shown.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled} variant={item.destructive || item.deletes ? 'destructive' : 'default'} onSelect={item.onSelect}>{item.deletes && <Trash2 aria-hidden="true"/>}{item.label}</DropdownMenuItem>)}</DropdownMenuContent>
 </DropdownMenu>;
}
