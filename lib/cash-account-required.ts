import { income, expenses, type Entry } from '@/lib/finance';

export function requiresCashAccount(entry:Pick<Entry,'kind'|'frequency'>){
 return entry.frequency==='Once'&&[...income,...expenses].includes(entry.kind);
}
