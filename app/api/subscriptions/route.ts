import { workspaceOwner } from '@/lib/household';
import { readOwnerRows } from '@/lib/server-records';
import { crossSite, parseAction, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { subscriptionSchemas, type SubscriptionDecision } from '@/lib/recurring-insights';

const unavailable = () => Response.json({ error: 'Could not load subscriptions. Check that the latest migrations are installed.' }, { status: 503 });
const invalid = () => Response.json({ error: 'Check the subscription fields.' }, { status: 400 });

export async function GET() {
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const decisions = await readOwnerRows<SubscriptionDecision>('subscription_decisions', auth.token, { select: 'merchant,currency,status,decided_on', order: 'merchant.asc,currency.asc' });
  return Response.json({ decisions }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return unavailable(); }
}

/** Saves or removes a decision. The owner always comes from the session, never from the request. */
export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), subscriptionSchemas);
  if (!input) return invalid();
  if (input.action === 'decide') {
   const response = await supa('/rest/v1/subscription_decisions?on_conflict=user_id,merchant,currency', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...input.data, user_id: workspaceOwner(auth) }) }, auth.token);
   return response.ok ? Response.json({ ok: true }) : unavailable();
  }
  const filter = new URLSearchParams({ user_id: 'eq.' + workspaceOwner(auth), merchant: 'eq.' + input.data.merchant, currency: 'eq.' + input.data.currency });
  const response = await supa('/rest/v1/subscription_decisions?' + filter, { method: 'DELETE' }, auth.token);
  return response.ok ? Response.json({ ok: true }) : unavailable();
 } catch { return unavailable(); }
}
