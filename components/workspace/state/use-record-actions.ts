"use client";
import type { Dispatch, SetStateAction } from 'react';
import type { MortgagePayment } from '@/components/mortgage-payment-dialog';
import { requestJson } from '@/lib/api-client';
import { assignBusiness, moveAccountToBusiness } from '@/lib/business';
import { decimalSum } from '@/lib/decimal-amounts';
import { showSaved } from '@/lib/feedback';
import { normalizeEntry, type Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { assignOwner, demoHousehold, moveAccountToOwner } from '@/lib/household';
import { applyRecordChange } from '@/lib/record-balance';
import { freshEntry as fresh } from '@/lib/record-save';
import { recategorize, type CategoryChoice } from '@/lib/transaction-rules';
import type { TransactionSplit } from '@/lib/transaction-tools';

type Change = { changed: number; records: Entry[] };
export type RecordActionsInput = {
    demo: boolean; rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>; refreshRecords: () => void;
    splits: readonly TransactionSplit[];
    /** Custom categories, so an unnamed transaction's name follows its category. */
    categories: readonly { id: string; name: string }[];
    household: { attribute: (ids: string[], owner: string) => Promise<number>; setAccountOwner: (account: string, owner: string) => Promise<number> };
    demoHoldingAccounts: HoldingAccount[]; setDemoHoldingAccounts: Dispatch<SetStateAction<HoldingAccount[]>>;
    /** The scheduled record whose repetition is being ended. */
    stopping: Entry | null;
};

/** Changes to records outside the record form. In the sample workspace each one changes the local rows; signed in,
 * it is sent and the records are read again. The bulk changes resolve to how many records changed. */
export function useRecordActions({ demo, rows, setRows, refreshRecords, splits, categories, household, demoHoldingAccounts, setDemoHoldingAccounts, stopping }: RecordActionsInput) {
    /** Applies a change to the sample rows and returns how many it changed. */
    const changeRows = (apply: (records: Entry[]) => Change) => { const { changed } = apply(rows); setRows(previous => apply(previous).records); return changed; };
    /** Sends a bulk change of transactions and reloads; resolves to how many changed. */
    async function sendChange(action: string, data: unknown) {
        const result = await requestJson<{ changed?: number }>('/api/transaction-rules', { body: { action, data } });
        refreshRecords();
        return result.changed ?? 0;
    }
    async function stopRecord(end_date:string) {
        if(!stopping)return;
        const stopped={...normalizeEntry(stopping),end_date,account_exchange_rate:undefined};
        if(demo)setRows(previous=>previous.map(row=>row.id===stopped.id?stopped:row));
        else { await requestJson('/api/records',{body:stopped}); refreshRecords(); }
        showSaved();
    }
    async function recordMortgagePayment(payment: MortgagePayment) {
        if (demo) {
            setRows(previous => {
                if (previous.some(row => row.id === payment.id)) return previous;
                const mortgage = previous.find(row => row.id === payment.mortgage_id)!;
                return [...previous.map(row => row.id === mortgage.id ? { ...row, amount: row.amount - payment.principal } : row), { ...fresh(), id: payment.id, name: mortgage.name, kind: 'Other expense', currency: mortgage.currency, amount: decimalSum([payment.principal, payment.interest]), date: payment.date, notes: payment.notes, mortgage_payment_id: payment.id, payment_principal: payment.principal, payment_interest: payment.interest }];
            });
        } else {
            const crossCurrency=payment.exchange_rate!==undefined;
            const payload=crossCurrency?{...payment,record_id:payment.mortgage_id,type:'mortgage_payment',amount:decimalSum([payment.principal,payment.interest]),balance:null}:payment;
            await requestJson(crossCurrency?'/api/investment-history/exchange':'/api/mortgage-payments', { body: payload, fallback: 'Payment could not be confirmed. Retry with the same details.' });
            refreshRecords();
        }
        showSaved();
    }
    const saveHoldingAccount = async (account: HoldingAccount) => {
        if(demo){setDemoHoldingAccounts(items=>[...items.filter(item=>item.id!==account.id),account]);showSaved();return;}
        await requestJson('/api/holding-accounts',{body:{action:'save',...account}});
        refreshRecords();
        showSaved();
    };
    const assignHolding = async (record: Entry, accountId: string|null) => {
        if(demo){setRows(items=>items.map(item=>item.id===record.id?{...item,holding_account_id:accountId}:item));showSaved();return;}
        await requestJson('/api/holding-accounts',{body:{action:'assign',record_id:record.id,holding_account_id:accountId}});
        refreshRecords();
        showSaved();
    };
    /** Moves transactions to another category: the Transactions page's inline change, Edit multiple and rules. */
    async function categorize(ids: string[], choice: CategoryChoice) {
        if (demo) return changeRows(records => recategorize(records, ids, choice, splits, categories));
        return sendChange('categorize', { ids, kind: choice.kind, category_id: choice.category_id });
    }
    /** Moves transactions to a business, or to the household with null. */
    async function assignTransactionsBusiness(ids: string[], business: string | null) {
        if (demo) {
            const names = new Map(rows.filter(row => row.kind === 'Business').map(row => [row.id, row.name]));
            return changeRows(records => assignBusiness(records, ids, business, names));
        }
        return sendChange('business', { ids, business_id: business });
    }
    /** Puts an account in a business (or the household); its transactions that followed it move too. */
    async function setAccountBusiness(accountId: string, business: string | null) {
        if (demo) return changeRows(records => moveAccountToBusiness(records, accountId, business));
        return sendChange('account_business', { account_id: accountId, business_id: business });
    }
    /** Gives records to an owner of the household: a person, or everyone with `SHARED`. */
    async function assignRecordOwner(ids: string[], owner: string) {
        if (demo) return changeRows(records => assignOwner(records, ids, owner, demoHousehold));
        const changed = await household.attribute(ids, owner);
        refreshRecords();
        return changed;
    }
    /** Gives an account to an owner; the records that followed it (its transactions, its holdings) move too. */
    async function setAccountOwner(accountId: string, owner: string) {
        if (demo) {
            const moved = moveAccountToOwner(rows, demoHoldingAccounts, accountId, owner, demoHousehold);
            setRows(previous => moveAccountToOwner(previous, demoHoldingAccounts, accountId, owner, demoHousehold).records);
            setDemoHoldingAccounts(moved.accounts);
            return moved.changed;
        }
        const changed = await household.setAccountOwner(accountId, owner);
        refreshRecords();
        return changed;
    }
    /** Saves a business profile (a Business record) outside the record dialog: business setup and Settings. */
    async function saveBusiness(entry: Entry) {
        const record = normalizeEntry(entry);
        if (demo) setRows(previous => applyRecordChange(previous, previous.find(row => row.id === record.id), record));
        else { await requestJson('/api/records', { body: record }); refreshRecords(); }
    }
    return { stopRecord, recordMortgagePayment, saveHoldingAccount, assignHolding, categorize, assignTransactionsBusiness, setAccountBusiness, assignRecordOwner, setAccountOwner, saveBusiness };
}
