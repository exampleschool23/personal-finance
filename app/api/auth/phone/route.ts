import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { saveSession, sameOrigin, supa } from '@/lib/supabase';
import { telegramConfig } from '@/lib/telegram';
const authSession = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive(), user: z.object({ id: z.string().uuid() }) });
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), phone: z.string().max(40) }),
  z.object({ action: z.literal('verify'), phone: z.string().max(40), code: z.string().regex(/^\d{4,10}$/) }),
]);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
/** Tells the sign-in page whether phone sign-in is set up, and which bot to open for people without an account. */
export async function GET() {
  const config = telegramConfig();
  return reply({ enabled: !!process.env.SEND_SMS_HOOK_SECRET && !!config, botUsername: config?.botUsername ?? null });
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Request rejected.' }, 403);
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
    if (!parsed.success || !phone) return reply({ error: 'Enter your phone number with the country code.' }, 400);
    if (parsed.data.action === 'send') {
      // create_user is off, so a number nobody registered never becomes an account here.
      const response = await supa('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ phone, create_user: false }) });
      if (response.status === 429) return reply({ error: 'Too many attempts. Please try again later.' }, 429);
      if (response.status >= 500) return reply({ error: 'Could not send the code. Please try again.' }, 503);
      // Known and unknown numbers get the same answer, so this cannot be used to find who has an account.
      return reply({ message: 'If this number has an account, a code is on its way to its Telegram chat.' });
    }
    const response = await supa('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'sms', phone, token: parsed.data.code }) });
    if (!response.ok) return reply({ error: 'The code is wrong or has expired.' }, response.status === 429 ? 429 : 400);
    const verified = authSession.safeParse(await response.json());
    if (!verified.success) return reply({ error: 'Could not sign you in. Please try again.' }, 503);
    await saveSession(verified.data);
    return reply({ next: 'signed_in' });
  } catch { return reply({ error: 'Account service is unavailable. Please try again.' }, 503); }
}
