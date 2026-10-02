import type { z } from 'zod';
import { directionOf } from '@/lib/transaction-rules';
import { transactionRuleSchemas } from '@/lib/transaction-rule-schemas';
import { readOwnerRows } from '@/lib/server-records';
import { session, supa, sameOrigin } from '@/lib/supabase';

const unavailable = () => Response.json({ error: 'Could not update transactions. Check that the latest migrations are installed.' }, { status: 503 });
async function failure(response: Response) {
 const detail = await response.json().catch(() => ({})) as { code?: string; message?: string };
 return detail.code === 'P0001' ? Response.json({ error: detail.message }, { status: 409 }) : unavailable();
}
async function count(response: Response) { return Number(await response.json()) || 0; }

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
  const rpc = (name: string, args: unknown) => supa('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }, auth.token);
  if (body.action === 'categorize') {
   const data = parsed.data as z.infer<typeof transactionRuleSchemas.categorize>;
   const response = await rpc('set_transaction_category', { p_ids: data.ids, p_kind: data.kind, p_category: data.category_id });
   return response.ok ? Response.json({ changed: await count(response) }) : failure(response);
  }
  if (body.action === 'delete_rule') {
   const response = await supa('/rest/v1/transaction_rules?id=eq.' + (parsed.data as { id: string }).id, { method: 'DELETE' }, auth.token);
   return response.ok ? Response.json({ ok: true }) : failure(response);
  }
  const data = parsed.data as z.infer<typeof transactionRuleSchemas.save_rule>;
  const saved = await supa('/rest/v1/transaction_rules?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: data.id, user_id: auth.user.id, pattern: data.pattern, direction: directionOf(data.kind), kind: data.kind, category_id: data.category_id }) }, auth.token);
  if (!saved.ok) return failure(saved);
  if (!data.apply) return Response.json({ changed: 0 });
  const applied = await rpc('apply_transaction_rule', { p_rule: data.id });
  return applied.ok ? Response.json({ changed: await count(applied) }) : failure(applied);
 } catch { return unavailable(); }
}
