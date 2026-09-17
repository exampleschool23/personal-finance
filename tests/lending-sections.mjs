import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assets, liabilities, assetRecordKinds, lendingRecordKinds, value } from '../lib/finance.ts';

test('money lent belongs to Loans & debts while remaining an asset', () => {
 assert.ok(lendingRecordKinds.includes('Money lent'));
 assert.ok(!assetRecordKinds.includes('Money lent'));
 assert.ok(assets.includes('Money lent'));
 assert.ok(!liabilities.includes('Money lent'));
 assert.equal(value({kind:'Money lent', amount:500}),500);
});

test('database page rows and counts use the same lending section', () => {
 for (const file of ['migrations/011_money_lent_in_loans_and_debts.sql','database/setup.sql']) {
  const sql=fs.readFileSync(file,'utf8').split('CREATE OR REPLACE FUNCTION public.finance_records_page(').at(-1);
  const assetFilters=[...sql.matchAll(/p_section='assets' AND r.kind IN \(([^)]+)\)/g)];
  const lendingFilters=[...sql.matchAll(/p_section='debts' AND r.kind IN \(([^)]+)\)/g)];
  assert.equal(assetFilters.length,2);
  assert.equal(lendingFilters.length,2);
  for(const [,kinds] of assetFilters) assert.ok(!kinds.includes("'Money lent'"));
  for(const [,kinds] of lendingFilters) assert.ok(kinds.includes("'Money lent'"));
 }
});
