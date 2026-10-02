import { expenses, income, type Entry } from './finance';
import type { Category } from './planning';
import type { TransactionSplit } from './transaction-tools';

/** Where a transaction belongs: a built-in kind, or a custom category on the general kind of its direction. */
export type CategoryChoice = { kind: Entry['kind']; category_id: string | null };
/** "Transactions whose name contains `pattern` belong in this category." */
export type TransactionRule = CategoryChoice & { id: string; pattern: string; direction: Category['direction']; created_at?: string };

export const directionOf = (kind: string): Category['direction'] | null => income.includes(kind) ? 'income' : expenses.includes(kind) ? 'expense' : null;
const sameChoice = (record: Pick<Entry, 'kind' | 'custom_category_id'>, choice: CategoryChoice) => record.kind === choice.kind && (record.custom_category_id ?? null) === choice.category_id;
export const choiceKey = (choice: CategoryChoice) => choice.category_id ?? choice.kind;
export const recordChoice = (record: Pick<Entry, 'kind' | 'custom_category_id'>): CategoryChoice => ({ kind: record.kind, category_id: record.custom_category_id ?? null });

/** Every category of one direction: the built-in kinds, then custom categories on the general kind. */
export function categoryChoices(categories: readonly Category[], direction: Category['direction']): Array<CategoryChoice & { name: string; custom: boolean }> {
 const kinds = direction === 'income' ? income : expenses;
 const general = direction === 'income' ? 'Other income' : 'Other expense';
 return [
  ...kinds.map(kind => ({ kind: kind as Entry['kind'], category_id: null, name: kind, custom: false })),
  ...categories.filter(category => category.direction === direction).map(category => ({ kind: general as Entry['kind'], category_id: category.id, name: category.name, custom: true })),
 ];
}

/** Only plain income and spending can change category here; generated, split and linked rows keep theirs.
 * Mirrors the filter in `public.set_transaction_category`. */
export function canRecategorize(record: Entry, splits: readonly TransactionSplit[] = []) {
 return record.frequency === 'Once' && !!directionOf(record.kind) && !record.movement_id && !record.operation_id && !record.mortgage_payment_id && !record.history_event_id
  && !record.business_id && !record.income_source_id && !record.earning_source_id && !splits.some(part => part.record_id === record.id);
}

/** Moves the chosen transactions of the choice's direction to it; returns the changed records and how many changed. */
export function recategorize(records: readonly Entry[], ids: readonly string[], choice: CategoryChoice, splits: readonly TransactionSplit[] = []) {
 const wanted = new Set(ids), direction = directionOf(choice.kind);
 let changed = 0;
 const next = records.map(record => {
  if (!wanted.has(record.id) || directionOf(record.kind) !== direction || !canRecategorize(record, splits) || sameChoice(record, choice)) return record;
  changed++;
  return { ...record, kind: choice.kind, custom_category_id: choice.category_id };
 });
 return { records: next, changed };
}

export const ruleMatches = (rule: Pick<TransactionRule, 'pattern' | 'direction'>, record: Pick<Entry, 'name' | 'kind' | 'frequency'>) =>
 record.frequency === 'Once' && directionOf(record.kind) === rule.direction && !!rule.pattern.trim() && record.name.toLowerCase().includes(rule.pattern.trim().toLowerCase());

/** Ids a rule would change: matching transactions not already in its category. */
export function ruleTargets(rule: TransactionRule, records: readonly Entry[], splits: readonly TransactionSplit[] = []) {
 return records.filter(record => ruleMatches(rule, record) && canRecategorize(record, splits) && !sameChoice(record, rule)).map(record => record.id);
}

/** A rule suggested from one change: the transaction's name, without trailing reference numbers. */
export function suggestedPattern(name: string) {
 const trimmed = name.trim().replace(/[\s#*-]*\d[\d\s#*-]*$/, '').trim();
 return (trimmed || name.trim()).slice(0, 120);
}
