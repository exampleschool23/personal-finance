import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { demoRecords, demoHistory, demoBenchmarks, demoMarket, demoBenchmarkKeys } = loadTS('lib/demo-finance.ts');
const { getInvestmentPortfolio, getInvestmentComparison } = loadTS('lib/investment-portfolio.ts');
const { investmentPeriodTotals } = loadTS('lib/investment-period.ts');
const { portfolioWindow } = loadTS('lib/portfolio-history.ts');
const { shiftDay } = loadTS('lib/benchmark-data.ts');
const today = '2026-09-24';
const records = demoRecords(today);
const history = demoHistory(records, today);
const input = { ...history, today, market: demoMarket, currency: 'USD' };

test('demo has a year of funded history, receipts and expenses in all chart windows', () => {
 const portfolio = getInvestmentPortfolio(input);
 assert.equal(portfolio.performance.missing, false);
 assert.ok(portfolio.value > 0);
 assert.equal(portfolio.points[0].date, shiftDay(today, -365));
 assert.equal(portfolio.points.at(-1).date, today);
 for (const days of [30, 90, 365, null]) assert.ok(portfolioWindow(portfolio.points, days, today).length > 1);
 const totals = investmentPeriodTotals(input, '0000-01-01');
 assert.ok(totals.invested > 0);
 assert.ok(totals.income > 0);
 assert.ok(totals.expenses > 0);
 assert.deepEqual(totals.missing, []);
 assert.equal(records.find(row => row.id === 'demo-deposit-usd').rate, 8);
});

test('BTC, S&P and deposit comparisons work offline and preserve currency precision', () => {
 const data = demoBenchmarks(today);
 const usd = getInvestmentComparison(input, data);
 const uzs = getInvestmentComparison({ ...input, currency: 'UZS' }, data);
 assert.ok(usd.points.length > 365);
 for (const key of ['actual', ...demoBenchmarkKeys, 'depositUZS']) {
  assert.ok(usd.points.every(point => Number.isFinite(point[key])), key);
  assert.notEqual(usd.points[0][key], usd.points.at(-1)[key]);
  for (let i = 0; i < usd.points.length; i++) assert.ok(Math.abs(uzs.points[i][key] / 12500 - usd.points[i][key]) < 1e-8);
 }
 assert.equal(getInvestmentComparison({ ...input, currency: 'EUR' }, data), null, 'No inferred exchange rate');
});

test('demo fixtures do not mutate records, leak removed holdings or add history to new records', () => {
 const before = structuredClone(records);
 demoHistory(records, today);
 assert.deepEqual(records, before);
 const edited = records.filter(row => row.id !== 'demo-btc');
 edited.push({ ...records[0], id: 'new-user-investment', kind: 'Business' });
 const changed = demoHistory(edited, today);
 assert.ok(changed.events.every(event => event.record_id !== 'demo-btc' && event.record_id !== 'new-user-investment'));
 assert.equal(demoHistory([], today).events.length, 0);
 const fresh = demoRecords(today);
 fresh[0].amount = 0;
 assert.equal(demoRecords(today)[0].amount, 8500, 'Each demo starts independently');
 const changedCurrency = records.map(row => ({ ...row, currency: 'EUR' }));
 assert.equal(demoHistory(changedCurrency, today).events.length, 0);
});

test('sample dates stay valid across leap years and roll forward with the visit', () => {
 for (const day of ['2024-02-29', '2027-01-01']) {
  const sample = demoHistory(demoRecords(day), day);
  assert.ok(sample.events.every(event => event.occurred_on <= day && event.occurred_on >= shiftDay(day, -365)));
  const data = demoBenchmarks(day);
  assert.equal(data.prices.SPY.at(-1).date, day);
  assert.equal(data.prices.BTC.length, 366);
 }
});
