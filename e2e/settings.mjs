// Where the browser tests find the app and the test Supabase, and the one account they sign in with. The account
// exists only inside e2e/fake-supabase.mjs for the length of a run; it is never a real account.
export const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:5155';
export const supabaseUrl = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54329';
export const testAccount = { id: '00000000-0000-4000-8000-0000000000e2', email: 'e2e@example.test', password: 'e2e-only-password' };
