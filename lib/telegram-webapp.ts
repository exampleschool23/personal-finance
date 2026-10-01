import { createHmac, timingSafeEqual } from 'node:crypto';
export type WebAppUser = { id: number; firstName: string; languageCode: string };
/** Checks the signed data a Telegram Mini App receives and returns the Telegram user it belongs to, or null when it was forged or is too old. */
export function verifyInitData(initData: unknown, botToken: string, now = Date.now(), maxAgeSeconds = 3600): WebAppUser | null {
  if (typeof initData !== 'string' || !initData || initData.length > 4096 || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const issued = Number(params.get('auth_date'));
  if (!Number.isFinite(issued) || now / 1000 - issued > maxAgeSeconds || issued - now / 1000 > 300) return null;
  try {
    const user = JSON.parse(params.get('user') ?? '') as { id?: unknown; first_name?: unknown; language_code?: unknown };
    if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    return { id: user.id, firstName: typeof user.first_name === 'string' ? user.first_name : '', languageCode: typeof user.language_code === 'string' ? user.language_code : '' };
  } catch { return null; }
}
