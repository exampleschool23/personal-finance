import { income, expenses, type Entry } from '@/lib/finance';

export function requiresCashAccount(entry:Pick<Entry,'kind'|'frequency'>){
 return entry.frequency==='Once'&&[...income,...expenses].includes(entry.kind);
}

/** Income and expenses always move money: a blank or zero amount is a mistake, not a record. */
export function cashFlowAmountMissing(entry:Pick<Entry,'kind'|'amount'>){
 return [...income,...expenses].includes(entry.kind)&&!(Number(entry.amount)>0);
}
