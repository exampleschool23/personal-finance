import { workspaceOwner } from '@/lib/household';
import { transactionRuleSchemas } from '@/lib/transaction-rule-schemas';
import { readOwnerRows } from '@/lib/server-records';
import { crossSite, parseAction, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';

const unavailableMessage = 'Could not update transactions. Check that the latest migrations are installed.';
const unavailable = () => Response.json({ error: unavailableMessage }, { status: 503 });
const failure = (response: Response) => postgrestFailure(response, unavailableMessage, { fallbackStatus: 503 });
async function count(response: Response) { return Number(await response.json()) || 0; }

export async function GET() {
 try {
  const auth = await session(); if (!auth) return signInAgain();
  return Response.json({ rules: await readOwnerRows('transaction_rules', auth.token, { order: 'created_at.desc,id.asc' }) }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), transactionRuleSchemas);
  if (!input) return Response.json({ error: 'Check the rule fields.' }, { status: 400 });
  const rpc = async (name: string, args: unknown) => {
   const response = await supa('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }, auth.token);
   return response.ok ? Response.json({ changed: await count(response) }) : failure(response);
  };
  if (input.action === 'categorize') { const { data } = input; return rpc('set_transaction_category', { p_ids: data.ids, p_kind: data.kind, p_category: data.category_id }); }
  if (input.action === 'business') { const { data } = input; return rpc('set_transaction_business', { p_ids: data.ids, p_business: data.business_id }); }
  if (input.action === 'account_business') { const { data } = input; return rpc('set_account_business', { p_account: data.account_id, p_business: data.business_id }); }
  if (input.action === 'tags') { const { data } = input; return rpc('set_transaction_tags', { p_ids: data.ids, p_add: data.add, p_remove: data.remove }); }
  if (input.action === 'delete_rule') {
   const response = await supa('/rest/v1/transaction_rules?id=eq.' + input.data.id, { method: 'DELETE' }, auth.token);
   return response.ok ? Response.json({ ok: true }) : failure(response);
  }
  const { data } = input;
  const saved = await supa('/rest/v1/transaction_rules?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: data.id, user_id: workspaceOwner(auth), pattern: data.pattern, match: data.match, direction: data.direction, account_id: data.account_id, match_business_id: data.match_business_id, match_kind: data.match_kind, match_category_id: data.match_category_id, amount_min: data.amount_min, amount_max: data.amount_max, kind: data.kind, category_id: data.category_id, business_id: data.business_id, tag_ids: data.tag_ids }) }, auth.token);
  if (!saved.ok) return failure(saved);
  if (!data.apply) return Response.json({ changed: 0 });
  return rpc('apply_transaction_rule', { p_rule: data.id });
 } catch { return unavailable(); }
}
