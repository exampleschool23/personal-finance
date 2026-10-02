// Each owner's time zone, kept in `user_preferences.timezone` as an IANA name, so
// the Telegram digest and the weekly recap arrive in the owner's own morning and
// Sunday evening. Without a saved zone one is derived from the country chosen in
// Settings, then from a language spoken mainly in one country, and finally UTC.
import type { Language } from './languages';
/** The local hour from which the morning digest may be sent, and the hour after which a missed digest is no longer worth sending. */
export const digestHours = { from: 8, until: 12 } as const;
/** The Sunday evening window for the weekly recap. */
export const recapHours = { from: 18, until: 22 } as const;
/** True for a time zone this runtime knows by its IANA name, such as Asia/Tashkent or America/New_York. */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+){0,2}$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}
// Countries spanning several zones, set to the zone most of their people live in.
const countryZones: Record<string, string> = {
  US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', EC: 'America/Guayaquil',
  RU: 'Europe/Moscow', UA: 'Europe/Kyiv', KZ: 'Asia/Almaty', UZ: 'Asia/Tashkent', MN: 'Asia/Ulaanbaatar', CN: 'Asia/Shanghai', ID: 'Asia/Jakarta', MY: 'Asia/Kuala_Lumpur', AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
  ES: 'Europe/Madrid', PT: 'Europe/Lisbon', DE: 'Europe/Berlin', FR: 'Europe/Paris', GB: 'Europe/London', NL: 'Europe/Amsterdam', CD: 'Africa/Kinshasa', CY: 'Asia/Nicosia', PS: 'Asia/Gaza', PF: 'Pacific/Tahiti', KI: 'Pacific/Tarawa', FM: 'Pacific/Pohnpei', MH: 'Pacific/Majuro', PG: 'Pacific/Port_Moresby', GL: 'America/Nuuk', AQ: 'UTC', UM: 'Pacific/Honolulu',
};
/** The zone of a country: its only zone, or the zone most of its people use. Null when unknown. */
export function countryTimezone(country: string | null | undefined): string | null {
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  if (countryZones[country]) return countryZones[country];
  try {
    const locale = new Intl.Locale('und-' + country) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
    const zones = locale.getTimeZones?.() ?? locale.timeZones ?? [];
    return zones.length === 1 && isTimezone(zones[0]) ? zones[0] : null;
  } catch { return null; }
}
// Only languages spoken mainly in one country suggest a zone; English, Spanish, Portuguese, French and Arabic do not.
const languageCountries: Partial<Record<Language, string>> = {
  'es-MX': 'MX', ru: 'RU', ur: 'PK', hi: 'IN', bn: 'BD', zh: 'CN', ja: 'JP', ko: 'KR', th: 'TH', vi: 'VN', uz: 'UZ', de: 'DE', it: 'IT', tr: 'TR', id: 'ID', ms: 'MY',
  pl: 'PL', uk: 'UA', nl: 'NL', cs: 'CZ', ro: 'RO', fa: 'IR', he: 'IL', fil: 'PH', sw: 'KE',
};
/** The zone used when the owner has not saved one: their country's, then their language's, then UTC. */
export function ownerTimezone(saved: unknown, country?: string | null, language?: Language | null): string {
  if (isTimezone(saved)) return saved;
  return countryTimezone(country) ?? countryTimezone(language ? languageCountries[language] : null) ?? 'UTC';
}
/** The calendar day, hour and weekday (0 = Sunday) at an instant in a zone. */
export function localClock(now: Date, timezone: string): { date: string; hour: number; weekday: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: isTimezone(timezone) ? timezone : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}
/** The local day a digest is due on, or null outside the morning window or once that day's digest was sent. */
export function digestDue(now: Date, timezone: string, sentOn: string | null | undefined): string | null {
  const local = localClock(now, timezone);
  return local.hour >= digestHours.from && local.hour < digestHours.until && (!sentOn || sentOn < local.date) ? local.date : null;
}
/** The local Sunday a recap is due on, or null outside the Sunday evening window or once that week's recap was sent. */
export function recapDue(now: Date, timezone: string, sentOn: string | null | undefined): string | null {
  const local = localClock(now, timezone);
  return local.weekday === 0 && local.hour >= recapHours.from && local.hour < recapHours.until && (!sentOn || sentOn < local.date) ? local.date : null;
}
/** The current instant; the cron routes read it here so tests can fix it. */
export const currentInstant = () => new Date();
/** The browser's own zone, used to fill an empty Settings field. */
export function browserTimezone(): string | null {
  try { const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; return isTimezone(zone) ? zone : null; } catch { return null; }
}
/** The offset of a zone at an instant, such as UTC+05:00 or UTC−03:30. */
export function timezoneOffset(timezone: string, now: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = name.replace('GMT', '');
  return 'UTC' + (offset ? offset.replace('-', '−') : '+00:00');
}
/** Every zone for the Settings picker, ordered by offset then name, labelled like "Asia/Tashkent · UTC+05:00". A saved zone the runtime lists under another name is kept. */
export function timezoneOptions(now: Date, keep?: string | null): Array<{ value: string; label: string }> {
  const listed = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
  const zones = [...new Set([...listed, 'UTC', ...(keep && isTimezone(keep) ? [keep] : [])])];
  const minutes = (offset: string) => { const match = /([+−])(\d{2}):(\d{2})/.exec(offset); return match ? (match[1] === '−' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0; };
  return zones.map(zone => ({ zone, offset: timezoneOffset(zone, now) }))
    .sort((a, b) => minutes(a.offset) - minutes(b.offset) || a.zone.localeCompare(b.zone))
    .map(({ zone, offset }) => ({ value: zone, label: `${zone.replace(/_/g, ' ')} · ${offset}` }));
}
