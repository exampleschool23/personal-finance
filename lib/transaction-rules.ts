import { expenses, income, type Entry } from './finance';
import type { Category } from './planning';
import type { TransactionSplit } from './transaction-tools';
import { canAssignBusiness } from './business';
import { canTag } from './tags';

/** Where a transaction belongs: a built-in kind, or a custom category on the general kind of its direction. */
export type CategoryChoice = { kind: Entry['kind']; category_id: string | null };
/** "Transactions matching these criteria get this category, business and tags." The criteria: words the name
 * contains (or the exact name), and optionally an account, a business, a category and an amount range; at least one
 * is set. Each action is optional, but a rule has at least one; a rule without a category may match income and
 * expenses alike (`any`). */
export type TransactionRule = {
 id: string; pattern: string; match: 'contains' | 'exact'; direction: Category['direction'] | 'any';
 account_id: string | null; match_business_id: string | null; match_kind: Entry['kind'] | null; match_category_id: string | null; amount_min: number | null; amount_max: number | null;
 kind: Entry['kind'] | null; category_id: string | null; business_id: string | null; tag_ids: string[]; created_at?: string;
};
/** The criteria a rule may leave unset, as a saved rule from before they existed has them. */
export const openCriteria = { match: 'contains', account_id: null, match_business_id: null, match_kind: null, match_category_id: null, amount_min: null, amount_max: null } as const;
type Criteria = Pick<TransactionRule, 'pattern' | 'direction'> & Partial<Omit<TransactionRule, 'pattern' | 'direction'>>;
/** The category a rule requires, if any. */
export const ruleCriterion = (rule: Criteria): CategoryChoice | null => rule.match_kind ? { kind: rule.match_kind, category_id: rule.match_category_id ?? null } : null;
/** How many criteria a rule sets besides the name. */
export const extraCriteria = (rule: Criteria) => [rule.account_id, rule.match_business_id, rule.match_kind, rule.amount_min ?? rule.amount_max].filter(value => value !== null && value !== undefined).length;
/** A rule must narrow something: a name, or one of the other criteria. */
export const hasCriteria = (rule: Criteria) => !!rule.pattern.trim() || extraCriteria(rule) > 0;
/** The category a rule sets, if any. */
export const ruleChoice = (rule: Pick<TransactionRule, 'kind' | 'category_id'>): CategoryChoice | null => rule.kind ? { kind: rule.kind, category_id: rule.category_id } : null;

export const directionOf = (kind: string): Category['direction'] | null => income.includes(kind) ? 'income' : expenses.includes(kind) ? 'expense' : null;
const sameChoice = (record: Pick<Entry, 'kind' | 'custom_category_id'>, choice: CategoryChoice) => record.kind === choice.kind && (record.custom_category_id ?? null) === choice.category_id;
export const choiceKey = (choice: CategoryChoice) => choice.category_id ?? choice.kind;

/** Every category of one direction: the built-in kinds, then custom categories on the general kind. */
export function categoryChoices(categories: readonly Category[], direction: Category['direction']): Array<CategoryChoice & { name: string; custom: boolean }> {
 const kinds = direction === 'income' ? income : expenses;
 const general = direction === 'income' ? 'Other income' : 'Other expense';
 return [
  ...kinds.map(kind => ({ kind: kind as Entry['kind'], category_id: null, name: kind, custom: false })),
  ...categories.filter(category => category.direction === direction).map(category => ({ kind: general as Entry['kind'], category_id: category.id, name: category.name, custom: true })),
 ];
}

/** Only plain income and spending can change category here; generated, split and source-linked rows keep theirs.
 * A business transaction may take any category. Mirrors the filter in `public.recategorize_transactions`. */
export function canRecategorize(record: Entry, splits: readonly TransactionSplit[] = []) {
 return record.frequency === 'Once' && !!directionOf(record.kind) && !record.movement_id && !record.operation_id && !record.mortgage_payment_id && !record.history_event_id
  && !record.income_source_id && !record.earning_source_id && !splits.some(part => part.record_id === record.id);
}
/** Business income always names its business, so only a transaction with a business can move into it. */
export const canTakeCategory = (record: Entry, choice: CategoryChoice, splits: readonly TransactionSplit[] = []) => canRecategorize(record, splits) && (choice.kind !== 'Business income' || !!record.business_id);

/** Moves the chosen transactions of the choice's direction to it; returns the changed records and how many changed. */
export function recategorize(records: readonly Entry[], ids: readonly string[], choice: CategoryChoice, splits: readonly TransactionSplit[] = []) {
 const wanted = new Set(ids), direction = directionOf(choice.kind);
 let changed = 0;
 const next = records.map(record => {
  if (!wanted.has(record.id) || directionOf(record.kind) !== direction || !canTakeCategory(record, choice, splits) || sameChoice(record, choice)) return record;
  changed++;
  return { ...record, kind: choice.kind, custom_category_id: choice.category_id };
 });
 return { records: next, changed };
}

/** Whether a rule's criteria hold for a transaction; mirrors `public.transaction_rule_matches` and the direction test beside it. */
export function ruleMatches(rule: Criteria, record: Pick<Entry, 'name' | 'kind' | 'frequency'> & Partial<Pick<Entry, 'account_id' | 'business_id' | 'custom_category_id' | 'amount'>>) {
 const pattern = rule.pattern.trim().toLowerCase(), name = record.name.toLowerCase();
 return record.frequency === 'Once' && !!directionOf(record.kind) && (rule.direction === 'any' || directionOf(record.kind) === rule.direction) && hasCriteria(rule)
  && (rule.match === 'exact' ? name.trim() === pattern : name.includes(pattern))
  && (!rule.account_id || record.account_id === rule.account_id)
  && (!rule.match_business_id || record.business_id === rule.match_business_id)
  && (!rule.match_kind || (record.kind === rule.match_kind && (record.custom_category_id ?? null) === (rule.match_category_id ?? null)))
  && (rule.amount_min === null || rule.amount_min === undefined || Number(record.amount) >= rule.amount_min)
  && (rule.amount_max === null || rule.amount_max === undefined || Number(record.amount) <= rule.amount_max);
}

/** Ids a rule would change: matching transactions that lack its category, its business or one of its tags.
 * `tagsOf` gives a transaction's tag ids. */
export function ruleTargets(rule: TransactionRule, records: readonly Entry[], splits: readonly TransactionSplit[] = [], tagsOf: (id: string) => readonly string[] = () => []) {
 const choice = ruleChoice(rule);
 return records.filter(record => ruleMatches(rule, record) && (
  (!!choice && canTakeCategory(record, choice, splits) && !sameChoice(record, choice))
  || (!!rule.business_id && canAssignBusiness(record, rule.business_id))
  || (canTag(record) && rule.tag_ids.some(tag => !tagsOf(record.id).includes(tag))))).map(record => record.id);
}

/** A rule suggested from one change: the transaction's name, without trailing reference numbers. */
export function suggestedPattern(name: string) {
 const trimmed = name.trim().replace(/[\s#*-]*\d[\d\s#*-]*$/, '').trim();
 return (trimmed || name.trim()).slice(0, 120);
}
