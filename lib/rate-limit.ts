// Limits shared by every server instance, counted in Postgres (migration 106) with the server-only key.
// Keys are hashed before they leave the server, so the table never holds an address, email or phone number.
// Without the key, or when the database cannot count, requests are let through: a limiter must never lock
// everyone out, and local development needs no service key.
import { createHmac } from 'node:crypto';
import { serviceDatabase, type ServiceDatabase } from '@/lib/service-role';

export type Limit = { max: number; seconds: number };
/** The visitor's address as the host reports it. Vercel sets these headers itself and overwrites what a client sends;
 * behind another proxy they may be client-controlled, so keep the app on Vercel or set them at that proxy. */
export function clientIp(req: Request) {
 const first = (value: string | null) => value?.split(',')[0]?.trim() || null;
 return first(req.headers.get('x-real-ip')) ?? first(req.headers.get('x-vercel-forwarded-for')) ?? first(req.headers.get('x-forwarded-for')) ?? 'unknown';
}
const hashed = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32);

/** Counts one hit on a bucket the caller has already made free of personal data. True while within the limit, false
 * once over it, and null when nothing could count (no database, or the counter answered with an error); a request that
 * fails outright rejects. */
export async function hitLimit(bucket: string, limit: Limit, db: ServiceDatabase | null = serviceDatabase(), label = bucket.split(':')[0]): Promise<boolean | null> {
 if (!db) return null;
 const response = await db.write('/rest/v1/rpc/hit_rate_limit', { method: 'POST', body: JSON.stringify({ bucket, max_hits: limit.max, window_seconds: limit.seconds }) });
 if (!response.ok) { console.warn('Rate limit unavailable', label, response.status); return null; }
 return await response.json() === true;
}

/** True when this request is over any limit, counted per client address and, when given, per identifier (an email,
 * a phone number or a user id). `perIp: false` counts the identifier alone, for limits that follow a signed-in person. */
export async function rateLimited(req: Request, name: string, limits: readonly Limit[], key?: string | null, { perIp = true, db = serviceDatabase(), secret = process.env.SUPABASE_SERVICE_ROLE_KEY }: { perIp?: boolean; db?: ServiceDatabase | null; secret?: string } = {}) {
 if (!db || !secret) return false;
 const hit = (subject: string, limit: Limit) => hitLimit(`${name}:${hashed(secret, subject)}`, limit, db, name);
 const over = async (subject: string) => (await Promise.all(limits.map(limit => hit(subject, limit)))).includes(false);
 try {
  // The address is counted first, and the identifier only for requests the address limit let through,
  // so one visitor cannot use up someone else's email or number.
  if (perIp && await over('ip:' + clientIp(req))) return true;
  return !!key && await over('id:' + key.trim().toLowerCase());
 } catch {
  console.warn('Rate limit unavailable', name, 'request_failed');
  return false;
 }
}

const minute = 60, hour = 3600, day = 86400;
/** The limits each guarded route uses, in one place. */
export const limits = {
 signIn: [{ max: 5, seconds: minute }, { max: 20, seconds: hour }],
 phoneCode: [{ max: 3, seconds: 10 * minute }, { max: 10, seconds: hour }],
 phoneVerify: [{ max: 5, seconds: minute }, { max: 20, seconds: hour }],
 account: [{ max: 5, seconds: minute }, { max: 20, seconds: hour }],
 assistant: [{ max: 30, seconds: hour }, { max: 100, seconds: day }],
 publicMarket: [{ max: 60, seconds: minute }, { max: 600, seconds: hour }],
 benchmarks: [{ max: 30, seconds: minute }, { max: 300, seconds: day }],
 clientErrors: [{ max: 10, seconds: minute }, { max: 100, seconds: day }],
 health: [{ max: 30, seconds: minute }],
} satisfies Record<string, readonly Limit[]>;
