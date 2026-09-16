import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { defaultPreferences, isCurrency, fiatCurrencies } from '@/lib/currencies';
const schema = z.object({ language: z.enum(['en','ru','uz']), currencies: z.array(z.string().refine(isCurrency)).min(1).max(fiatCurrencies.length).refine(list => new Set(list).size === list.length) });
export async function GET() {
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const response = await supa('/rest/v1/user_preferences?select=language,currencies&user_id=eq.' + s.user.id, {}, s.token);
    if (!response.ok) return Response.json({ error: 'Settings are unavailable. Check the database setup.' }, { status: 503 });
    const rows = await response.json() as unknown[];
    const parsed = schema.safeParse(rows[0]);
    return Response.json(parsed.success ? parsed.data : defaultPreferences, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Could not load settings.' }, { status: 503 }); }
}
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: 'Choose a language and at least one currency.' }, { status: 400 });
    const response = await supa('/rest/v1/user_preferences?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: s.user.id, ...parsed.data }) }, s.token);
    if (!response.ok) throw Error();
    return Response.json(parsed.data);
  } catch { return Response.json({ error: 'Could not save settings. Try again.' }, { status: 503 }); }
}
