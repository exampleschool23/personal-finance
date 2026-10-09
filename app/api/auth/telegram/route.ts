import { z } from 'zod';
import { readJson, reply as answer, tooManyAttempts } from '@/lib/api-route';
import { authSession } from '@/lib/api-validation';
import { limits, rateLimited } from '@/lib/rate-limit';
import { serviceDatabase } from '@/lib/service-role';
import { saveSession, sameOrigin, supa } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
import { adminAccounts, consumeLoginToken, loginSecrets, signInTelegramAccount } from '@/lib/telegram-account';
import { createdInTelegram } from '@/lib/telegram-link';
import { verifyInitData } from '@/lib/telegram-webapp';
const body = z.object({ token: z.string().max(200).optional(), initData: z.string().max(4096).optional() }).refine(value => !!value.token !== !!value.initData);
type Subscription = { user_id: string; telegram_user_id: number | null; phone: string | null; consented_at: string | null };
const reply = (data: unknown, status = 200) => answer(data, status, { noReferrer: true });
/** Signs in an account created in Telegram from a single-use link or from the signed data of the Telegram Mini App. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: 'Request rejected.' }, 403);
  const db = serviceDatabase(), config = telegramConfig(), secrets = loginSecrets();
  if (!db || !config || !secrets) return reply({ error: 'Telegram sign-in is not available yet.' }, 503);
  try {
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) return reply({ error: 'This sign-in link is not valid. Open the bot and press Open app again.' }, 400);
    let filter: string;
    if (parsed.data.initData) {
      const user = verifyInitData(parsed.data.initData, config.token);
      if (!user) return reply({ error: 'This sign-in link is not valid. Open the bot and press Open app again.' }, 401);
      // Signed Mini App data stays valid for an hour, so sign-ins are counted per address and per Telegram user.
      if (await rateLimited(req, 'telegram-signin', limits.signIn, 'telegram:' + user.id)) return tooManyAttempts(true);
      filter = 'telegram_user_id=eq.' + user.id;
    } else {
      if (await rateLimited(req, 'telegram-signin', limits.signIn)) return tooManyAttempts(true);
      const owner = await consumeLoginToken(db, parsed.data.token, new Date());
      if (!owner) return reply({ error: 'This sign-in link has expired. Open the bot and press Open app again.' }, 401);
      filter = 'user_id=eq.' + owner;
    }
    const [subscription] = await db.read<Subscription[]>(`/rest/v1/telegram_subscriptions?select=user_id,telegram_user_id,phone,consented_at&${filter}`);
    // Only accounts the bot created have the derived password; others sign in with their own email or code.
    if (!createdInTelegram(subscription)) return reply({ error: 'Sign in with your email or your phone number.' }, 403);
    const signIn = (phone: string, password: string) => supa('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ phone, password }) });
    const result = await signInTelegramAccount({ secrets, signIn, admin: adminAccounts() }, subscription);
    if (!result.ok) {
      // Phone sign-in must be switched on in Supabase (Authentication, Providers, Phone); until then no account made in Telegram can sign in on the web.
      if (result.code === 'phone_provider_disabled') return reply({ error: 'Telegram sign-in is not available yet.' }, 503);
      return reply({ error: 'Sign in with your phone number and the code from the bot.' }, 401);
    }
    const session = authSession.safeParse(result.session);
    if (!session.success) return reply({ error: 'Could not sign you in. Please try again.' }, 503);
    await saveSession(session.data);
    return reply({ next: 'signed_in' });
  } catch { return reply({ error: 'Account service is unavailable. Please try again.' }, 503); }
}
