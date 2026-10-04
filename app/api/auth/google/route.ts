import { cookies } from 'next/headers';
import { requestRejected } from '@/lib/api-route';
import { config, sameOrigin, supa } from '@/lib/supabase';
import { GOOGLE_VERIFIER_COOKIE, googleAuthorization, googleCookieOptions, loginRedirect } from '@/lib/google-auth';

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  if (!sameOrigin(req)) return requestRejected();

  try {
    // Avoid sending visitors to an unconfigured provider's raw error page.
    const settings = await supa('/auth/v1/settings', { cache: 'no-store' });
    if (!settings.ok) return loginRedirect(origin, 'google_unavailable');
    const data = await settings.json() as { external?: { google?: boolean } };
    if (!data.external?.google) return loginRedirect(origin, 'google_setup');

    const { verifier, url } = googleAuthorization(config().url, origin);
    (await cookies()).set(GOOGLE_VERIFIER_COOKIE, verifier, googleCookieOptions);
    return new Response(null, {
      status: 303,
      headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  } catch {
    return loginRedirect(origin, 'google_unavailable');
  }
}
