import { income, expenses, type Entry } from './finance';

// A transaction's account delta is independent of its display currency/rounding.
export function recordCashEffect(record: Entry): number {
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
