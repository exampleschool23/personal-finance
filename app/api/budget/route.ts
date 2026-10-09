import { workspaceOwner } from '@/lib/household';
import type { BudgetState } from '@/lib/budget';
import { budgetSchemas } from '@/lib/budget-schemas';
import { readOwnerRows } from '@/lib/server-records';
import { crossSite, parseAction, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';

const failure = () => Response.json({ error: 'Could not load or save the budget. Check that the latest migrations are installed.' }, { status: 503 });

export async function GET() {
 try {
  const auth = await session(); if (!auth) return signInAgain();
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
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), budgetSchemas);
  if (!input) return Response.json({ error: 'Check the budget fields.' }, { status: 400 });
  let response: Response;
  if (input.action === 'amount') {
   const { data } = input;
   response = await supa('/rest/v1/rpc/set_budget_amount', { method: 'POST', body: JSON.stringify({ p_key: data.category_key, p_month: data.month + '-01', p_amount: data.amount, p_currency: data.currency, p_forward: data.applies_forward }) }, auth.token);
  } else if (input.action === 'amounts') {
   // Every item is saved in one transaction: a refused one leaves the budget as it was.
   const { data } = input;
   response = await supa('/rest/v1/rpc/set_budget_amounts', { method: 'POST', body: JSON.stringify({ p_month: data.month + '-01', p_currency: data.currency, p_items: data.items }) }, auth.token);
  } else if (input.action === 'category') {
   const { rollover_balance, rollover_currency, rollover_negative, ...data } = input.data;
   // Rollover details are saved only with a rollover fund (migration 098); other settings never depend on them.
   const fund = data.rollover ? { rollover_balance: rollover_balance ?? 0, rollover_currency: rollover_balance ? rollover_currency : null, rollover_negative: rollover_negative ?? true } : {};
   response = await supa('/rest/v1/budget_categories?on_conflict=user_id,category_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...data, ...fund, rollover_start: data.rollover_start ? data.rollover_start + '-01' : null, user_id: workspaceOwner(auth), updated_at: new Date().toISOString() }) }, auth.token);
  } else {
   response = await supa('/rest/v1/budget_settings?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...input.data, user_id: workspaceOwner(auth), updated_at: new Date().toISOString() }) }, auth.token);
  }
  if (!response.ok) return failure();
  return Response.json({ ok: true });
 } catch { return failure(); }
}
