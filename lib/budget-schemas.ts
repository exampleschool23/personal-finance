import { z } from 'zod';
import { fiatCurrency } from './api-validation';
import { budgetTypes } from './budget';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const key = z.string().trim().min(1).max(80);
/** Saved budget changes: one amount, one category's settings, or the budget style and edit scope. */
export const budgetSchemas = {
 amount: z.object({ category_key: key, month, amount: z.number().finite().min(0).max(1e15), currency: fiatCurrency, applies_forward: z.boolean() }),
 category: z.object({ category_key: key, budget_type: z.enum(budgetTypes), group_name: z.string().trim().min(1).max(60).nullable(), rollover: z.boolean(), rollover_start: month.nullable(), excluded: z.boolean() }),
 settings: z.object({ mode: z.enum(['category', 'flex']), apply_forward: z.boolean() }),
};
