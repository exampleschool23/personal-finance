import test from 'node:test';
import assert from 'node:assert/strict';
import { financialTotals, totalValue } from '../lib/finance.ts';
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
