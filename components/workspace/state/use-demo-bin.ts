"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { DeletedItem } from '@/lib/deleted-items';
import type { ExpensePlan } from '@/lib/expense-plans';
import type { Entry } from '@/lib/finance';
import { applyRecordChange } from '@/lib/record-balance';

/** Recently deleted in the sample workspace, kept for the visit: deleted records and expense plans can be restored
 * while what they link to still exists. Signed in, the database keeps the bin. */
export function useDemoBin({ demo, rows, setRows, expensePlans }: { demo: boolean; rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>; expensePlans: { plans: ExpensePlan[]; remove: (id: string) => Promise<void>; restoreDemo: (plan: ExpensePlan) => void } }) {
    const [deletedItems,setDeletedItems]=useState<DeletedItem[]>([]);
    const binRecord = (original: Entry) => setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'finance_records',data:original,deleted_at:new Date().toISOString()},...prev]);
    const binPlan = (plan: ExpensePlan) => setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'expense_plans',data:plan,deleted_at:new Date().toISOString()},...prev]);
    async function removePlan(id:string) {
        const plan=expensePlans.plans.find(plan=>plan.id===id);
        await expensePlans.remove(id);
        if(demo&&plan)binPlan(plan);
    }
    function restoreDemoItem(item:DeletedItem) {
        if(item.source==='expense_plans')expensePlans.restoreDemo(item.data);
        // Demo goals cannot be deleted, so they never reach Recently deleted.
        else if(item.source==='savings_goals')return;
        else {
            const entry=item.data;
            if(entry.business_id&&!rows.some(row=>row.id===entry.business_id&&row.kind==='Business'))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');
            if(entry.expense_plan_id){const plan=expensePlans.plans.find(plan=>plan.id===entry.expense_plan_id);if(!plan||plan.currency!==entry.currency||entry.date<plan.start_date||(plan.end_date&&entry.date>plan.end_date))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');}
            setRows(applyRecordChange(rows,undefined,entry));
        }
        setDeletedItems(prev=>prev.filter(deleted=>deleted.id!==item.id));
    }
    const discardDeletedItem = (item: DeletedItem) => setDeletedItems(items => items.filter(existing => existing.id !== item.id));
    const emptyBin = () => setDeletedItems([]);
    return { deletedItems, binRecord, binPlan, removePlan, restoreDemoItem, discardDeletedItem, emptyBin };
}
