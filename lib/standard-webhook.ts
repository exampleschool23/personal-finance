import { createHmac, timingSafeEqual } from 'node:crypto';
type Check = { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number; toleranceSeconds?: number };
/** Verifies a Standard Webhooks signature, the scheme Supabase uses to sign its Auth hooks. The secret looks like `v1,whsec_<base64>`. */
export function verifyStandardWebhook({ secret, id, timestamp, signature, body, now = Date.now(), toleranceSeconds = 300 }: Check): boolean {
  if (!secret || !id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now / 1000 - sent) > toleranceSeconds) return false;
  const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  if (!key.length) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some(part => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
