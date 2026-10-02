import { z } from 'zod';
import { uuid } from './api-validation';
import { expenses, income } from './finance';

const kind = z.enum([...income, ...expenses] as [string, ...string[]]);
const ids = z.array(uuid).min(1).max(500);
const unique = (list: string[]) => new Set(list).size === list.length;
const tags = z.array(uuid).max(20).refine(unique);
/** Category, business and tag changes and rules from the Transactions page. The database checks ownership and directions again. */
export const transactionRuleSchemas = {
 categorize: z.object({ ids, kind, category_id: uuid.nullable() }),
 business: z.object({ ids, business_id: uuid.nullable() }),
 account_business: z.object({ account_id: uuid, business_id: uuid.nullable() }),
 tags: z.object({ ids, add: tags, remove: tags }),
 // A rule sets a category, a business, tags, or any of them; without a category it may match income and expenses alike.
 save_rule: z.object({ id: uuid, pattern: z.string().trim().min(1).max(120), direction: z.enum(['income', 'expense', 'any']), kind: kind.nullable(), category_id: uuid.nullable(), business_id: uuid.nullable(), tag_ids: z.array(uuid).max(10).refine(unique), apply: z.boolean() })
  .refine(rule => rule.kind !== null || rule.business_id !== null || rule.tag_ids.length > 0)
  .refine(rule => rule.kind === null || rule.direction === (income.includes(rule.kind as string) ? 'income' : 'expense')),
 delete_rule: z.object({ id: uuid }),
};
