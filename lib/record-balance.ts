import { income, expenses, type Entry } from './finance';

// A transaction's account delta is independent of its display currency/rounding.
function recordCashEffect(record: Entry): number {
 if (!record.account_id || record.frequency !== 'Once') return 0;
 if (![...income, ...expenses].includes(record.kind)) return 0;
 const rate = record.account_exchange_rate ?? 1;
 if (!Number.isFinite(rate) || rate <= 0) throw Error('Check the dated exchange rate.');
 return (income.includes(record.kind) ? 1 : -1) * record.amount / rate;
}

export function applyRecordChange(rows: Entry[], previous?: Entry, next?: Entry): Entry[] {
 const effects = new Map<string, number>();
 for (const [record, sign] of [[previous, -1], [next, 1]] as const) {
  if (!record?.account_id) continue;
  const account=rows.find(row => row.id === record.account_id && row.kind === 'Cash');
  if (!account) throw Error('Choose a cash account.');
  if (record.currency!==account.currency && record.account_exchange_rate==null) throw Error('Check the dated exchange rate.');
  effects.set(record.account_id, (effects.get(record.account_id) ?? 0) + sign * recordCashEffect(record));
 }
 if (previous?.kind === 'Cash' && !next && rows.some(row => row.account_id === previous.id)) throw Error('This account has linked records.');
 const result = rows.filter(row => row.id !== previous?.id && row.id !== next?.id).map(row => {
  const delta = effects.get(row.id);
  if (delta === undefined) return row;
  const amount = row.amount + delta;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e15) throw Error('Not enough money in the selected cash account.');
  return { ...row, amount };
 });
 return next ? [next, ...result] : result;
}

/** The list as the server will return it after `saved` was stored: the record in its place (a new one first) and its
 * cash account moved by the change. When the account is not in the list, only the record changes. */
export function withSavedRecord(rows: Entry[], saved: Entry): Entry[] {
 const previous = rows.find(row => row.id === saved.id);
 const next: Entry = { ...previous, ...saved };
 let changed: Entry[];
 try { changed = applyRecordChange(rows, previous, next); }
 catch { return previous ? rows.map(row => row.id === saved.id ? next : row) : [next, ...rows]; }
 if (!previous) return changed;
 const byId = new Map(changed.map(row => [row.id, row]));
 return rows.map(row => byId.get(row.id) ?? row);
}

/** The cash accounts money lent in `currency` can be paid from: only one in the loan's own currency. */
export const lendingAccounts = (rows: readonly Entry[], currency: string) => rows.filter(row => row.kind === 'Cash' && row.currency === currency);

/** New money lent paid from a cash account (`lent_from`): the account loses the lent amount, as `lend_from_account`
 * does in the database (migration 121). The saved loan does not keep the account. */
export function lendFromAccount(rows: Entry[], loan: Entry): { rows: Entry[]; loan: Entry } {
 const { lent_from, ...saved } = loan;
 if (!lent_from) return { rows, loan: saved };
 const account = lendingAccounts(rows, loan.currency).find(row => row.id === lent_from);
 if (loan.kind !== 'Money lent' || !account) throw Error('Choose a cash account in the record currency.');
 const amount = Number(account.amount) - loan.amount;
 if (!(loan.amount > 0) || amount < 0) throw Error('Not enough money in the selected cash account.');
 return { rows: rows.map(row => row.id === account.id ? { ...row, amount } : row), loan: saved };
}
