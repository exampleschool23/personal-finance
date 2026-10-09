/** An error from a JSON request. `confirmedFailure` is true when the server answered below 500,
 * so the change certainly did not happen and the same details can be sent again. */
export type RequestError = Error & { confirmedFailure: boolean; status: number };

/**
 * Sends `body` as JSON and returns the parsed reply. A reply that is not OK throws
 * `Error(result.error || fallback)`; the message is a translation key, so pass the exact text.
 * A reply without a JSON body reads as `{}`.
 */
export async function requestJson<T = Record<string, never>>(url: string, { method = 'POST', body, fallback, signal }: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; fallback?: string; signal?: AbortSignal } = {}): Promise<T> {
 const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal });
 const result = await response.json().catch(() => ({})) as T & { error?: string };
 if (!response.ok) throw Object.assign(Error(result.error || fallback), { confirmedFailure: response.status < 500, status: response.status }) as RequestError;
 return result;
}
