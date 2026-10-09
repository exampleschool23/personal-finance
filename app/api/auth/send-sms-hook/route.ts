import { readCapped } from '@/lib/api-route';
import { translate } from '@/lib/i18n';
import { reportError } from '@/lib/monitoring';
import { serviceDatabase } from '@/lib/service-role';
import { verifyStandardWebhook } from '@/lib/standard-webhook';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
import { ownerLanguage } from '@/lib/telegram-bot';
export const maxDuration = 30;
const route = '/api/auth/send-sms-hook';
/** A hook call carries a user and a code; anything larger is refused before the signature is checked. */
const maxHookBytes = 64_000;
const fail = (status: number, message: string) => Response.json({ error: { http_code: status, message } }, { status });
/** Supabase calls this instead of sending an SMS. The sign-in code goes to the Telegram chat linked to the account, so it costs nothing and reaches only the Telegram user who owns that account. */
export async function POST(req: Request) {
  const secret = process.env.SEND_SMS_HOOK_SECRET, config = telegramConfig(), db = serviceDatabase();
  if (!secret || !config || !db) return fail(503, 'Sign-in codes are not available yet.');
  const body = await readCapped(req, maxHookBytes).catch(() => '');
  if (body === null) return fail(413, 'Request too large.');
  if (!verifyStandardWebhook({ secret, id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature'), body })) return new Response(null, { status: 401 });
  let payload: { user?: { id?: unknown }; sms?: { otp?: unknown } };
  try { payload = JSON.parse(body); } catch { return fail(400, 'Bad request.'); }
  const userId = payload.user?.id, otp = payload.sms?.otp;
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId) || typeof otp !== 'string' || !/^\d{4,10}$/.test(otp)) return fail(400, 'Bad request.');
  try {
    const [subscription] = await db.read<Array<{ chat_id: number | null }>>(`/rest/v1/telegram_subscriptions?select=chat_id&user_id=eq.${userId}`);
    if (!subscription?.chat_id) return fail(400, 'This account has no Telegram chat to receive the code.');
    const language = await ownerLanguage(db, userId);
    const sent = await sendTelegramMessage({ chat_id: subscription.chat_id, text: translate(language, 'Your Hoggish sign-in code is {code}. If you did not ask for it, ignore this message.', { code: `<code>${otp}</code>` }) }, config);
    if (sent) return Response.json({});
    // Without the code nobody can sign in by phone: tell the operator.
    await reportError('send-sms-hook', 'Telegram did not accept a sign-in code.', { route, status: 502, userId }, { alert: 'repeated' });
    return fail(502, 'The code could not be delivered.');
  } catch (error) {
    await reportError('send-sms-hook', error, { route, status: 503, userId }, { alert: true });
    return fail(503, 'Sign-in codes are not available right now.');
  }
}
