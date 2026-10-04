import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { authSession } from '@/lib/api-validation';
import { readJson, reply, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { saveSession, sameOrigin, supa } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), phone: z.string().max(40) }),
  z.object({ action: z.literal('verify'), phone: z.string().max(40), code: z.string().regex(/^\d{4,10}$/) }),
]);
const answer = (body: unknown, status = 200) => reply(body, status, { noReferrer: true });
/** Tells the sign-in page whether phone sign-in is set up, and which bot to open for people without an account. */
export async function GET() {
  const config = telegramConfig();
  return answer({ enabled: !!process.env.SEND_SMS_HOOK_SECRET && !!config, botUsername: config?.botUsername ?? null });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return answer({ error: 'Request rejected.' }, 403);
  try {
    const parsed = body.safeParse(await readJson(req));
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
    if (!parsed.success || !phone) return answer({ error: 'Enter your phone number with the country code.' }, 400);
    // Sending and checking codes are counted apart, per address and per number: nobody can flood a chat with codes or guess one.
    if (await rateLimited(req, parsed.data.action === 'send' ? 'phone-code' : 'phone-verify', parsed.data.action === 'send' ? limits.phoneCode : limits.phoneVerify, phone)) return tooManyAttempts(true);
    if (parsed.data.action === 'send') {
      // create_user is off, so a number nobody registered never becomes an account here.
      const response = await supa('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ phone, create_user: false }) });
      if (response.status === 429) return tooManyAttempts(true);
      if (response.status >= 500) return answer({ error: 'Could not send the code. Please try again.' }, 503);
      // Known and unknown numbers get the same answer, so this cannot be used to find who has an account.
      return answer({ message: 'If this number has an account, a code is on its way to its Telegram chat.' });
    }
    const response = await supa('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'sms', phone, token: parsed.data.code }) });
    if (!response.ok) return answer({ error: 'The code is wrong or has expired.' }, response.status === 429 ? 429 : 400);
    const verified = authSession.safeParse(await response.json());
    if (!verified.success) return answer({ error: 'Could not sign you in. Please try again.' }, 503);
    await saveSession(verified.data);
    return answer({ next: 'signed_in' });
  } catch { return answer({ error: 'Account service is unavailable. Please try again.' }, 503); }
}
