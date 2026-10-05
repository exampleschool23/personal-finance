// Response shaping shared by the API routes. The helpers need no session, cookies or network, so routes keep
// calling session() and supa() themselves and tests can substitute those; a database failure that answers 5xx is
// also reported to lib/monitoring.ts, which alerts once the same failure keeps happening.
import type { z } from 'zod';
import { reportError } from '@/lib/monitoring';

const noStore = { 'Cache-Control': 'no-store' };
/** JSON that is never cached; `noReferrer` also withholds the referrer, for account and sign-in answers. */
export function reply(body: unknown, status = 200, { noReferrer = false } = {}) {
 return Response.json(body, { status, headers: noReferrer ? { ...noStore, 'Referrer-Policy': 'no-referrer' } : noStore });
}
export const signInAgain = () => Response.json({ error: 'Please sign in again.' }, { status: 401 });
/** A cross-site mutation, refused without a body. */
export const crossSite = () => new Response(null, { status: 403 });
export const requestRejected = () => Response.json({ error: 'Request rejected.' }, { status: 403 });
/** Over a rate limit (lib/rate-limit.ts). */
export const tooManyAttempts = (noReferrer = false) => reply({ error: 'Too many attempts. Please try again later.' }, 429, { noReferrer });

/** Browsers name the requesting site in Sec-Fetch-Site; servers, cron and webhooks send neither it nor Origin. */
export function sameOrigin(req: Request) {
 const origin = req.headers.get('origin');
 if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
 return !origin || origin === new URL(req.url).origin;
}

/** The request's JSON body, or null when it is missing or malformed, so validation answers 400 rather than 503. */
export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null);

type Schemas = Record<string, z.ZodTypeAny>;
export type ParsedAction<S extends Schemas> = { [K in keyof S & string]: { action: K; data: z.output<S[K]> } }[keyof S & string];
/** An `{action, data}` body checked against the schema named by its action; null when either is wrong. */
export function parseAction<S extends Schemas>(body: unknown, schemas: S): ParsedAction<S> | null {
 const { action, data } = (body && typeof body === 'object' ? body : {}) as { action?: unknown; data?: unknown };
 if (typeof action !== 'string' || !Object.hasOwn(schemas, action)) return null;
 const parsed = schemas[action].safeParse(data);
 return parsed.success ? { action, data: parsed.data } as ParsedAction<S> : null;
}

export type PostgrestError = { code?: string; message?: string; details?: string };
/** The error PostgREST sent, or an empty one when the body is not JSON. */
export const postgrestError = (response: Response): Promise<PostgrestError> => response.json().then(body => body && typeof body === 'object' ? body as PostgrestError : {}, () => ({}));
/** The database's own words for a P0001 refusal (raised for people to read), a known code's message, or the fallback.
 * `codes` maps an error code to a message, or to a message and status (such as PGRST202, a function this database lacks). */
export async function postgrestFailure(response: Response, fallback: string, { status = 409, fallbackStatus = status, codes = {} }: { status?: number; fallbackStatus?: number; codes?: Record<string, string | readonly [string, number]> } = {}) {
 const { code = '', message } = await postgrestError(response);
 if (code === 'P0001' && message) return Response.json({ error: message }, { status });
 const known = Object.hasOwn(codes, code) ? codes[code] : undefined;
 const [error, answer] = known === undefined ? [fallback, fallbackStatus] : typeof known === 'string' ? [known, status] : known;
 // Only the code travels: PostgREST's own message and details can quote the values of a row.
 if (answer >= 500) await reportError('database', Object.assign(new Error(`${fallback} (PostgREST ${code || 'no code'}, HTTP ${response.status})`), { name: 'DatabaseError', stack: '' }), { status: answer }, { alert: 'repeated' });
 return Response.json({ error }, { status: answer });
}
