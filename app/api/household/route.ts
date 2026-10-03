import { cookies } from 'next/headers';
import { accountOrigin } from '@/lib/account-access';
import { householdSchemas, inviteLink, knownHouseholdMessage, workspaceCookie, workspaceHeader, type HouseholdAction, type HouseholdPerson, type HouseholdState } from '@/lib/household';
import { session, supa, sameOrigin } from '@/lib/supabase';

// Every check happens in the database (migration 100): household_state lists only the
// caller's own household and memberships, and the open workspace is honoured there
// only for someone who belongs to it. The cookie merely remembers the choice.
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => reply({ error: 'Could not load your household. Check that database update 100 is installed.' }, 503);
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };
type Stored = Omit<HouseholdState, 'active' | 'role' | 'people'>;

async function rpc<T>(name: string, args: Record<string, unknown>, token: string, workspace = ''): Promise<{ ok: true; data: T } | { ok: false; error: string | null }> {
 // The workspace is always named explicitly: personal calls send none, household_people the one being checked.
 const response = await supa('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args), headers: { [workspaceHeader]: workspace } }, token);
 if (response.ok) return { ok: true, data: await response.json() as T };
 const failure = await response.json().catch(() => ({})) as { message?: string };
 return { ok: false, error: knownHouseholdMessage(failure.message) };
}
const failed = (result: { error: string | null }) => result.error ? reply({ error: result.error }, 409) : unavailable();

/** The household as Settings and the workspace switcher show it, with the open workspace checked against the database. */
async function state(token: string, wanted: string): Promise<HouseholdState | null> {
 const stored = await rpc<Stored>('household_state', {}, token);
 if (!stored.ok) return null;
 const membership = stored.data.memberships.find(item => item.owner_id === wanted);
 const active = membership ? wanted : stored.data.me;
 if (!membership) (await cookies()).delete(workspaceCookie);
 const people = await rpc<HouseholdPerson[]>('household_people', {}, token, active === stored.data.me ? '' : active);
 if (!people.ok) return null;
 return { ...stored.data, active, role: membership?.role ?? 'owner', people: people.data };
}

export async function GET() {
 try {
  const auth = await session(); if (!auth) return reply({ error: 'Please sign in again.' }, 401);
  const wanted = auth.owner ?? auth.user.id;
  const result = await state(auth.token, wanted);
  return result ? reply(result.active === wanted ? result : { ...result, reset: true }) : unavailable();
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session(); if (!auth) return reply({ error: 'Please sign in again.' }, 401);
  const body = await req.json().catch(() => ({})) as { action?: string; data?: unknown };
  if (!body.action || !Object.hasOwn(householdSchemas, body.action)) return reply({ error: 'Check the household details.' }, 400);
  const action = body.action as HouseholdAction;
  const parsed = householdSchemas[action].safeParse(body.data);
  if (!parsed.success) return reply({ error: 'Check the household details.' }, 400);
  const data = parsed.data as unknown as Record<string, string | null>;
  const jar = await cookies();
  const me = auth.user.id;
  if (action === 'invite') {
   const result = await rpc<{ id: string; token: string; role: string; expires_at: string }>('create_household_invite', { p_role: data.role }, auth.token);
   if (!result.ok) return failed(result);
   const { token, ...invite } = result.data;
   return reply({ invite, link: inviteLink(accountOrigin() ?? new URL(req.url).origin, token) });
  }
  if (action === 'preview' || action === 'accept') {
   const result = await rpc<{ owner_id: string }>(action === 'preview' ? 'preview_household_invite' : 'accept_household_invite', { p_token: data.token }, auth.token);
   if (!result.ok) return failed(result);
   // Joining opens the household straight away.
   if (action === 'accept') jar.set(workspaceCookie, result.data.owner_id, cookieOptions);
   return reply(result.data);
  }
  if (action === 'switch') {
   if (data.owner === null || data.owner === me) { jar.delete(workspaceCookie); return reply({ active: me }); }
   const result = await state(auth.token, data.owner!);
   if (!result) return unavailable();
   if (result.active !== data.owner) return reply({ error: 'You no longer have access to this shared workspace.' }, 403);
   jar.set(workspaceCookie, data.owner!, cookieOptions);
   return reply({ active: data.owner });
  }
  if (action === 'attribute' || action === 'account_owner') {
   // The open workspace is named explicitly, so the database checks the caller may change it.
   const workspace = auth.owner && auth.owner !== me ? auth.owner : '';
   const input = parsed.data as unknown as { ids: string[]; account: string; member: string | null };
   const result = action === 'attribute' ? await rpc<number>('set_record_owner', { p_ids: input.ids, p_member: input.member }, auth.token, workspace)
    : await rpc<number>('set_account_owner', { p_account: input.account, p_member: input.member }, auth.token, workspace);
   return result.ok ? reply({ changed: Number(result.data) || 0 }) : failed(result);
  }
  const call = action === 'revoke' ? rpc('revoke_household_invite', { p_id: data.id }, auth.token)
   : action === 'role' ? rpc('set_household_role', { p_member: data.member, p_role: data.role }, auth.token)
   : action === 'remove' ? rpc('remove_household_member', { p_owner: me, p_member: data.member }, auth.token)
   : rpc('remove_household_member', { p_owner: data.owner, p_member: me }, auth.token);
  const result = await call;
  if (!result.ok) return failed(result);
  if (action === 'leave' && jar.get(workspaceCookie)?.value === data.owner) jar.delete(workspaceCookie);
  return reply({ ok: true });
 } catch { return unavailable(); }
}
