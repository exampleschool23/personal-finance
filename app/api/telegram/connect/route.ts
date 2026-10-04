import { cookies } from 'next/headers';
import { z } from 'zod';
import { serviceDatabase } from '@/lib/service-role';
import { sameOrigin, session } from '@/lib/supabase';
import { sendTelegramMessage, telegramConfig } from '@/lib/telegram';
import { connectedReply } from '@/lib/telegram-bot';
import { cancelConnectRequest, connectCookie, connectMinutes, connectPage, consumeConnectRequest, findConnectRequest, isConnectToken, linkChat, linkRefusal } from '@/lib/telegram-connect';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
const body = z.object({ action: z.enum(['preview', 'confirm', 'cancel']) });
/** The bot's Sign in button. The token waits in a cookie while the person signs in with any method, then the confirmation page reads it. */
export async function GET(req: Request) {
  const url = new URL(req.url), token = url.searchParams.get('c');
  const jar = await cookies();
  if (isConnectToken(token)) jar.set(connectCookie, token, { ...cookieOptions, maxAge: connectMinutes * 60 });
  return new Response(null, { status: 303, headers: { ...headers, Location: new URL(connectPage, url.origin).href } });
}
/** The confirmation page: what is being connected, the confirmation itself, and Cancel. Nothing is linked until a signed-in person confirms. */
export async function POST(req: Request) {
  if (!sameOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Request rejected.' }, 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Could not connect Telegram. Please try again.' }, 400);
  const db = serviceDatabase(), config = telegramConfig();
  if (!db || !config) return reply({ error: 'Telegram notifications are awaiting server setup.' }, 503);
  const jar = await cookies(), token = jar.get(connectCookie)?.value, now = new Date();
  const bot = config.botUsername;
  try {
    if (parsed.data.action === 'cancel') {
      await cancelConnectRequest(db, token);
      jar.delete(connectCookie);
      return reply({ state: 'cancelled', bot });
    }
    const request = await findConnectRequest(db, token, now);
    if (!request) { jar.delete(connectCookie); return reply({ state: 'expired', bot }); }
    const signedIn = await session();
    if (!signedIn) return reply({ state: 'sign_in', telegram: request.first_name, bot });
    const account = signedIn.user.email || signedIn.user.phone || '';
    // An account made in Telegram stays with the Telegram user who made it; the page says so before anything is spent.
    if (await linkRefusal(db, signedIn.user.id, { telegramUserId: request.telegram_user_id })) return reply({ state: 'other_telegram', bot });
    if (parsed.data.action === 'preview') return reply({ state: 'confirm', telegram: request.first_name, account, bot });
    const spent = await consumeConnectRequest(db, token, now);
    jar.delete(connectCookie);
    if (!spent) return reply({ state: 'expired', bot });
    if (await linkChat(db, signedIn.user.id, { chatId: spent.chat_id, telegramUserId: spent.telegram_user_id, firstName: spent.first_name ?? '' }, now) !== 'linked') return reply({ state: 'other_telegram', bot });
    // The chat hears about it straight away, so returning to Telegram shows the menu.
    await sendTelegramMessage(await connectedReply(db, signedIn.user.id, spent.chat_id), config);
    return reply({ state: 'connected', bot });
  } catch { return reply({ error: 'Could not connect Telegram. Please try again.' }, 503); }
}
