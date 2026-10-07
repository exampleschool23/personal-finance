"use client";
import type { Dispatch, SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';
import { withAssetIncomePlans, resolveEarningSource, type EarningSource } from '@/lib/earning-sources';
import type { ExpensePlan } from '@/lib/expense-plans';
import { showSaved } from '@/lib/feedback';
import { liabilities, type Entry } from '@/lib/finance';
import { resolveIncomeSource } from '@/lib/income-sources';
import type { Category } from '@/lib/planning';
import { applyRecordChange, lendFromAccount } from '@/lib/record-balance';
import { businessMoveFrom, cashAccountProblem, debtDatesProblem, duplicateSalaryPayment, duplicateScheduledPayment, expenseName, fitsExpensePlan, recordSaveProblem } from '@/lib/record-save';
import { depositToday } from '@/lib/deposit-interest';

const today = depositToday;

export type RecordSaveInput = {
    demo: boolean; rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>;
    editing: Entry | null; setEditing: Dispatch<SetStateAction<Entry | null>>;
    deleting: Entry | null; setDeleting: Dispatch<SetStateAction<Entry | null>>;
    setBusy: Dispatch<SetStateAction<boolean>>; setError: Dispatch<SetStateAction<string>>;
    /** Shows why a change was refused. */
    fail: (message: string) => void;
    planning: { loading: boolean; error: string; data: { records: Entry[]; categories: Category[] } };
    plans: ExpensePlan[]; sources: EarningSource[];
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
        const earningPatch=editing.earning_source_id?resolveEarningSource(editing,input.sources,rows.find(row=>row.id===editing.id)):{};
        if(demo&&duplicateScheduledPayment(editing,rows,earningPatch.earning_due_on))throw Error('This scheduled payment is already recorded.');
        const incomeSourcePatch=editing.income_source_id?resolveIncomeSource(editing,planning.data.records):{};
        if(demo&&duplicateSalaryPayment(editing,rows,incomeSourcePatch.income_due_on))throw Error('This salary payment is already recorded.');
        const name=expenseName(editing,planning.data.categories.find(category=>category.id===editing.custom_category_id)?.name,editing.kind);
        const opened=liabilities.includes(editing.kind)&&!rows.some(row=>row.id===editing.id)?{opened_on:editing.opened_on??today()}:{};
        // Only new money lent leaves a cash account.
        const lentFrom=editing.kind==='Money lent'&&!rows.some(row=>row.id===editing.id)?editing.lent_from??null:null;
        return {...editing,name,lent_from:lentFrom||undefined,account_exchange_rate:converted?rate:undefined,...opened,...incomeSourcePatch,...earningPatch};
    }
    async function save(e: React.FormEvent) {
        e.preventDefault(); if (!editing) return;
        const problem = recordSaveProblem(editing);
        if (problem) { fail(problem); return; }
        setBusy(true); setError('');
        try {
            if (editing.expense_plan_id && !fitsExpensePlan(editing, input.plans.find(p => p.id === editing.expense_plan_id))) throw Error('Check the expense plan, currency and spending date.');
            const rate=Number(new FormData(e.currentTarget as HTMLFormElement).get('account_exchange_rate'));
            const accountProblem=cashAccountProblem(editing,planning.data.records,!planning.loading&&!planning.error,rate);
            if(accountProblem)throw Error(accountProblem);
            const converted=!!editing.account_id&&planning.data.records.find(record=>record.id===editing.account_id)?.currency!==editing.currency;
            const savedRecord=recordToSave(editing,rate,converted);
            // An account that changes business takes its transactions along, so the business moves through set_account_business after the save.
            const move=businessMoveFrom(editing,planning.data.records.find(record=>record.id===editing.id)??rows.find(record=>record.id===editing.id));
            if(move)savedRecord.business_id=move.from;
            const datesProblem=debtDatesProblem(savedRecord);
            if(datesProblem)throw Error(datesProblem);
            if (demo) { const lent=lendFromAccount(rows,savedRecord); setRows(withAssetIncomePlans(applyRecordChange(lent.rows,lent.rows.find(record=>record.id===savedRecord.id),lent.loan),input.sources)); }
            else { await requestJson('/api/records', { body: savedRecord }); input.refreshRecords(); }
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
            else { await requestJson('/api/records', { method: 'DELETE', body: { id: deleting.id } }); input.refreshRecords(); }
            setDeleting(null);
        }
        catch (e) { fail((e as Error).message); }
        finally { setBusy(false); }
    }
    return { save, remove };
}
