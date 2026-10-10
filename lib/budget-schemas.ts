import { z } from 'zod';
import { fiatCurrency, month } from './api-validation';
import { budgetTypes } from './budget';

const key = z.string().trim().min(1).max(80);
const amount = z.number().finite().min(0).max(1e15);
/** Saved budget changes: one amount, a month's amounts together (Recalculate), one category's settings, or the budget
 * style and edit scope. */
export const budgetSchemas = {
 amount: z.object({ category_key: key, month, amount, currency: fiatCurrency, applies_forward: z.boolean() }),
 /** The "Apply to all future months" tick taken off: this month's amount for this month only, and nothing planned after (`set_budget_amount_once`). */
 amount_once: z.object({ category_key: key, month, amount, currency: fiatCurrency }),
 amounts: z.object({ month, currency: fiatCurrency, items: z.array(z.object({ category_key: key, amount, applies_forward: z.boolean() })).min(1).max(500)
  .refine(items => new Set(items.map(item => item.category_key)).size === items.length) }),
 category: z.object({ category_key: key, budget_type: z.enum(budgetTypes), group_name: z.string().trim().min(1).max(60).nullable(), rollover: z.boolean(), rollover_start: month.nullable(), excluded: z.boolean(),
  rollover_balance: z.number().finite().min(0).max(1e15).optional(), rollover_currency: fiatCurrency.nullable().optional(), rollover_negative: z.boolean().optional() })
  .refine(data => !data.rollover_balance || !!data.rollover_currency, { path: ['rollover_currency'] }),
 settings: z.object({ mode: z.enum(['category', 'flex']), apply_forward: z.boolean() }),
};
