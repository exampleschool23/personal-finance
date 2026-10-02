import type { z } from 'zod';
import { transactionRuleSchemas } from '@/lib/transaction-rule-schemas';
import { readOwnerRows } from '@/lib/server-records';
import { session, supa, sameOrigin } from '@/lib/supabase';

const unavailable = () => Response.json({ error: 'Could not update transactions. Check that the latest migrations are installed.' }, { status: 503 });
async function failure(response: Response) {
 const detail = await response.json().catch(() => ({})) as { code?: string; message?: string };
 return detail.code === 'P0001' ? Response.json({ error: detail.message }, { status: 409 }) : unavailable();
}
async function count(response: Response) { return Number(await response.json()) || 0; }
type Input<K extends keyof typeof transactionRuleSchemas> = z.infer<typeof transactionRuleSchemas[K]>;

export async function GET() {
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  return Response.json({ rules: await readOwnerRows('transaction_rules', auth.token, { order: 'created_at.desc,id.asc' }) }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const body = await req.json() as { action?: string; data?: unknown };
  if (!body.action || !Object.hasOwn(transactionRuleSchemas, body.action)) return Response.json({ error: 'Check the rule fields.' }, { status: 400 });
  const parsed = transactionRuleSchemas[body.action as keyof typeof transactionRuleSchemas].safeParse(body.data);
  if (!parsed.success) return Response.json({ error: 'Check the rule fields.' }, { status: 400 });
  const rpc = async (name: string, args: unknown) => {
   const response = await supa('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }, auth.token);
   return response.ok ? Response.json({ changed: await count(response) }) : failure(response);
  };
  if (body.action === 'categorize') { const data = parsed.data as Input<'categorize'>; return rpc('set_transaction_category', { p_ids: data.ids, p_kind: data.kind, p_category: data.category_id }); }
  if (body.action === 'business') { const data = parsed.data as Input<'business'>; return rpc('set_transaction_business', { p_ids: data.ids, p_business: data.business_id }); }
  if (body.action === 'account_business') { const data = parsed.data as Input<'account_business'>; return rpc('set_account_business', { p_account: data.account_id, p_business: data.business_id }); }
  if (body.action === 'tags') { const data = parsed.data as Input<'tags'>; return rpc('set_transaction_tags', { p_ids: data.ids, p_add: data.add, p_remove: data.remove }); }
  if (body.action === 'delete_rule') {
   const response = await supa('/rest/v1/transaction_rules?id=eq.' + (parsed.data as Input<'delete_rule'>).id, { method: 'DELETE' }, auth.token);
   return response.ok ? Response.json({ ok: true }) : failure(response);
  }
  const data = parsed.data as Input<'save_rule'>;
  const saved = await supa('/rest/v1/transaction_rules?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: data.id, user_id: auth.user.id, pattern: data.pattern, direction: data.direction, kind: data.kind, category_id: data.category_id, business_id: data.business_id, tag_ids: data.tag_ids }) }, auth.token);
  if (!saved.ok) return failure(saved);
  if (!data.apply) return Response.json({ changed: 0 });
  return rpc('apply_transaction_rule', { p_rule: data.id });
 } catch { return unavailable(); }
}
