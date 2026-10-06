"use client";
import type { Dispatch, SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';
import { showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import { applyRecordChange } from '@/lib/record-balance';
import { nextArchivePauses } from '@/lib/archive-pauses';
import { depositToday } from '@/lib/deposit-interest';
import { scheduleHistory, type ArchiveTarget } from '@/lib/recurring';
import type { Occurrence } from '@/lib/planning';
import type { ExpensePlan } from '@/lib/expense-plans';

/** Archiving on Recurring. In the sample workspace it changes the local copies; signed in, it is sent and everything is read again. */
export function useArchive({ demo, setRows, restoreDemoPlan, refreshRecords }: { demo: boolean; setRows: Dispatch<SetStateAction<Entry[]>>; restoreDemoPlan: (plan: ExpensePlan) => void; refreshRecords: () => void }) {
 async function archive(target: ArchiveTarget, archived: boolean) {
  if (demo) {
   // The database keeps these pauses itself (migration 115); the sample copies follow the same rule.
   const today = depositToday();
   if (target.source === 'plan') restoreDemoPlan({ ...target.plan, archived, archive_pauses: nextArchivePauses(target.plan.archive_pauses, archived, today) });
   else setRows(previous => previous.map(row => row.id === target.record.id ? { ...row, archived, archive_pauses: nextArchivePauses(row.archive_pauses, archived, today) } : row));
  } else {
   await requestJson('/api/planning', { body: { action: 'archive', data: { source: target.source, id: target.source === 'plan' ? target.plan.id : target.record.id, archived } } });
   refreshRecords();
  }
  showSaved();
 }
 return archive;
}

type DeleteInput = { demo: boolean; rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>; occurrences: Occurrence[]; bin: { binRecord: (record: Entry) => void; binPlan: (plan: ExpensePlan) => void }; dropDemoPlan: (id: string) => void; refreshRecords: () => void };

/** Deleting on Recurring: the schedule or plan moves to Recently deleted, and its recorded payments stay in history or go with it.
 * In the sample workspace the local copies change the same way, reversing the cash of each payment deleted. */
export function useDeleteSchedule({ demo, rows, setRows, occurrences, bin, dropDemoPlan, refreshRecords }: DeleteInput) {
 async function deleteSchedule(target: ArchiveTarget, removeHistory: boolean) {
  if (demo) {
   const history = new Set(scheduleHistory(target, rows, occurrences));
   let next = rows;
   for (const row of rows) {
    if (!history.has(row.id)) continue;
    if (removeHistory) { bin.binRecord(row); next = applyRecordChange(next, row); }
    else if (target.source === 'plan') next = next.map(item => item.id === row.id ? { ...item, expense_plan_id: null } : item);
   }
   if (target.source === 'plan') { bin.binPlan(target.plan); dropDemoPlan(target.plan.id); }
   else { const original = next.find(row => row.id === target.record.id) ?? target.record; bin.binRecord(original); next = applyRecordChange(next, original); }
   setRows(next);
  } else {
   await requestJson('/api/planning', { body: { action: 'delete_schedule', data: { source: target.source, id: target.source === 'plan' ? target.plan.id : target.record.id, remove_history: removeHistory } } });
   refreshRecords();
  }
  showSaved();
 }
 return deleteSchedule;
}
