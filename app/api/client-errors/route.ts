import { crossSite, requestRejected, sameOrigin, tooManyAttempts } from '@/lib/api-route';
import { clientErrorMaxBytes, clientErrorSchema } from '@/lib/client-errors';
import { reportError } from '@/lib/monitoring';
import { limits, rateLimited } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';
const tooLarge = () => new Response(null, { status: 413 });
/** Errors a browser hit on this site (lib/client-errors.ts). No sign-in needed, because pages fail signed out too:
 * same-origin only, limited per address, at most 8 KB, and only the message, stack, page path and digest are kept. */
export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 if (Number(req.headers.get('content-length') ?? 0) > clientErrorMaxBytes) return tooLarge();
 if (await rateLimited(req, 'client-errors', limits.clientErrors)) return tooManyAttempts();
 const body = await req.text().catch(() => '');
 if (new TextEncoder().encode(body).length > clientErrorMaxBytes) return tooLarge();
 let json: unknown = null;
 try { json = JSON.parse(body); } catch { /* answered below */ }
 const parsed = clientErrorSchema.safeParse(json);
 if (!parsed.success) return requestRejected();
 const { kind, message, stack, path, digest } = parsed.data;
 await reportError('client:' + kind, Object.assign(new Error(message), { name: 'ClientError', stack: stack ?? '' }), { route: path, digest });
 return new Response(null, { status: 204 });
}
