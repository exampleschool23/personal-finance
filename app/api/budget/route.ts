import type { z } from 'zod';
import type { BudgetState } from '@/lib/budget';
import { budgetSchemas } from '@/lib/budget-schemas';
import { readOwnerRows } from '@/lib/server-records';
import { session, supa, sameOrigin } from '@/lib/supabase';

const failure = () => Response.json({ error: 'Could not load or save the budget. Check that the latest migrations are installed.' }, { status: 503 });

export async function GET() {
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const [settings, categories, amounts] = await Promise.all([
   readOwnerRows<{ mode: BudgetState['mode']; apply_forward: boolean }>('budget_settings', auth.token, { order: 'user_id.asc' }),
   readOwnerRows<BudgetState['categories'][number]>('budget_categories', auth.token, { order: 'category_key.asc' }),
   readOwnerRows<BudgetState['amounts'][number]>('budget_amounts', auth.token, { order: 'category_key.asc,month.asc' }),
  ]);
  const state: BudgetState = {
   mode: settings[0]?.mode ?? 'category',
   applyForward: settings[0]?.apply_forward ?? false,
   categories: categories.map(row => ({ ...row, rollover_start: row.rollover_start?.slice(0, 7) ?? null, ...(row.rollover_balance === undefined ? {} : { rollover_balance: Number(row.rollover_balance) }) })),
   amounts: amounts.map(row => ({ category_key: row.category_key, month: row.month.slice(0, 7), amount: Number(row.amount), currency: row.currency, applies_forward: row.applies_forward })),
  };
  return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return failure(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const body = await req.json() as { action?: string; data?: unknown };
  if (!body.action || !Object.hasOwn(budgetSchemas, body.action)) return Response.json({ error: 'Check the budget fields.' }, { status: 400 });
  const parsed = budgetSchemas[body.action as keyof typeof budgetSchemas].safeParse(body.data);
  if (!parsed.success) return Response.json({ error: 'Check the budget fields.' }, { status: 400 });
  let response: Response;
  if (body.action === 'amount') {
   const data = parsed.data as z.infer<typeof budgetSchemas.amount>;
   response = await supa('/rest/v1/rpc/set_budget_amount', { method: 'POST', body: JSON.stringify({ p_key: data.category_key, p_month: data.month + '-01', p_amount: data.amount, p_currency: data.currency, p_forward: data.applies_forward }) }, auth.token);
  } else if (body.action === 'category') {
   const { rollover_balance, rollover_currency, rollover_negative, ...data } = parsed.data as z.infer<typeof budgetSchemas.category>;
   // Rollover details are saved only with a rollover fund (migration 098); other settings never depend on them.
   const fund = data.rollover ? { rollover_balance: rollover_balance ?? 0, rollover_currency: rollover_balance ? rollover_currency : null, rollover_negative: rollover_negative ?? true } : {};
   response = await supa('/rest/v1/budget_categories?on_conflict=user_id,category_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...data, ...fund, rollover_start: data.rollover_start ? data.rollover_start + '-01' : null, user_id: auth.user.id, updated_at: new Date().toISOString() }) }, auth.token);
  } else {
   response = await supa('/rest/v1/budget_settings?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...parsed.data, user_id: auth.user.id, updated_at: new Date().toISOString() }) }, auth.token);
  }
  if (!response.ok) return failure();
  return Response.json({ ok: true });
 } catch { return failure(); }
}
