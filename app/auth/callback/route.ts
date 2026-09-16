import { cookies } from 'next/headers';
import { z } from 'zod';
import { saveSession, supa } from '@/lib/supabase';
import { GOOGLE_VERIFIER_COOKIE, googleCookieOptions, loginRedirect } from '@/lib/google-auth';

const authSession = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user: z.object({ id: z.string().uuid(), email: z.string().email() }),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const verifier = jar.get(GOOGLE_VERIFIER_COOKIE)?.value;
  jar.set(GOOGLE_VERIFIER_COOKIE, '', { ...googleCookieOptions, maxAge: 0 });

  if (url.searchParams.has('error')) return loginRedirect(url.origin, 'google_cancelled');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048 || !verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
    return loginRedirect(url.origin, 'google_expired');
  }

  try {
    const result = await supa('/auth/v1/token?grant_type=pkce', {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    if (!result.ok) return loginRedirect(url.origin, 'google_failed');
    const session = authSession.parse(await result.json());
    await saveSession(session);
    // Only return to the dashboard; never trust an arbitrary redirect parameter.
    return loginRedirect(url.origin);
  } catch {
    return loginRedirect(url.origin, 'google_failed');
  }
}
