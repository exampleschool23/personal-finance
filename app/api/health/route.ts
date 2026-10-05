import { reply, tooManyAttempts } from '@/lib/api-route';
import { rateLimited, limits } from '@/lib/rate-limit';
import { serviceDatabase, type ServiceDatabase } from '@/lib/service-role';
export const dynamic = 'force-dynamic';
/** For an uptime monitor: 200 with {ok:true, db:true} while the app answers and its database counts requests, 503
 * otherwise. No sign-in and no data: the probe is the health check's own rate-limit hit, so it costs one call. */
export async function GET(req: Request) {
 const db = serviceDatabase();
 let reached = false;
 // Any answer below 500 means the database answered, even one saying a migration is missing.
 const probe: ServiceDatabase | null = db && { ...db, write: async (path, init) => { const response = await db.write(path, init); reached = response.status < 500; return response; } };
 if (await rateLimited(req, 'health', limits.health, null, { db: probe })) return tooManyAttempts();
 return reply({ ok: reached, db: reached }, reached ? 200 : 503);
}
