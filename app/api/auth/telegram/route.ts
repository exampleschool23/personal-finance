import { z } from 'zod';
import { serviceDatabase } from '@/lib/service-role';
import { saveSession, sameOrigin, supa } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
import { consumeLoginToken, derivedPassword } from '@/lib/telegram-account';
import { verifyInitData } from '@/lib/telegram-webapp';
const authSession = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive(), user: z.object({ id: z.string().uuid() }) });
const body = z.object({ token: z.string().max(200).optional(), initData: z.string().max(4096).optional() }).refine(value => !!value.token !== !!value.initData);
type Subscription = { user_id: string; telegram_user_id: number | null; phone: string | null; consented_at: string | null };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
/** Signs in an account created in Telegram from a single-use link or from the signed data of the Telegram Mini App. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Request rejected.' }, 403);
  const db = serviceDatabase(), config = telegramConfig(), secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!db || !config || !secret) return reply({ error: 'Telegram sign-in is not available yet.' }, 503);
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: 'This sign-in link is not valid. Open the bot and press Open app again.' }, 400);
    let filter: string;
    if (parsed.data.initData) {
      const user = verifyInitData(parsed.data.initData, config.token);
      if (!user) return reply({ error: 'This sign-in link is not valid. Open the bot and press Open app again.' }, 401);
      filter = 'telegram_user_id=eq.' + user.id;
    } else {
      const owner = await consumeLoginToken(db, parsed.data.token, new Date());
      if (!owner) return reply({ error: 'This sign-in link has expired. Open the bot and press Open app again.' }, 401);
      filter = 'user_id=eq.' + owner;
    }
    const [subscription] = await db.read<Subscription[]>(`/rest/v1/telegram_subscriptions?select=user_id,telegram_user_id,phone,consented_at&${filter}`);
    // Only accounts the bot created have the derived password; others sign in with their own email or code.
    if (!subscription?.telegram_user_id || !subscription.phone || !subscription.consented_at) return reply({ error: 'Sign in with your email or your phone number.' }, 403);
    const response = await supa('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ phone: subscription.phone, password: derivedPassword(secret, subscription.telegram_user_id) }) });
    if (!response.ok) return reply({ error: 'Sign in with your phone number and the code from the bot.' }, 401);
    const session = authSession.safeParse(await response.json());
    if (!session.success) return reply({ error: 'Could not sign you in. Please try again.' }, 503);
    await saveSession(session.data);
    return reply({ next: 'signed_in' });
  } catch { return reply({ error: 'Account service is unavailable. Please try again.' }, 503); }
}
