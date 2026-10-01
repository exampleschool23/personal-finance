/** A phone number in international form with a leading plus, or null when it cannot be one. Telegram sends numbers without the plus. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/[\s().-]/g, '').replace(/^00/, '+');
  const candidate = compact.startsWith('+') ? compact : '+' + compact;
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}
