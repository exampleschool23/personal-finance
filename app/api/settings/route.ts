import { z } from 'zod';
import { isCountry } from '@/lib/countries';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { defaultPreferences, isCurrency, maxPreferredCurrencies } from '@/lib/currencies';
const schema = z.object({ country: z.string().refine(value => value === '' || isCountry(value)).nullable().transform(value => value ?? '').optional(), display_name: z.string().trim().max(80).optional(), language: z.enum(['en','ru','uz']), currencies: z.array(z.string().refine(isCurrency)).min(1).max(maxPreferredCurrencies).refine(list => new Set(list).size === list.length) });
export async function GET() {
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const response = await supa('/rest/v1/user_preferences?select=language,currencies,display_name,country&user_id=eq.' + s.user.id, {}, s.token);
    if (!response.ok) return Response.json({ error: 'Settings are unavailable. Check the database setup.' }, { status: 503 });
    const rows = await response.json() as unknown[];
    // Lists saved before the two-currency limit keep their first two, primary first.
    const row = rows[0] as { currencies?: unknown } | undefined;
    const parsed = schema.safeParse(row && Array.isArray(row.currencies) ? { ...row, currencies: row.currencies.slice(0, maxPreferredCurrencies) } : row);
    return Response.json(parsed.success ? parsed.data : defaultPreferences, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Could not load settings.' }, { status: 503 }); }
}
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: 'Choose a language, one or two currencies, a valid country, and a name of up to 80 characters.' }, { status: 400 });
    const response = await supa('/rest/v1/user_preferences?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: s.user.id, ...parsed.data }) }, s.token);
    if (!response.ok) throw Error();
    return Response.json(parsed.data);
  } catch { return Response.json({ error: 'Could not save settings. Try again.' }, { status: 503 }); }
}
