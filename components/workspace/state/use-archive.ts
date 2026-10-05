"use client";
import type { Dispatch, SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';
import { showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import type { ArchiveTarget } from '@/lib/recurring';
import type { ExpensePlan } from '@/lib/expense-plans';

/** Archiving on Recurring. In the sample workspace it changes the local copies; signed in, it is sent and everything is read again. */
export function useArchive({ demo, setRows, restoreDemoPlan, refreshRecords }: { demo: boolean; setRows: Dispatch<SetStateAction<Entry[]>>; restoreDemoPlan: (plan: ExpensePlan) => void; refreshRecords: () => void }) {
 async function archive(target: ArchiveTarget, archived: boolean) {
  if (demo) {
   if (target.source === 'plan') restoreDemoPlan({ ...target.plan, archived });
   else setRows(previous => previous.map(row => row.id === target.record.id ? { ...row, archived } : row));
  } else {
   await requestJson('/api/planning', { body: { action: 'archive', data: { source: target.source, id: target.source === 'plan' ? target.plan.id : target.record.id, archived } } });
   refreshRecords();
  }
  showSaved();
 }
 return archive;
}
