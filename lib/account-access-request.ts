export type AccountAccessResult = { error?: string; message?: string; next?: string };

/** Posts one account action (sign-up, recovery, password change, deletion) and throws the server's message on failure. */
export async function requestAccountAccess(body: Record<string, string>): Promise<AccountAccessResult> {
  const response = await fetch('/api/account-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as AccountAccessResult;
  if (!response.ok) throw Error(result.error);
  return result;
}
