// Run after `npx next build --webpack`: node --test tests/google-auth.mjs
// Uses a local Supabase stub; never authenticates or changes a real account.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

test('Google OAuth routes keep the exchange bound to the browser and handle failures', async () => {
  let googleEnabled = false;
  let exchangeCount = 0;
  let expectedVerifier;
  const upstream = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/settings') {
      res.end(JSON.stringify({ external: { google: googleEnabled } }));
    } else if (req.url === '/auth/v1/token?grant_type=pkce') {
      exchangeCount++;
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (body.auth_code !== 'valid-code' || body.code_verifier !== expectedVerifier) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'invalid_grant' }));
      } else {
        res.end(JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600,
          user: { id: '9f649368-8f33-4c29-9fa3-83e52dc62d48', email: 'test@example.com' } }));
      }
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const supabaseUrl = `http://127.0.0.1:${upstream.address().port}`;
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '5189'], {
    env: { ...process.env, NODE_ENV: 'production', SUPABASE_URL: supabaseUrl, SUPABASE_PUBLISHABLE_KEY: 'test-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  app.stdout.on('data', chunk => { logs += chunk; });
  app.stderr.on('data', chunk => { logs += chunk; });
  const origin = 'http://localhost:5189';
  const request = (path, options = {}) => fetch(origin + path, { redirect: 'manual', ...options });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (app.exitCode !== null) throw new Error(logs);
      try { if ((await request('/api/auth')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const post = (headers = {}) => request('/api/auth/google', { method: 'POST', headers: { Origin: origin, ...headers } });
    assert.equal((await post({ Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await request('/api/auth/google')).status, 405);
    let result = await post();
    assert.equal(result.status, 303, `${await result.clone().text()}\n${logs}`);
    assert.equal(new URL(result.headers.get('location')).searchParams.get('auth_error'), 'google_setup');
    assert.equal(result.headers.get('set-cookie'), null);

    googleEnabled = true;
    result = await post();
    assert.equal(result.status, 303);
    const authUrl = new URL(result.headers.get('location'));
    assert.equal(authUrl.origin, supabaseUrl);
    assert.equal(authUrl.searchParams.get('provider'), 'google');
    assert.equal(authUrl.searchParams.get('redirect_to'), origin + '/auth/callback');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 's256');
    const cookie = result.headers.getSetCookie().find(value => value.startsWith('hf_google_verifier='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Path=\/auth\/callback/i);
    const cookieHeader = cookie.split(';')[0];
    expectedVerifier = cookieHeader.split('=')[1];
    assert.equal(authUrl.searchParams.get('code_challenge'), createHash('sha256').update(expectedVerifier).digest('base64url'));
    assert.ok(!authUrl.href.includes(expectedVerifier));

    result = await request('/auth/callback?code=valid-code');
    assert.equal(new URL(result.headers.get('location')).searchParams.get('auth_error'), 'google_expired');
    assert.equal(exchangeCount, 0);
    result = await request('/auth/callback?error=access_denied', { headers: { Cookie: cookieHeader } });
    assert.equal(new URL(result.headers.get('location')).searchParams.get('auth_error'), 'google_cancelled');
    assert.equal(exchangeCount, 0);
    result = await request('/auth/callback?code=bad-code', { headers: { Cookie: cookieHeader } });
    assert.equal(new URL(result.headers.get('location')).searchParams.get('auth_error'), 'google_failed');
    assert.ok(!result.headers.getSetCookie().some(value => value.startsWith('hf_access=')));
    result = await request('/auth/callback?code=valid-code&next=https://untrusted.example', { headers: { Cookie: cookieHeader } });
    assert.equal(result.headers.get('location'), origin + '/');
    const sessionCookies = result.headers.getSetCookie();
    assert.ok(sessionCookies.some(value => value.startsWith('hf_access=test-access;') && /HttpOnly/i.test(value)));
    assert.ok(sessionCookies.some(value => value.startsWith('hf_refresh=test-refresh;') && /Secure/i.test(value)));
    assert.ok(sessionCookies.some(value => value.startsWith('hf_google_verifier=;') && /Max-Age=0/.test(value)));
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await request('/api/records')).status, 401);
  } finally {
    app.kill('SIGTERM');
    await new Promise(resolve => upstream.close(resolve));
    if (app.exitCode === null) await once(app, 'exit');
  }
});
