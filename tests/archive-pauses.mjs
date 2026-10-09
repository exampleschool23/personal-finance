import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTS } from './helpers/load-ts.mjs';

const { archivedIn, nextArchivePauses } = loadTS('lib/archive-pauses.ts');
const { monthly } = loadTS('lib/finance.ts');
const { upcomingPayments } = loadTS('lib/planning.ts');
const { monthOccurrences } = loadTS('lib/recurring.ts');

// Archived on 10 August, restored on 20 October: August and September are out, October is back.
const pauses = [{ from: '2026-08-10', to: '2026-10-20' }];

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

test('in the database, archiving a repeating bill opens a pause today and restoring closes it', async () => {
 const d = await database();
 try {
  const start = (await d.query("SELECT (date_trunc('month',now() AT TIME ZONE 'Asia/Tashkent')-interval '3 month')::date::text AS start")).rows[0].start;
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'QA Gym','Living expense','USD',40,$3,'Monthly')", [uid(20), uid(1), start]);
  await d.exec(`SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated;`);
  const pausesOf = async () => (await d.query('SELECT archive_pauses FROM finance_records WHERE id=$1', [uid(20)])).rows[0].archive_pauses;
  await d.query('UPDATE finance_records SET archived=true WHERE id=$1', [uid(20)]);
  const open = await pausesOf();
  assert.equal(open.length, 1); assert.equal(open[0].to, null);
  // Restoring the same day leaves no pause behind.
  await d.query('UPDATE finance_records SET archived=false WHERE id=$1', [uid(20)]);
  assert.deepEqual(await pausesOf(), []);
 } finally { await d.close(); }
});
