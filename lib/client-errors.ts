// Browser errors reported to /api/client-errors: what failed and on which page, never what was on it.
// The browser sends the error's message and stack, the page path without its query, and Next's digest;
// the server scrubs them again (lib/monitoring.ts) before anything is logged.
import { z } from 'zod';

export const clientErrorEndpoint = '/api/client-errors';
/** Bytes a report may take; the route refuses anything larger before parsing it. */
export const clientErrorMaxBytes = 8192;
/** Reports one page load may send, so a render loop cannot flood the server. */
export const clientErrorsPerPage = 5;
export const clientErrorSchema = z.object({
 kind: z.enum(['error', 'unhandledrejection', 'boundary']),
 message: z.string().trim().min(1).max(1000),
 stack: z.string().max(4000).optional(),
 path: z.string().max(300).regex(/^\/[^?#\s]*$/).optional(),
 digest: z.string().regex(/^[\w-]{1,64}$/).optional(),
}).strict();
export type ClientError = z.infer<typeof clientErrorSchema>;

/** The report for a thrown value, trimmed to what the schema accepts. */
export function clientError(kind: ClientError['kind'], error: unknown, pathname: string, digest?: string): ClientError {
 const value = error instanceof Error ? error : null;
 const message = (value?.message || (typeof error === 'string' ? error : '') || 'Unknown error').slice(0, 1000);
 const path = pathname.split(/[?#]/)[0].replace(/\s/g, '').slice(0, 300);
 return {
  kind, message,
  ...(value?.stack ? { stack: value.stack.slice(0, 4000) } : {}),
  ...(path.startsWith('/') ? { path } : {}),
  ...(digest && /^[\w-]{1,64}$/.test(digest) ? { digest } : {}),
 };
}

/** A sender that stops after `clientErrorsPerPage` reports. Sending never throws. */
export function clientErrorSender(fetcher: typeof fetch = (...args) => fetch(...args)) {
 let sent = 0;
 return (report: ClientError) => {
  if (sent >= clientErrorsPerPage) return false;
  sent++;
  try {
   void fetcher(clientErrorEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report), keepalive: true }).catch(() => null);
  } catch { /* A report that cannot leave the browser is dropped. */ }
  return true;
 };
}

/** One sender for the page, shared by the listener and the error boundaries. */
let pageSender: ReturnType<typeof clientErrorSender> | null = null;
export const reportClientError = (report: ClientError) => (pageSender ??= clientErrorSender())(report);

type ErrorTarget = Pick<Window, 'addEventListener' | 'removeEventListener'> & { location: { pathname: string } };
/** Reports uncaught errors and unhandled rejections on a page; returns the function that stops listening. */
export function listenForClientErrors(target: ErrorTarget, send: (report: ClientError) => boolean = reportClientError) {
 // "Script error." is all a browser says about another origin's script: nothing to act on.
 const onError = (event: ErrorEvent) => { if (!event.error && /^Script error\.?$/.test(event.message ?? '')) return; send(clientError('error', event.error ?? event.message, target.location.pathname)); };
 const onRejection = (event: PromiseRejectionEvent) => { send(clientError('unhandledrejection', event.reason, target.location.pathname)); };
 target.addEventListener('error', onError);
 target.addEventListener('unhandledrejection', onRejection);
 return () => { target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); };
}
