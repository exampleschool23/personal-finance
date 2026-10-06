// Signs the test account in, saves the fixture through the app's API, keeps the session for every test and
// snapshots the database so each test starts from exactly this state.
import fs from 'node:fs';
import { request } from '@playwright/test';
import { appUrl, supabaseUrl, testAccount } from './settings.mjs';
import { accounts, others, settings, transactions } from './fixture.mjs';

export default async function globalSetup() {
  const api = await request.newContext({ baseURL: appUrl });
  const ok = async (label, response) => { if (!response.ok()) throw new Error(`${label}: ${response.status()} ${await response.text()}`); return response; };
  await ok('sign in', await api.post('/api/auth', { data: { email: testAccount.email, password: testAccount.password } }));
  await ok('settings', await api.put('/api/settings', { data: settings }));
  for (const record of [...Object.values(accounts), ...transactions, ...others]) {
    await ok(`record ${record.name}`, await api.post('/api/records', { data: record }));
    // Same-day transactions are told apart by when they were saved.
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  fs.mkdirSync('e2e/.auth', { recursive: true });
  await api.storageState({ path: 'e2e/.auth/state.json' });
  await api.dispose();
  if (process.env.E2E_DEBUG) console.log(await (await fetch(supabaseUrl + '/rest/v1/finance_records?select=name,created_at,id&order=created_at.asc', { headers: { apikey: 'sb_secret_e2e_only' } })).text());
  const snapshot = await fetch(supabaseUrl + '/__snapshot', { method: 'POST' });
  if (!snapshot.ok) throw new Error('Could not snapshot the test database.');
}
