// Production error reporting with no third-party SDK. Every report is one JSON line on stderr, which Vercel keeps
// in its logs; with SENTRY_DSN set it is also sent to Sentry's envelope endpoint, and severe events reach the
// operator's Telegram chat (TELEGRAM_ALERT_CHAT_ID). Reporting never throws and never carries user data: messages
// and stacks are scrubbed, context is an allowlist, and a user id travels only as a keyed hash.
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { formatDateTime, formatNumber } from '@/lib/format';
import { hitLimit, type Limit } from '@/lib/rate-limit';
import { serviceDatabase, type ServiceDatabase } from '@/lib/service-role';
import { escapeHtml, sendTelegramMessage, telegramConfig } from '@/lib/telegram';

type Env = Record<string, string | undefined>;
/** What a caller may attach. Anything else is dropped; counts are small tallies such as sent and failed. */
export type MonitorContext = { route?: string; status?: number; userId?: string | null; digest?: string; counts?: Record<string, number> };
export type ErrorReport = {
 level: 'error'; source: string; message: string; name: string; stack?: string; route?: string; status?: number;
 userIdHash?: string; digest?: string; counts?: Record<string, number>; release?: string; at: string;
};
/** `true` alerts on every occurrence (deduplicated), `'repeated'` only once the same failure keeps happening. */
export type ReportOptions = { alert?: boolean | 'repeated'; env?: Env; fetcher?: typeof fetch; db?: ServiceDatabase | null; now?: Date; log?: (line: string) => void };

const redactions: Array<[RegExp, string]> = [
 [/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]'],
 [/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, '[jwt]'],
 [/\bbot\d+:[\w-]+/gi, 'bot[token]'],
 [/\b\d{6,}:[\w-]{20,}/g, '[token]'],
 [/\b(?:sb_secret_|sb_publishable_|sk-ant-|sk_live_|sk_test_)[\w-]+/g, '[key]'],
 // A query string can carry a token, an email or a filter on someone's records: keep the path, drop the rest.
 [/((?:https?:\/\/|\/)[^\s?#"'<>()]*)\?[^\s#"'<>()]*/g, '$1?[query]'],
 [/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi, '[email]'],
 [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
 [/\+?\d[\d\s().-]{6,}\d/g, '[number]'],
 // Amounts with separators and long digit runs; line and column numbers after a colon stay for the stack.
 [/(?<![:\w])\d+(?:[.,]\d+)+(?!\w)/g, '[number]'],
 [/(?<![:\w])\d{4,}(?!\w)/g, '[number]'],
 [/\b[A-Za-z0-9_-]{32,}\b/g, '[secret]'],
];
/** Removes anything that could identify a person or unlock an account from free text. */
export function scrub(text: string, max = 500) {
 const clean = redactions.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
 return clean.length > max ? clean.slice(0, max) + '…' : clean;
}
/** A route as a bare path: no origin, query or fragment, ids redacted. */
const routePath = (route: string) => scrub((route.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0] || '/'), 200);
const hashUser = (userId: string, secret: string) => createHmac('sha256', 'monitoring:' + secret).update(userId).digest('base64url').slice(0, 16);

function describe(error: unknown) {
 if (error instanceof Error) return { name: error.name || 'Error', message: error.message, stack: error.stack };
 if (typeof error === 'string') return { name: 'Error', message: error, stack: undefined };
 return { name: 'NonError', message: 'A value that is not an Error was thrown.', stack: undefined };
}
/** The report as it is logged and forwarded, already scrubbed. */
export function errorReport(source: string, error: unknown, context: MonitorContext = {}, env: Env = process.env, now = new Date()): ErrorReport {
 const { name, message, stack } = describe(error), secret = env.SUPABASE_SERVICE_ROLE_KEY;
 const counts = context.counts && Object.fromEntries(Object.entries(context.counts).filter(([key, value]) => /^[a-z]{1,20}$/i.test(key) && Number.isSafeInteger(value)).slice(0, 8));
 return {
  level: 'error', source: scrub(source, 60), message: scrub(message) || name, name: scrub(name, 60),
  ...(stack ? { stack: scrub(stack, 2000) } : {}),
  ...(context.route ? { route: routePath(context.route) } : {}),
  ...(Number.isInteger(context.status) ? { status: context.status } : {}),
  ...(context.userId && secret ? { userIdHash: hashUser(context.userId, secret) } : {}),
  ...(context.digest && /^[\w-]{1,64}$/.test(context.digest) ? { digest: context.digest } : {}),
  ...(counts && Object.keys(counts).length ? { counts } : {}),
  ...(env.VERCEL_GIT_COMMIT_SHA ? { release: env.VERCEL_GIT_COMMIT_SHA } : {}),
  at: now.toISOString(),
 };
}
/** Same failure, same fingerprint: the source, the kind of error, its scrubbed message and the route. */
export const fingerprint = (report: ErrorReport) => createHash('sha256').update([report.source, report.name, report.message, report.route ?? ''].join('|')).digest('hex').slice(0, 16);

/** Sentry's plain HTTP envelope for one event, or null when the DSN is not usable. */
export function sentryEnvelope(report: ErrorReport, dsn: string, env: Env = process.env) {
 let url: URL;
 try { url = new URL(dsn); } catch { return null; }
 const project = url.pathname.split('/').filter(Boolean).pop(), prefix = url.pathname.replace(/\/[^/]*\/?$/, '');
 if (!url.username || !project || !/^https?:$/.test(url.protocol)) return null;
 const eventId = randomUUID().replace(/-/g, '');
 const event = {
  event_id: eventId, timestamp: Date.parse(report.at) / 1000, platform: 'node', level: 'error', logger: report.source,
  environment: env.VERCEL_ENV ?? 'production', ...(report.release ? { release: report.release } : {}),
  exception: { values: [{ type: report.name, value: report.message }] },
  tags: { source: report.source, ...(report.route ? { route: report.route } : {}), ...(report.status ? { status: String(report.status) } : {}) },
  ...(report.userIdHash ? { user: { id: report.userIdHash } } : {}),
  extra: { ...(report.stack ? { stack: report.stack } : {}), ...(report.digest ? { digest: report.digest } : {}), ...(report.counts ? { counts: report.counts } : {}) },
  fingerprint: [fingerprint(report)],
 };
 const header = { event_id: eventId, sent_at: report.at, dsn: `${url.protocol}//${url.username}@${url.host}${url.pathname}` };
 return {
  url: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
  headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=hoggish-monitoring/1.0` },
  body: [JSON.stringify(header), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n'),
 };
}

/** The operator's alert: what failed, where and when. Text comes from the scrubbed report only. */
export function alertText(report: ErrorReport) {
 const counts = report.counts && Object.entries(report.counts).map(([key, value]) => `${key} ${formatNumber(value, 'en')}`).join(' · ');
 return [
  `🚨 <b>Hoggish alert</b> · ${escapeHtml(report.source)}`,
  escapeHtml(`${report.name}: ${report.message}`),
  ...(report.route || report.status ? [escapeHtml([report.route, report.status && `status ${report.status}`].filter(Boolean).join(' · '))] : []),
  ...(counts ? [escapeHtml(counts)] : []),
  escapeHtml([report.release?.slice(0, 7), formatDateTime(report.at, 'en')].filter(Boolean).join(' · ')),
 ].join('\n');
}

// Per-instance counts, used only when the shared counter in Postgres cannot answer.
const local = new Map<string, { hits: number; until: number }>();
function countLocally(bucket: string, limit: Limit, now: number) {
 if (local.size > 500) local.clear();
 const entry = local.get(bucket);
 const next = entry && entry.until > now ? { hits: entry.hits + 1, until: entry.until } : { hits: 1, until: now + limit.seconds * 1000 };
 local.set(bucket, next);
 return next.hits <= limit.max;
}
/** Within the limit? The shared counter decides when it can, the instance's own memory otherwise. */
async function within(bucket: string, limit: Limit, db: ServiceDatabase | null, now: number) {
 const shared = await hitLimit(bucket, limit, db, 'monitoring').catch(() => null);
 return shared ?? countLocally(bucket, limit, now);
}
/** Forgets the per-instance counts; for tests. */
export const resetMonitoring = () => local.clear();
export const alertLimits = { repeated: { max: 5, seconds: 600 }, perFailure: { max: 1, seconds: 3600 }, all: { max: 20, seconds: 3600 } } satisfies Record<string, Limit>;

async function alert(report: ErrorReport, mode: true | 'repeated', env: Env, fetcher: typeof fetch, db: ServiceDatabase | null, now: number) {
 const chat = env.TELEGRAM_ALERT_CHAT_ID?.trim(), config = telegramConfig(env);
 if (!chat || !/^-?\d{1,20}$/.test(chat) || !config) return false;
 const key = fingerprint(report);
 // Repeated: the sixth occurrence within ten minutes is the first that alerts.
 if (mode === 'repeated' && await within('monitor-seen:' + key, alertLimits.repeated, db, now)) return false;
 if (!await within('monitor-alert:' + key, alertLimits.perFailure, db, now)) return false;
 if (!await within('monitor-alert:all', alertLimits.all, db, now)) return false;
 return sendTelegramMessage({ chat_id: Number(chat), text: alertText(report) }, config, fetcher);
}

/** Records a server-side failure. Resolves once forwarding is done or has given up; never rejects. */
export async function reportError(source: string, error: unknown, context: MonitorContext = {}, { alert: mode = false, env = process.env, fetcher = fetch, db, now = new Date(), log = line => console.error(line) }: ReportOptions = {}) {
 try {
  const report = errorReport(source, error, context, env, now);
  log(JSON.stringify(report));
  const envelope = env.SENTRY_DSN ? sentryEnvelope(report, env.SENTRY_DSN, env) : null;
  await Promise.all([
   envelope && fetcher(envelope.url, { method: 'POST', headers: envelope.headers, body: envelope.body, cache: 'no-store', signal: AbortSignal.timeout(2000) }).catch(() => null),
   mode && alert(report, mode, env, fetcher, db === undefined ? serviceDatabase(env, fetcher) : db, now.getTime()).catch(() => false),
  ]);
 } catch { /* Reporting must never become the failure. */ }
}
