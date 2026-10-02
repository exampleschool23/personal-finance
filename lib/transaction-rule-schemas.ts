import { z } from 'zod';
import { uuid } from './api-validation';
import { expenses, income } from './finance';

const kind = z.enum([...income, ...expenses] as [string, ...string[]]);
/** Category changes and rules from the Transactions page. Directions are checked again by the database. */
export const transactionRuleSchemas = {
 categorize: z.object({ ids: z.array(uuid).min(1).max(500), kind, category_id: uuid.nullable() }),
 save_rule: z.object({ id: uuid, pattern: z.string().trim().min(1).max(120), kind, category_id: uuid.nullable(), apply: z.boolean() }),
 delete_rule: z.object({ id: uuid }),
};
