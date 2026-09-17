import { z } from 'zod';
import { isCurrency } from '@/lib/currencies';
import { session, sameOrigin, supa } from '@/lib/supabase';
const account = z.object({ action: z.literal('save'), id: z.string().uuid(), name: z.string().trim().min(1).max(120), kind: z.enum(['Stock', 'Crypto']), currency: z.string().refine(isCurrency) });
const assignment = z.object({ action: z.literal('assign'), record_id: z.string().uuid(), holding_account_id: z.string().uuid().nullable() });
const schema = z.discriminatedUnion('action', [account, assignment]);
export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session();
  if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Check the account fields.' }, { status: 400 });
  const data = parsed.data;
  const response = data.action === 'save'
   ? await supa('/rest/v1/holding_accounts?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ id: data.id, name: data.name, kind: data.kind, currency: data.currency, user_id: auth.user.id }) }, auth.token)
   : await supa(`/rest/v1/finance_records?id=eq.${data.record_id}&kind=in.(Cash,Stock,Crypto)`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ holding_account_id: data.holding_account_id }) }, auth.token);
  if (!response.ok) {
   const failure = await response.json() as { message?: string };
   const known = ['Update the investment goals before removing or changing this account.','Update the investment goals before changing this account type.','Choose one of your matching stock or crypto accounts.', 'Move the holdings before changing this account type.'];
   return Response.json({ error: known.includes(failure.message ?? '') ? failure.message : 'Could not save the account. Check that the latest migrations are installed.' }, { status: 409 });
  }
  const rows = await response.json() as unknown[];
  if (!rows.length) return Response.json({ error: 'Account or holding not found.' }, { status: 404 });
  return Response.json({ ok: true });
 } catch { return Response.json({ error: 'Connection unavailable. Please try again.' }, { status: 503 }); }
}
