import { z } from 'zod';
import { isCountry } from '@/lib/countries';
import { fontIds, resolveFont } from '@/lib/fonts';
import { isLanguage, languageCodes } from '@/lib/i18n';
import { queueLanguageMenu } from '@/lib/notify-action';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { defaultPreferences, isCurrency, maxPreferredCurrencies } from '@/lib/currencies';
const schema = z.object({ country: z.string().refine(value => value === '' || isCountry(value)).nullable().transform(value => value ?? '').optional(), display_name: z.string().trim().max(80).optional(), language: z.enum(languageCodes), currencies: z.array(z.string().refine(isCurrency)).min(1).max(maxPreferredCurrencies).refine(list => new Set(list).size === list.length), font: z.enum(fontIds).nullish().transform(resolveFont), onboarded: z.boolean().optional() });
export async function GET() {
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const response = await supa('/rest/v1/user_preferences?select=*&user_id=eq.' + s.user.id, {}, s.token);
    if (!response.ok) return Response.json({ error: 'Settings are unavailable. Check the database setup.' }, { status: 503 });
    const rows = await response.json() as unknown[];
    // Lists saved before the two-currency limit keep their first two, primary first.
    const row = rows[0] as { currencies?: unknown; language?: unknown; onboarded_at?: unknown } | undefined;
    // Every column is read so settings still load before migration 078 adds onboarded_at; without that column
    // nobody is asked again. An account without preferences has not been through the welcome setup yet.
    // A saved language this version does not offer shows as English; the stored value is left alone.
    const parsed = schema.safeParse(row && Array.isArray(row.currencies) ? { ...row, language: isLanguage(row.language) ? row.language : 'en', currencies: row.currencies.slice(0, maxPreferredCurrencies), onboarded: row.onboarded_at === undefined || !!row.onboarded_at } : row);
    return Response.json(parsed.success ? parsed.data : { ...defaultPreferences, onboarded: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Could not load settings.' }, { status: 503 }); }
}
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 403 });
  try {
    const s = await session();
    if (!s) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: 'Choose a language, one or two currencies, a font, a valid country, and a name of up to 80 characters.' }, { status: 400 });
    const { onboarded, ...preferences } = parsed.data;
    // The saved language before this save, so a change can refresh the Telegram menu afterwards.
    const earlier = await supa('/rest/v1/user_preferences?select=language&user_id=eq.' + s.user.id, {}, s.token);
    const earlierRows = earlier.ok ? await earlier.json() as Array<{ language?: unknown }> : [];
    const previousLanguage = isLanguage(earlierRows[0]?.language) ? earlierRows[0].language : 'en';
    // The setup timestamp changes only when the request says so; the Settings form leaves it alone.
    const response = await supa('/rest/v1/user_preferences?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: s.user.id, ...preferences, ...(onboarded === undefined ? {} : { onboarded_at: onboarded ? new Date().toISOString() : null }) }) }, s.token);
    if (!response.ok) throw Error();
    // A linked Telegram chat gets a new keyboard in the new language, so nobody has to press Start again.
    if (parsed.data.language !== previousLanguage) queueLanguageMenu(s, parsed.data.language);
    return Response.json(parsed.data);
  } catch { return Response.json({ error: 'Could not save settings. Try again.' }, { status: 503 }); }
}
