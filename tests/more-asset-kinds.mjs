import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTS } from './helpers/load-ts.mjs';
import { gramsPerTroyOunce, instrumentFor, marketEntry, marketSymbols, metalUnitPrice, quotedUnitPrice } from '../lib/market.ts';
import { historyKindGroups, historyUpdateTypes, trackedKinds } from '../lib/investment-history.ts';

// Migration 116: precious metals, equity compensation, bonds, retirement accounts and vehicles.
const finance = loadTS('lib/finance.ts');
const id = n => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a metal is priced per unit of its own weight and purity from the spot price of a fine troy ounce', () => {
 assert.equal(metalUnitPrice(2400, 'oz', 1), 2400);
 assert.ok(Math.abs(metalUnitPrice(2400, 'g', 0.9999) - 2400 / gramsPerTroyOunce * 0.9999) < 1e-9);
 assert.ok(Math.abs(metalUnitPrice(2400, 'kg', 0.75) - 2400 * 1000 / gramsPerTroyOunce * 0.75) < 1e-9);
 const gold = { id: 'g', name: 'Gold bars', kind: 'Precious metals', currency: 'USD', amount: 70, cost: 60, quantity: 200, metal: 'XAU', metal_unit: 'g', metal_purity: 0.9999 };
 assert.deepEqual(instrumentFor(gold), { kind: 'Metal', symbol: 'XAU' });
 const quote = { usd: 2400, source: 'Twelve Data', fetchedAt: '2026-10-06T10:00:00Z' };
 assert.equal(quotedUnitPrice(gold, quote), metalUnitPrice(2400, 'g', 0.9999));
 // A stock's quote is its unit price; a metal without a weight unit has none rather than a wrong one.
 assert.equal(quotedUnitPrice({ kind: 'Stock' }, quote), 2400);
 assert.equal(quotedUnitPrice({ ...gold, metal_unit: null }, quote), null);
 assert.equal(quotedUnitPrice(gold, { ...quote, usd: 0 }), null);
 // The live value replaces the saved price and keeps the weight: 200 g of 999.9 gold at $2,400 an ounce.
 const live = marketEntry(gold, 'USD', { rates: { USD: 1 }, fx: null, quotes: { 'Metal:XAU': quote }, errors: {}, stocksConfigured: true });
 assert.ok(Math.abs(live.amount * live.quantity - 200 * 2400 / gramsPerTroyOunce * 0.9999) < 1e-6);
 // Without a quote the saved price is kept.
 assert.equal(marketEntry(gold, 'USD', { rates: { USD: 1 }, fx: null, quotes: {}, errors: {}, stocksConfigured: true }).amount, 70);
});

test('vested employer shares follow their ticker, and each feed is asked once per symbol', () => {
 assert.deepEqual(instrumentFor({ kind: 'Equity compensation', name: 'GOOGL' }), { kind: 'Stock', symbol: 'GOOGL' });
 assert.equal(instrumentFor({ kind: 'Equity compensation', name: 'My employer' }), null);
 assert.equal(instrumentFor({ kind: 'Precious metals', name: 'Gold', metal: 'GOLD' }), null);
 assert.deepEqual(marketSymbols([
  { kind: 'Stock', name: 'GOOGL' }, { kind: 'Equity compensation', name: 'GOOGL' }, { kind: 'Crypto', name: 'BTC' },
  { kind: 'Precious metals', name: 'Bars', metal: 'XAU' }, { kind: 'Precious metals', name: 'Coins', metal: 'XAU' }, { kind: 'Precious metals', name: 'Coins', metal: 'XAG' },
  { kind: 'Vehicle', name: 'Car' },
 ]), { crypto: ['BTC'], stocks: ['GOOGL'], metals: ['XAU', 'XAG'] });
});

test('the new kinds join the shared groups, and modules that keep their own lists agree with them', () => {
 for (const kind of ['Precious metals', 'Equity compensation', 'Bond', 'Retirement account', 'Vehicle']) {
  assert.ok(finance.kinds.includes(kind) && finance.assets.includes(kind) && trackedKinds.includes(kind), kind);
 }
 assert.deepEqual(historyKindGroups.unitPricedKinds, [...finance.unitPricedKinds]);
 assert.deepEqual(historyKindGroups.valuedKinds, [...finance.valuedKinds]);
 assert.deepEqual(historyKindGroups.interestKinds, [...finance.interestKinds]);
 assert.deepEqual(historyKindGroups.simpleInterestKinds, [...finance.simpleInterestKinds]);
 assert.deepEqual(trackedKinds, [...finance.assets, ...finance.liabilities]);
 // Units times price for metals and vested shares; a bond earns simple interest; a vehicle takes valuations and cash.
 assert.equal(finance.value({ kind: 'Precious metals', amount: 75, quantity: 200 }), 15000);
 assert.equal(finance.value({ kind: 'Equity compensation', amount: 165, quantity: 60 }), 9900);
 assert.equal(finance.interestCompounding({ kind: 'Bond', deposit_compounding: 'monthly' }), 'none');
 assert.deepEqual(historyUpdateTypes('Vehicle'), ['valuation', 'contribution', 'withdrawal', 'income', 'expense']);
 assert.deepEqual(historyUpdateTypes('Precious metals'), ['valuation', 'income', 'expense']);
 // The migration was added to the fresh-database script too.
 assert.ok(fs.readFileSync('database/setup.sql', 'utf8').includes(fs.readFileSync('migrations/116_more_asset_kinds.sql', 'utf8').trim()));
});

test('switching to a metal fills its fields, switching away clears them, and the API refuses a metal without them', () => {
 const { changeRecordKind } = loadTS('lib/record-kind.ts');
 const { recordSchema } = loadTS('lib/record-schema.ts');
 const cash = { id: id(1), name: 'Bars', kind: 'Cash', currency: 'USD', amount: 500, quantity: 1, cost: 0, rate: 0, date: '2026-10-06', lent_date: '', frequency: 'Once', notes: '' };
 const metal = changeRecordKind(cash, 'Precious metals', '2026-10-06');
 assert.deepEqual([metal.metal, metal.metal_unit, metal.metal_purity, metal.amount], ['XAU', 'g', 0.9999, 0]);
 const back = changeRecordKind({ ...metal, metal: 'XAG', metal_unit: 'oz', metal_purity: 0.999 }, 'Vehicle', '2026-10-06');
 assert.deepEqual([back.metal, back.metal_unit, back.metal_purity], [null, null, null]);
 const base = { ...cash, kind: 'Precious metals', amount: 75, quantity: 200, metal: 'XAU', metal_unit: 'g', metal_purity: 0.9999 };
 assert.ok(recordSchema.safeParse(base).success);
 assert.equal(recordSchema.safeParse({ ...base, metal_unit: null }).error.issues[0].message, 'Choose the metal, its weight unit and purity.');
 assert.ok(!recordSchema.safeParse({ ...base, metal: 'GOLD' }).success);
 assert.ok(!recordSchema.safeParse({ ...base, metal_purity: 1.2 }).success);
 assert.ok(!recordSchema.safeParse({ ...cash, metal: 'XAU', metal_unit: 'g', metal_purity: 1 }).success, 'only a metal carries metal fields');
 assert.ok(recordSchema.safeParse({ ...cash, kind: 'Bond', rate: 4.1, opened_on: '2026-01-02', date: '2036-01-02' }).success);
});

test('the database stores the new kinds, guards the metal fields and keeps each metal its own summary row', { skip: !process.env.PGLITE_MODULE }, async () => {
 const { PGlite } = await import(process.env.PGLITE_MODULE); const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;INSERT INTO auth.users VALUES('${id(1)}');SET request.jwt.claim.sub='${id(1)}';`);
  await db.exec(fs.readFileSync('database/setup.sql', 'utf8'));
  // Re-applying the migration changes nothing.
  await db.exec(fs.readFileSync('migrations/116_more_asset_kinds.sql', 'utf8'));
  const insert = (n, name, kind, amount, extra = '') => db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,date${extra ? ',metal,metal_unit,metal_purity' : ''}) VALUES('${id(n)}','${id(1)}','${name}','${kind}','USD',${amount},${kind === 'Precious metals' ? 200 : 1},'2026-09-01'${extra})`);
  await insert(10, 'Gold bars', 'Precious metals', 75, `,'XAU','g',0.9999`);
  await insert(11, 'Gold bars', 'Precious metals', 2300, `,'XAU','oz',0.999`);
  await insert(12, 'GOOGL', 'Equity compensation', 165);
  await insert(13, '10-year note', 'Bond', 30000);
  await insert(14, '401(k)', 'Retirement account', 86000);
  await insert(15, 'Family SUV', 'Vehicle', 24000);
  await assert.rejects(insert(16, 'Loose gold', 'Precious metals', 75), /finance_records_metal_fields/);
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,metal,metal_unit,metal_purity) VALUES('${id(17)}','${id(1)}','Cash','Cash','USD',1,'2026-09-01','XAU','g',1)`), /finance_records_metal_fields/);
  await assert.rejects(insert(18, 'Bars', 'Precious metals', 75, `,'XAU','lb',1`), /metal_unit_check/);
  // Opening balances count units times price.
  const baseline = (await db.query(`SELECT balance FROM investment_history WHERE record_id=$1 AND event_type='baseline'`, [id(10)])).rows[0];
  assert.equal(Number(baseline.balance), 75 * 200);
  // Two holdings named alike stay apart in the net-worth summary, each with its weight unit and purity.
  const page = (await db.query("SELECT finance_records_page(1,'assets',NULL,true) AS page")).rows[0].page;
  const metals = page.summary.filter(row => row.kind === 'Precious metals');
  assert.deepEqual(metals.map(row => [row.metal_unit, Number(row.metal_purity), Number(row.quantity)]).sort(), [['g', 0.9999, 200], ['oz', 0.999, 200]]);
  for (const kind of ['Equity compensation', 'Bond', 'Retirement account', 'Vehicle']) assert.ok(page.summary.some(row => row.kind === kind), kind);
  assert.equal(page.total, 6);
  // Saving through the app's function accepts the metal fields.
  const saved = (await db.query('SELECT save_finance_record($1) AS r', [JSON.stringify({ id: id(20), name: 'Silver coins', kind: 'Precious metals', currency: 'USD', amount: 28, quantity: 50, cost: 0, rate: 0, date: '2026-09-01', frequency: 'Once', notes: '', metal: 'XAG', metal_unit: 'oz', metal_purity: 0.999 })])).rows[0].r;
  assert.deepEqual([saved[0].metal, saved[0].metal_unit, Number(saved[0].metal_purity)], ['XAG', 'oz', 0.999]);
  // A vehicle takes valuations like valuables.
  const day = (await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)', [id(30), id(15), 'valuation', day, 0, 21000, '']);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1', [id(15)])).rows[0].amount), 21000);
  await db.query('SELECT delete_tracker_update($1,$2)', [id(30), id(15)]);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1', [id(15)])).rows[0].amount), 24000);
 } finally { await db.close(); }
});
