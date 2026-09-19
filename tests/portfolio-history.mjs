import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { assets, liabilities } from '../lib/finance.ts';
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const convertAmount = new Function(compile('../lib/market.ts') + ';return convertAmount;')();
const { portfolioHistory, portfolioWindow, portfolioChartDomain } = new Function('assets', 'liabilities', 'convertAmount', compile('../lib/portfolio-history.ts') + ';return {portfolioHistory,portfolioWindow,portfolioChartDomain};')(assets, liabilities, convertAmount);
const record = (id, kind, currency = 'USD') => ({ id, kind, currency });
const event = (record_id, date, balance, ownership_percentage = 100) => ({ id: record_id + date, record_id, occurred_on: date, balance, ownership_percentage, created_at: date });
test('waits for full coverage, applies ownership and FX, and carries debt forward', () => {
 const result = portfolioHistory([record('a','Business'),record('b','Loan','UZS')], [event('a','2026-01-01',1000,50),event('b','2026-01-02',1200000),event('a','2026-01-03',1400,50)], 'USD', { UZS:12000 }, '2026-09-17');
 assert.deepEqual(result.points, [{date:'2026-01-02',assets:500,debt:100,net:400},{date:'2026-01-03',assets:700,debt:100,net:600}]);
 assert.equal(result.missing,0);
});
test('does not invent missing history or use future, removed, or cash-only events', () => {
 const result = portfolioHistory([record('a','Cash'),record('b','Stock')], [event('a','2026-01-01',100),event('b','2027-01-01',200),event('b','2026-01-02',null),event('deleted','2026-01-01',999)], 'USD', undefined, '2026-09-17');
 assert.deepEqual(result.points,[]);assert.equal(result.missing,1);
});
test('reports unavailable currencies and keeps actual zero balances', () => {
 const result = portfolioHistory([record('a','Cash'),record('b','Cash','EUR')],[event('a','2026-01-01',0)],'USD',undefined,'2026-09-17');
 assert.equal(result.excluded,1);assert.equal(result.points[0].net,0);
});
test('period starts with last known balance, without inventing pre-history', () => {
 const points = [{date:'2026-01-01',net:100},{date:'2026-09-01',net:200},{date:'2026-09-17',net:250}];
 assert.deepEqual(portfolioWindow(points,30,'2026-09-17'),[{date:'2026-08-18',net:100},...points.slice(1)]);
 assert.deepEqual(portfolioWindow(points.slice(1),30,'2026-09-17'),points.slice(1));
 assert.deepEqual(portfolioWindow(points,null,'2026-09-17'),points);
});

test('chart focuses on the selected balances and preserves the observed change', () => {
 const points = [{date:'2026-09-17',assets:398000,debt:87106,net:310894},{date:'2026-09-18',assets:398000,debt:91560,net:306440}];
 const before = structuredClone(points);
 const [low,high] = portfolioChartDomain(points,['net']);
 assert.ok(low > 300000 && low < 306440);
 assert.ok(high > 310894 && high < 320000);
 assert.ok(4454 / (high-low) > 0.5);
 const [allLow,allHigh] = portfolioChartDomain(points,['net','assets','debt']);
 assert.ok(allLow < 87106 && allHigh > 398000);
 assert.deepEqual(points,before);
});
test('chart scale handles zero, negative, constant, precise and missing balances', () => {
 for (const net of [0,-300000,300000,0.12345678]) {
  const [low,high] = portfolioChartDomain([{net}],['net']);
  assert.ok(Number.isFinite(low) && Number.isFinite(high) && low < net && high > net);
 }
 assert.deepEqual(portfolioChartDomain([],['net']),[0,1]);
 assert.deepEqual(portfolioChartDomain([{net:NaN}],['net']),[0,1]);
});
test('portfolio chart connects observations and scales the chosen series', () => {
 const ui = fs.readFileSync(new URL('../components/portfolio-overview.tsx',import.meta.url),'utf8');
 assert.match(ui,/useState<[^;]+>\('net'\)/);
 assert.match(ui,/portfolioChartDomain\(visible, chartKeys\)/);
 assert.match(ui,/domain=\{chartDomain\}/);
 assert.equal((ui.match(/type=\{historyMode==='recorded'\?'stepAfter':'linear'\}/g)||[]).length,3);
 assert.match(ui,/useState<'recorded'\|'observed'>\('recorded'\)/);
});

test('dated PC purchase transfers cash without creating net worth; breeding valuation changes only its day',()=>{
 const rows=[record('cash','Cash'),record('club','Business'),record('sheep','Business'),record('debt','Debt')];
 const result=portfolioHistory(rows,[event('cash','2026-09-01',20000),event('club','2026-09-01',10000),event('sheep','2026-09-01',1000),event('debt','2026-08-01',5000),event('cash','2026-09-02',5000),event('club','2026-09-02',25000),event('sheep','2026-09-03',1500)],'USD',undefined,'2026-09-04');
 assert.deepEqual(result.points.map(p=>[p.date,p.net]),[['2026-09-01',26000],['2026-09-02',26000],['2026-09-03',26500]]);
});
