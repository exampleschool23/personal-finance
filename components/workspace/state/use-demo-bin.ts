"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { DeletedItem } from '@/lib/deleted-items';
import type { Entry } from '@/lib/finance';
import { applyRecordChange } from '@/lib/record-balance';

/** Recently deleted in the sample workspace, kept for the visit: deleted records can be restored
 * while what they link to still exists. Signed in, the database keeps the bin. */
export function useDemoBin({ rows, setRows }: { rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>> }) {
    const [deletedItems,setDeletedItems]=useState<DeletedItem[]>([]);
    const binRecord = (original: Entry) => setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'finance_records',data:original,deleted_at:new Date().toISOString()},...prev]);
    function restoreDemoItem(item:DeletedItem) {
        // Demo goals cannot be deleted and the sample workspace has no plans, so neither reaches Recently deleted here.
        if(item.source!=='finance_records')return;
        else {
            const entry=item.data;
            if(entry.business_id&&!rows.some(row=>row.id===entry.business_id&&row.kind==='Business'))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');
            setRows(applyRecordChange(rows,undefined,entry));
        }
        setDeletedItems(prev=>prev.filter(deleted=>deleted.id!==item.id));
    }
    const discardDeletedItem = (item: DeletedItem) => setDeletedItems(items => items.filter(existing => existing.id !== item.id));
    const emptyBin = () => setDeletedItems([]);
    return { deletedItems, binRecord, restoreDemoItem, discardDeletedItem, emptyBin };
}
