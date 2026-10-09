import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { assistantContext, assistantRequestSchema, assistantInstructions } = loadTS('lib/assistant.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const data = { categories: [{ id: 'pets', name: 'Pets', direction: 'expense' }], occurrences: [], activity: [], investmentLinks: [],
 goals: [{ id: 'g', name: 'Emergency fund', allocated: 4200, target: 10000, target_date: '2027-12-02', archived: false, currency: 'USD', monthly_contribution: 400 }, { id: 'old', name: 'Old goal', allocated: 1, target: 2, archived: true }],
 records: [record('cash', 'Main account', 'Cash', 5000.4, '2026-01-01'), record('loan', 'Car loan', 'Loan', 125000000, '2027-01-01', { currency: 'UZS' }), record('rent', 'Rent', 'Rent expense', 900, '2026-01-03', { frequency: 'Monthly' }),
  record('food', 'Market', 'Living expense', 120.6, '2026-09-10'), record('vet', 'Vet', 'Other expense', 80, '2026-10-01', { custom_category_id: 'pets' }), record('pay', 'Payroll', 'Salary', 3000, '2026-09-05')] };

test('the assistant snapshot lists holdings, debts, monthly cash flow, scheduled bills and open goals in whole amounts, with dates and amounts formatted as the app shows them', () => {
 const text = assistantContext(data, '2026-10-02', 'USD', { USD: 1, UZS: 12500 });
 assert.match(text, /Today is 2 October 2026\. Display currency: USD\./);
 assert.match(text, /- Main account \(Cash\): \$5,000\n/);
 assert.match(text, /- Car loan \(Loan\): \$10,000, due 1 January 2027/);
 assert.match(text, /September 2026: income \$3,000, spending \$121 \(Living expense \$121\)/);
 assert.match(text, /October 2026 \(so far\): income \$0, spending \$80 \(Pets \$80\)/);
 assert.match(text, /3 October 2026 Rent \(Rent expense, Monthly\): \$900, due/);
 assert.match(text, /Emergency fund: \$4,200 of \$10,000 by 2 December 2027, saving \$400 a month/);
 assert.doesNotMatch(text, /Old goal/);
 assert.doesNotMatch(text, /\d{4}-\d{2}/, 'no ISO dates or months reach the model');
 assert.match(assistantInstructions, /exactly as the snapshot writes them/);
 // The snapshot follows the person's language, so the assistant's figures match the rest of the app.
 const ru = assistantContext(data, '2026-10-02', 'USD', { USD: 1, UZS: 12500 }, 'ru');
 assert.match(ru, /Today is 2 октября 2026\./);
 assert.match(ru, /Main account \(Cash\): 5\s000\s\$/);
 assert.match(ru, /Сентябрь 2026: income 3\s000\s\$/);
 assert.match(assistantContext(data, '2026-10-02', 'USD', { USD: 1 }, 'de'), /Car loan \(Loan\): 125\.000\.000\sUZS, due 1\. Januar 2027/);
 assert.equal(assistantContext(data, '2026-10-02', 'USD', { USD: 1 }, 'xx'), assistantContext(data, '2026-10-02', 'USD', { USD: 1 }), 'an unknown language reads as English');
 assert.match(assistantContext(data, '2026-10-02', 'USD', { USD: 1 }), /Car loan \(Loan\): UZS\s125,000,000/, 'no inferred exchange rate');
 assert.doesNotMatch(assistantInstructions, /\d{4}-\d{2}-\d{2}/, 'the instructions carry no per-request data, so they cache');
});

test('assistant requests start and end with the user and stay small', () => {
 const ok = { messages: [{ role: 'user', content: 'Hi' }], currency: 'USD', rates: { USD: 1 }, language: 'en' };
 assert.ok(assistantRequestSchema.safeParse(ok).success);
 assert.ok(!assistantRequestSchema.safeParse({ ...ok, messages: [{ role: 'assistant', content: 'Hi' }] }).success);
 assert.ok(!assistantRequestSchema.safeParse({ ...ok, messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Yes' }] }).success);
 assert.ok(!assistantRequestSchema.safeParse({ ...ok, messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) }).success);
 assert.ok(!assistantRequestSchema.safeParse({ ...ok, messages: [{ role: 'user', content: 'x'.repeat(4001) }] }).success);
 assert.ok(!assistantRequestSchema.safeParse({ ...ok, rates: { USD: -1 } }).success);
});

test('the assistant route needs a key and a session, reads only the owner rows and asks Claude with fallbacks', async () => {
 const calls = [], reads = [];
 let reply = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You spent 121 USD.' }] };
 const clients = [], options = [];
 class Fake { constructor(settings) { clients.push(settings); this.beta = { messages: { create: async (body, opts) => { calls.push(body); options.push(opts); if (opts?.signal?.aborted) throw Error('aborted'); return reply; } } }; } }
 Fake.RateLimitError = class extends Error {}; Fake.AuthenticationError = class extends Error {};
 let auth = { token: 'owner-token', user: { id: 'u1' } };
 const route = loadTS('app/api/assistant/route.ts', {
  '@anthropic-ai/sdk': { __esModule: true, default: Fake },
  '@/lib/supabase': { session: async () => auth, sameOrigin: () => true },
  '@/lib/server-records': { readOwnerRows: async (table, token) => { reads.push([table, token]); return table === 'finance_records' ? data.records : table === 'savings_goals' ? data.goals : table === 'transaction_categories' ? data.categories : []; } },
 });
 const request = body => new Request('https://app.example/api/assistant', { method: 'POST', body: JSON.stringify(body) });
 const body = { messages: [{ role: 'user', content: 'How much did I spend?' }], currency: 'USD', rates: { USD: 1 }, language: 'en' };
 delete process.env.ANTHROPIC_API_KEY;
 assert.equal((await route.POST(request(body))).status, 503);
 process.env.ANTHROPIC_API_KEY = 'test-key';
 try {
  auth = null; assert.equal((await route.POST(request(body))).status, 401);
  auth = { token: 'owner-token', user: { id: 'u1' } };
  assert.equal((await route.POST(request({ ...body, messages: [] }))).status, 400);
  const response = await route.POST(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: 'You spent 121 USD.' });
  assert.ok(reads.every(([, token]) => token === 'owner-token'));
  const sent = calls.at(-1);
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.fallbacks, 'default');
  assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
  assert.match(sent.messages[0].content[0].text, /Snapshot of my finances/);
  assert.deepEqual(sent.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(sent.messages.at(-1), body.messages[0]);
  assert.deepEqual(clients.at(-1), { timeout: 60_000, maxRetries: 1 });
  assert.ok(options.at(-1).signal instanceof AbortSignal);
  // A visitor who leaves before the answer is not reported as an assistant failure.
  const left = new AbortController(); left.abort();
  const gone = await route.POST(new Request('https://app.example/api/assistant', { method: 'POST', body: JSON.stringify(body), signal: left.signal }));
  assert.equal(gone.status, 499);
  reply = { stop_reason: 'refusal', content: [] };
  assert.equal((await route.POST(request(body))).status, 422);
 } finally { delete process.env.ANTHROPIC_API_KEY; }
});
