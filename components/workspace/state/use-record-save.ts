"use client";
import type { Dispatch, SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';
import { withAssetIncomePlans, resolveEarningSource, type EarningSource } from '@/lib/earning-sources';
import { showDeleted, showSaved } from '@/lib/feedback';
import { liabilities, type Entry } from '@/lib/finance';
import { resolveIncomeSource } from '@/lib/income-sources';
import type { Category } from '@/lib/planning';
import { applyRecordChange, lendFromAccount, withSavedRecord } from '@/lib/record-balance';
import { businessMoveFrom, cashAccountProblem, debtDatesProblem, demoScheduleLink, duplicateSalaryPayment, duplicateScheduledPayment, expenseName, recordSaveProblem } from '@/lib/record-save';
import { depositToday } from '@/lib/deposit-interest';
import { savedRecord } from '@/lib/record-table';
import { isLinkedTransaction } from '@/lib/linked-transactions';

const today = depositToday;

export type RecordSaveInput = {
    demo: boolean; rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>;
    editing: Entry | null; setEditing: Dispatch<SetStateAction<Entry | null>>;
    deleting: Entry | null; setDeleting: Dispatch<SetStateAction<Entry | null>>;
    setBusy: Dispatch<SetStateAction<boolean>>; setError: Dispatch<SetStateAction<string>>;
    /** Shows why a change was refused. */
    fail: (message: string) => void;
    planning: { loading: boolean; error: string; data: { records: Entry[]; categories: Category[] }; updateRecords?: (change: (records: Entry[]) => Entry[]) => void };
    sources: EarningSource[];
    refreshRecords: () => void;
    setAccountBusiness: (accountId: string, business: string | null) => Promise<number>;
    /** Keeps a deleted sample record in Recently deleted. */
    binRecord: (record: Entry) => void;
};

/** Saving the record form and deleting a record. Both name the rule that refuses a change, as the server would. */
export function useRecordSave(input: RecordSaveInput) {
    const { demo, rows, setRows, editing, setEditing, deleting, setDeleting, setBusy, setError, fail, planning } = input;
    /** The record as it is sent: a blank expense named, its exchange rate and income source filled in, a new debt dated. */
    function recordToSave(editing: Entry, rate: number, converted: boolean) {
        // A saved record carries its revision, also one opened from a screen with its own read (Transactions).
        const stored=savedRecord(editing.id,rows,planning.data.records,editing);
        const earningPatch=editing.earning_source_id?resolveEarningSource(editing,input.sources,stored):{};
        if(demo&&duplicateScheduledPayment(editing,rows,earningPatch.earning_due_on))throw Error('This scheduled payment is already recorded.');
        const incomeSourcePatch=editing.income_source_id?resolveIncomeSource(editing,planning.data.records):{};
        if(demo&&duplicateSalaryPayment(editing,rows,incomeSourcePatch.income_due_on))throw Error('This salary payment is already recorded.');
        const name=expenseName(editing,planning.data.categories.find(category=>category.id===editing.custom_category_id)?.name,editing.kind);
        const opened=liabilities.includes(editing.kind)&&!stored?{opened_on:editing.opened_on??today()}:{};
        // Only new money lent leaves a cash account.
        const lentFrom=editing.kind==='Money lent'&&!stored?editing.lent_from??null:null;
        // Signed in, the database names the schedule a source receipt or a salary pays; the sample workspace does it here.
        const link=demo?demoScheduleLink(editing,{...incomeSourcePatch,...earningPatch},input.sources):{};
        return {...editing,name,lent_from:lentFrom||undefined,account_exchange_rate:converted?rate:undefined,...opened,...incomeSourcePatch,...earningPatch,...link};
    }
    async function save(e: React.FormEvent) {
        e.preventDefault(); if (!editing) return;
        const problem = recordSaveProblem(editing);
        if (problem) { fail(problem); return; }
        setBusy(true); setError('');
        try {
            const rate=Number(new FormData(e.currentTarget as HTMLFormElement).get('account_exchange_rate'));
            const accountProblem=cashAccountProblem(editing,planning.data.records,!planning.loading&&!planning.error,rate);
            if(accountProblem)throw Error(accountProblem);
            const converted=!!editing.account_id&&planning.data.records.find(record=>record.id===editing.account_id)?.currency!==editing.currency;
            const record=recordToSave(editing,rate,converted);
            // An account that changes business takes its transactions along, so the business moves through set_account_business after the save.
            const move=businessMoveFrom(editing,planning.data.records.find(record=>record.id===editing.id)??rows.find(record=>record.id===editing.id));
            if(move)record.business_id=move.from;
            const datesProblem=debtDatesProblem(record);
            if(datesProblem)throw Error(datesProblem);
            if (demo) { const lent=lendFromAccount(rows,record); setRows(withAssetIncomePlans(applyRecordChange(lent.rows,lent.rows.find(row=>row.id===record.id),lent.loan),input.sources)); }
            else {
                await requestJson('/api/records', { body: record });
                // The lists show the change now; the reload that follows takes a few seconds.
                planning.updateRecords?.(records => withSavedRecord(records, record));
                setRows(previous => previous.some(row => row.id === record.id) ? withSavedRecord(previous, record) : previous);
                input.refreshRecords();
            }
            if(move)await input.setAccountBusiness(editing.id,editing.business_id??null);
            setEditing(null);
            showSaved();
        }
        catch (e) { fail((e as Error).message); }
        finally { setBusy(false); }
    }
    async function remove() {
        if (!deleting) return;
        if (demo && deleting.kind === 'Business' && rows.some(r => r.business_id === deleting.id)) { setError('This business has linked records. Unlink them before deleting or changing its category.'); return; }
        setBusy(true); setError('');
        try {
            if (demo) {
                const original=rows.find(row=>row.id===deleting.id)||deleting;
                input.binRecord(original);
                setRows(applyRecordChange(rows,original));
            }
            else { await requestJson('/api/records', { method: 'DELETE', body: isLinkedTransaction(deleting) ? { id: deleting.id, linked: true } : { id: deleting.id } }); input.refreshRecords(); }
            setDeleting(null);
            showDeleted();
        }
        catch (e) { fail((e as Error).message); }
        finally { setBusy(false); }
    }
    return { save, remove };
}
