import { createHash, randomBytes } from 'node:crypto';

export const GOOGLE_VERIFIER_COOKIE = 'hf_google_verifier';
export const GOOGLE_CALLBACK_PATH = '/auth/callback';
export const googleCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: GOOGLE_CALLBACK_PATH,
  maxAge: 600,
};

export function googleAuthorization(supabaseUrl: string, origin: string) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('/auth/v1/authorize', supabaseUrl);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', new URL(GOOGLE_CALLBACK_PATH, origin).href);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 's256');
  url.searchParams.set('scopes', 'email profile');
  url.searchParams.set('prompt', 'select_account');
  return { verifier, url };
}

export function loginRedirect(origin: string, error?: string) {
  const url = new URL('/', origin);
  if (error) url.searchParams.set('auth_error', error);
  return new Response(null, {
    status: 303,
    headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
