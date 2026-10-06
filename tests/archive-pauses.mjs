import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTS } from './helpers/load-ts.mjs';

const { archivedIn, nextArchivePauses, plansOfMonth } = loadTS('lib/archive-pauses.ts');
const { monthlyBudgetTotals } = loadTS('lib/expense-plans.ts');
const { monthly } = loadTS('lib/finance.ts');
const { upcomingPayments } = loadTS('lib/planning.ts');
const { monthOccurrences } = loadTS('lib/recurring.ts');

// Archived on 10 August, restored on 20 October: August and September are out, October is back.
const pauses = [{ from: '2026-08-10', to: '2026-10-20' }];
const same = (amount, currency) => currency === 'USD' ? amount : null;

test('an archive covers its own month up to the restore month, and an open one every month after it', () => {
 assert.deepEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(month => archivedIn({ archive_pauses: pauses }, month)), [false, true, true, false, false]);
 const open = { archived: true, archive_pauses: [{ from: '2026-10-05', to: null }] };
 assert.deepEqual(['2026-09', '2026-10', '2027-01'].map(month => archivedIn(open, month)), [false, true, true]);
 assert.equal(archivedIn({ archive_pauses: [{ from: '2026-10-05', to: '2026-10-25' }] }, '2026-10'), false, 'archived and restored within one month loses nothing');
 // Before migration 115: no pauses, so an archived item is out of every month and an active one of none.
 assert.equal(archivedIn({ archived: true }, '2020-01'), true);
 assert.equal(archivedIn({ archived: true, archive_pauses: [] }, '2020-01'), true);
 assert.equal(archivedIn({}, '2026-10'), false);
});

test('archiving opens a pause today and restoring closes it, or drops it when it opened the same day', () => {
 const opened = nextArchivePauses(undefined, true, '2026-08-10');
 assert.deepEqual(opened, [{ from: '2026-08-10', to: null }]);
 assert.deepEqual(nextArchivePauses(opened, false, '2026-10-20'), pauses);
 assert.deepEqual(nextArchivePauses([...pauses, { from: '2026-11-01', to: null }], false, '2026-11-01'), pauses);
 assert.deepEqual(nextArchivePauses(null, false, '2026-11-01'), []);
});

test('a restored spending plan counts in the months before the archive and from the restore month, never in between', () => {
 const plan = { id: 'p', name: 'QA Groceries', category: 'Groceries', currency: 'USD', amount: 100, start_date: '2026-07-01', end_date: null, spent: 0, archive_pauses: pauses };
 assert.deepEqual(['2026-07', '2026-08', '2026-09', '2026-10'].map(month => monthlyBudgetTotals(plansOfMonth([plan], month), month, same).planned), [100, 0, 0, 100]);
 // Still archived: earlier months keep it, the archive month and later do not.
 const archived = { ...plan, archived: true, archive_pauses: [{ from: '2026-10-05', to: null }] };
 assert.deepEqual(['2026-09', '2026-10', '2026-11'].map(month => monthlyBudgetTotals(plansOfMonth([archived], month), month, same).planned), [100, 0, 0]);
});

test('a restored bill has no overdue payments for its archived months and resumes in the restore month', () => {
 const bill = { id: 'gym', name: 'QA Gym', kind: 'Living expense', currency: 'USD', amount: 40, quantity: 1, cost: 0, rate: 0, date: '2026-07-01', frequency: 'Monthly', notes: '', archive_pauses: pauses };
 const occurrences = [{ id: 'o', record_id: 'gym', due_on: '2026-07-01', status: 'paid' }];
 assert.deepEqual(upcomingPayments([bill], occurrences, '2026-10-21', '2026-11-30').map(item => [item.date, item.overdue]), [['2026-10-01', true], ['2026-11-01', false]]);
 assert.deepEqual(monthOccurrences([bill], occurrences, '2026-09', '2026-10-21'), []);
 assert.equal(monthOccurrences([bill], occurrences, '2026-10', '2026-10-21').length, 1);
 assert.deepEqual(['2026-08', '2026-10'].map(month => monthly(bill, month)), [0, 40]);
 assert.equal(monthly({ ...bill, archived: true, archive_pauses: [{ from: '2026-10-05', to: null }] }), 0, 'with no month, an archived schedule adds nothing');
});

test('the database keeps the pauses and the plan month skips them, with carry-over starting again at zero', () => {
 const sql = fs.readFileSync('migrations/115_archive_pauses.sql', 'utf8');
 for (const table of ['finance_records', 'expense_plans']) {
  assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ADD COLUMN IF NOT EXISTS archive_pauses jsonb NOT NULL DEFAULT '\\[\\]'::jsonb`));
  assert.match(sql, new RegExp(`CREATE TRIGGER track_archive_pause BEFORE UPDATE OF archived ON public\\.${table}\\nFOR EACH ROW WHEN \\(OLD\\.archived IS DISTINCT FROM NEW\\.archived\\)`));
  assert.match(sql, new RegExp(`UPDATE public\\.${table} SET archive_pauses=jsonb_build_array\\(jsonb_build_object\\('from',\\(now\\(\\) AT TIME ZONE 'Asia/Tashkent'\\)::date,'to',NULL\\)\\)\\nWHERE archived`));
 }
 assert.match(sql, /m>=date_trunc\('month',\(x->>'from'\)::date\) AND \(x->>'to' IS NULL OR m<date_trunc\('month',\(x->>'to'\)::date\)\)\)\n   THEN budget:=0;carry:=0;/);
 assert.doesNotMatch(sql, /auth\.uid\(\)/, 'a shared workspace reads the active owner');
 assert.ok(fs.readFileSync('database/setup.sql', 'utf8').includes(sql.trim()), 'the fresh setup includes it');
});

const uid = n => `69000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function database() {
 const d = new PGlite();
 await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${uid(1)}');`);
 await d.exec(fs.readFileSync('database/setup.sql', 'utf8'));
 return d;
}

test('in the database, a rollover plan restored this month carries nothing over from its archived months', async () => {
 const d = await database();
 try {
  const { start, archived, month } = (await d.query("SELECT (date_trunc('month',now() AT TIME ZONE 'Asia/Tashkent')-interval '3 month')::date::text AS start,(date_trunc('month',now() AT TIME ZONE 'Asia/Tashkent')-interval '2 month')::date::text AS archived,date_trunc('month',now() AT TIME ZONE 'Asia/Tashkent')::date::text AS month")).rows[0];
  await d.query("INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,'QA Groceries','Groceries','USD',100,$3)", [uid(10), uid(1), start]);
  await d.query('UPDATE expense_plan_versions SET rollover=true WHERE plan_id=$1', [uid(10)]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'QA Gym','Living expense','USD',40,$3,'Monthly')", [uid(20), uid(1), start]);
  await d.exec(`SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated;`);
  const plan = async () => (await d.query('SELECT expense_plan_month($1::date) AS r', [month])).rows[0].r.find(item => item.id === uid(10));
  assert.equal(Number((await plan()).carryover), 300, 'three unspent months roll over when it was never archived');
  // Archived two months ago and restored on the first of this month.
  await d.query("UPDATE expense_plans SET archive_pauses=jsonb_build_array(jsonb_build_object('from',$2::date,'to',$3::date)) WHERE id=$1", [uid(10), archived, month]);
  const restored = await plan();
  assert.deepEqual([Number(restored.amount), Number(restored.carryover)], [100, 0], 'the restore month starts afresh');
  const before = (await d.query('SELECT expense_plan_month($1::date) AS r', [archived])).rows[0].r.find(item => item.id === uid(10));
  assert.deepEqual([Number(before.amount), Number(before.carryover)], [0, 0], 'the archive month has no allowance');
  // The trigger: archiving opens a pause today; restoring the same day leaves no pause behind.
  await d.query('UPDATE expense_plans SET archived=true WHERE id=$1', [uid(10)]);
  const open = (await d.query('SELECT archive_pauses FROM expense_plans WHERE id=$1', [uid(10)])).rows[0].archive_pauses;
  assert.equal(open.length, 2); assert.equal(open[1].to, null);
  assert.equal(Number((await plan()).amount), 0, 'an archived plan has no allowance this month');
  await d.query('UPDATE expense_plans SET archived=false WHERE id=$1', [uid(10)]);
  assert.deepEqual((await d.query('SELECT archive_pauses FROM expense_plans WHERE id=$1', [uid(10)])).rows[0].archive_pauses, [{ from: archived, to: month }]);
  // A repeating bill keeps its pauses the same way.
  await d.query('UPDATE finance_records SET archived=true WHERE id=$1', [uid(20)]);
  assert.equal((await d.query('SELECT archive_pauses FROM finance_records WHERE id=$1', [uid(20)])).rows[0].archive_pauses[0].to, null);
 } finally { await d.close(); }
});
