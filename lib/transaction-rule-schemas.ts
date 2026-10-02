import { z } from 'zod';
import { uuid } from './api-validation';
import { expenses, income } from './finance';

const kind = z.enum([...income, ...expenses] as [string, ...string[]]);
const ids = z.array(uuid).min(1).max(500);
const unique = (list: string[]) => new Set(list).size === list.length;
const tags = z.array(uuid).max(20).refine(unique);
const amount = z.number().finite().min(0).max(1e15);
const directionOfKind = (value: string) => income.includes(value) ? 'income' : 'expense';
/** Category, business and tag changes and rules from the Transactions page. The database checks ownership and directions again. */
export const transactionRuleSchemas = {
 categorize: z.object({ ids, kind, category_id: uuid.nullable() }),
 business: z.object({ ids, business_id: uuid.nullable() }),
 account_business: z.object({ account_id: uuid, business_id: uuid.nullable() }),
 tags: z.object({ ids, add: tags, remove: tags }),
 // A rule sets a category, a business, tags, or any of them; without a category it may match income and expenses alike.
 // Its criteria are a name (contained or exact) and, optionally, an account, a business, a category and an amount range.
 save_rule: z.object({
  id: uuid, pattern: z.string().trim().max(120), match: z.enum(['contains', 'exact']), direction: z.enum(['income', 'expense', 'any']),
  account_id: uuid.nullable(), match_business_id: uuid.nullable(), match_kind: kind.nullable(), match_category_id: uuid.nullable(), amount_min: amount.nullable(), amount_max: amount.nullable(),
  kind: kind.nullable(), category_id: uuid.nullable(), business_id: uuid.nullable(), tag_ids: z.array(uuid).max(10).refine(unique), apply: z.boolean(),
 })
  .refine(rule => rule.kind !== null || rule.business_id !== null || rule.tag_ids.length > 0)
  .refine(rule => rule.kind === null || rule.direction === directionOfKind(rule.kind))
  .refine(rule => rule.pattern.length > 0 || rule.account_id !== null || rule.match_business_id !== null || rule.match_kind !== null || rule.amount_min !== null || rule.amount_max !== null)
  .refine(rule => rule.match_kind === null || rule.direction === 'any' || rule.direction === directionOfKind(rule.match_kind))
  .refine(rule => rule.match_category_id === null || rule.match_kind === 'Other income' || rule.match_kind === 'Other expense')
  .refine(rule => rule.amount_max === null || rule.amount_max >= (rule.amount_min ?? 0)),
 delete_rule: z.object({ id: uuid }),
};
