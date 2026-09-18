import test from 'node:test';
import assert from 'node:assert/strict';
import { financialTotals, totalValue } from '../lib/finance.ts';
import { monthlyBudgetTotals } from '../lib/expense-plans.ts';
import { convertAmount } from '../lib/market.ts';

const entry=(kind,amount,extra={})=>({kind,amount,quantity:0,...extra});
test('shared wealth totals apply ownership and quantities, include lending and exclude cash flow',()=>{
 const entries=[entry('Cash',100.25),entry('Stock',2.5,{quantity:4}),entry('Crypto',0.00000012,{quantity:10}),entry('Business',1000,{ownership_percentage:25}),entry('Property',500),entry('Deposit',50),entry('Money lent',80),entry('Mortgage',600),entry('Loan',30),entry('Debt',10),entry('Salary',5000),entry('Living expense',100)];
 const totals=financialTotals(entries);
 assert.equal(totals.totalAssets,990.2500012);
 assert.equal(totals.totalDebt,640);
 assert.equal(totals.netWorth,totals.totalAssets-640);
 assert.equal(totals.receivable,80);
 assert.equal(totals.netLending,-560);
 assert.equal(totals.cash,100.25);
 assert.equal(totalValue(entries,['Stock']),10);
 assert.equal(totalValue([entry('Business',100,{ownership_percentage:0})]),0);
 assert.equal(financialTotals([]).netWorth,0);
 assert.equal(financialTotals([entry('Debt',10)]).netWorth,-10);
});
const plan=(amount,spent,extra={})=>({amount,spent,currency:'USD',start_date:'2026-01-01',end_date:null,...extra});
const convert=(amount,currency)=>convertAmount(amount,currency,'USD',{USD:1,EUR:2});
test('monthly budget aggregates converted plans, overspending, rollover and inactive spending',()=>{
 const plans=[plan(100.25,120.5),plan(200,20,{currency:'EUR',carryover:40}),plan(100,5,{end_date:'2026-08-31'}),plan(300,0,{start_date:'2026-10-01'})];
 const original=structuredClone(plans);
 const totals=monthlyBudgetTotals(plans,'2026-09',convert);
 assert.deepEqual(totals.partial,{planned:220.25,spent:135.5,remaining:84.75,projected:245.5});
 assert.equal(totals.remaining,84.75);
 assert.deepEqual(plans,original);
 assert.equal(monthlyBudgetTotals([plan(10,20)],'2026-09',convert).remaining,-10);
 assert.equal(monthlyBudgetTotals([],'2026-09',convert).remaining,0);
});
test('missing rates never masquerade as complete budgets; disclosed partial projection remains available',()=>{
 const totals=monthlyBudgetTotals([plan(10,2),plan(20,3,{currency:'GBP'})],'2026-09',convert);
 assert.equal(totals.remaining,null);
 assert.equal(totals.projected,null);
 assert.deepEqual(totals.missingCurrencies,['GBP']);
 assert.equal(totals.partial.projected,10);
});
