import type { Dispatch, SetStateAction } from 'react';
import { selectEarningSource, type EarningSource } from '@/lib/earning-sources';
import type { ExpensePlan } from '@/lib/expense-plans';
import { assetRecordKinds, expenses, income, kinds, lendingRecordKinds, type Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { depositToday } from '@/lib/deposit-interest';
import { freshEntry as fresh } from '@/lib/record-save';

export type RecordFormsInput = {
    /** False, after saying so, where the person may not change the workspace. */
    editable: () => boolean;
    setError: Dispatch<SetStateAction<string>>;
    setRecordKinds: Dispatch<SetStateAction<readonly string[]>>;
    setEditing: Dispatch<SetStateAction<Entry | null>>; setDeleting: Dispatch<SetStateAction<Entry | null>>;
    setEditingIncomeSource: Dispatch<SetStateAction<EarningSource | null>>;
    currency: string; section: string; cashFlowSection: boolean;
    holdingAccounts?: HoldingAccount[]; preferredCurrencies: string[]; sources: EarningSource[];
    /** The saved record behind a table row, in its own currency. */
    storedRecord: (record: Entry) => Entry;
};

/** Opening and closing the record form and the delete confirmation. Each form offers only the kinds that fit where it
 * was opened from, and starts in the workspace currency. */
export function recordForms({ editable, setError, setRecordKinds, setEditing, setDeleting, setEditingIncomeSource, currency, section, cashFlowSection, holdingAccounts, preferredCurrencies, sources, storedRecord }: RecordFormsInput) {
    /** Opens the income or expense form; Recurring opens it already repeating. */
    const addCashFlow = (kind: Entry['kind'], frequency: Entry['frequency'] = 'Once') => { if (!editable()) return; setError(''); setRecordKinds(income.includes(kind) ? income : expenses); setEditing({ ...fresh(), currency, kind, frequency }); };
    const addRecord = () => {
        if (!editable()) return;
        if (cashFlowSection) { addCashFlow('Other expense'); return; }
        setError('');
        setRecordKinds(section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : kinds);
        setEditing({ ...fresh(), currency, kind: section === 'Loans & debts' ? 'Mortgage' : 'Cash' });
    };
    const addAccountRecord = (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', holdingAccountId?: string) => {
        if (!editable()) return;
        setError(''); setRecordKinds(holdingAccountId ? [kind] : kind==='Cash'||kind==='Deposit' ? ['Cash','Deposit'] : ['Stock','Crypto']);
        const account=holdingAccounts?.find(item=>item.id===holdingAccountId);
        setEditing({...fresh(),kind,is_investment:kind==='Cash'&&account?.kind==='Cash',currency:account&&preferredCurrencies.includes(account.currency)?account.currency:currency,holding_account_id:holdingAccountId??null});
    };
    /** Opens a record's form; a scheduled income source opens its own form instead. */
    const editRecord = (record: Entry) => {
        const source=sources.find(source=>source.schedule_id===record.id);
        if(!editable())return;
        if(source){setEditingIncomeSource(source);return;}
        setError('');
        setRecordKinds(income.includes(record.kind) ? income : expenses.includes(record.kind) ? expenses : assetRecordKinds.includes(record.kind) ? assetRecordKinds : lendingRecordKinds);
        setEditing(storedRecord(record));
    };
    /** Spending from a monthly expense plan, dated today or the nearest day the plan covers. */
    const spendFromPlan = (plan: ExpensePlan) => {
        setError(''); setRecordKinds(expenses);
        const date = depositToday() < plan.start_date ? plan.start_date : plan.end_date && depositToday() > plan.end_date ? plan.end_date : depositToday();
        setEditing({ ...fresh(), name: plan.name, kind: plan.category === 'Groceries' || plan.category === 'Household' ? 'Living expense' : 'Other expense', currency: plan.currency, frequency: 'Once', expense_plan_id: plan.id, date });
    };
    const quickExpense = () => { if (!editable()) return; setError(''); setRecordKinds(expenses); setEditing({ ...fresh(), currency, kind: 'Other expense', frequency: 'Once' }); };
    const recordFromSource = (source: EarningSource, bonus?: boolean) => { setError(''); const entry = { ...fresh(), kind: source.kind, currency: source.currency, frequency: 'Once' as const }; setRecordKinds(income); setEditing({ ...entry, ...selectEarningSource(entry, source, bonus) }); };
    const reviewRecurring = (record: Entry) => { setError(''); setRecordKinds([...income, ...expenses]); setEditing(record); };
    const requestDelete = (record: Entry) => { if (!editable()) return; setError(''); setDeleting(record); };
    const closeEditing = () => { setError(''); setEditing(null); };
    const closeDeleting = () => { setError(''); setDeleting(null); };
    const field = (key: keyof Entry, v: string | number) => setEditing(p => p ? { ...p, [key]: v, ...(key === 'currency' ? {account_id: null} : {}) } : p);
    const newBusiness = (name = ''): Entry => ({ ...fresh(), name, kind: 'Business', currency, amount: 0 });
    return { addCashFlow, addRecord, addAccountRecord, editRecord, spendFromPlan, quickExpense, recordFromSource, reviewRecurring, requestDelete, closeEditing, closeDeleting, field, newBusiness };
}
