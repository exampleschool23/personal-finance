import { income, expenses, type Entry } from './finance';

// Recurring records are schedules; only their recorded payments are history.
export function isTransactionHistory(entry: Pick<Entry, 'kind' | 'frequency'>) {
 return entry.frequency === 'Once' && [...income, ...expenses].includes(entry.kind);
}
