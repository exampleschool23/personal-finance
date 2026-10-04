import { dialCode } from '@/lib/phone-countries';

/** The country our host estimates from the visitor's connection, used only to preselect the phone sign-in country. Not stored. */
export function GET(request: Request) {
 const country = (request.headers.get('x-vercel-ip-country') ?? '').toUpperCase();
 return Response.json({ country: dialCode(country) ? country : '' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
