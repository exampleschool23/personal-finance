import test from 'node:test';
import assert from 'node:assert/strict';
import {expensePlanTotals,expensePlanMonth} from '../lib/expense-plans.ts';
import {estimatedCashFlow} from '../lib/finance.ts';
import {convertAmount} from '../lib/market.ts';
const plan={id:'p',amount:500,start_date:'2026-09-17',end_date:null,spent:100,currency:'USD'};
test('monthly plans reserve a full month and include payments once',()=>{
 const totals=expensePlanTotals(plan,'2026-09');assert.deepEqual(totals,{active:true,planned:500,spent:100,remaining:400,projected:500});
 const forecast=estimatedCashFlow([{kind:'Salary',amount:2000,frequency:'Monthly'},{kind:'Other expense',amount:100,frequency:'Once',expense_plan_id:'p'}],totals.projected);
 assert.equal(forecast.monthlyExpenses,500);assert.equal(forecast.forecast,1500);
 const over=expensePlanTotals({...plan,spent:650},'2026-09');assert.equal(over.remaining,-150);assert.equal(over.projected,650);
});
test('start/end months are inclusive, future and ended plans do not reserve funds',()=>{
 assert.equal(expensePlanTotals({...plan,spent:0},'2026-08').projected,0);
 assert.equal(expensePlanTotals({...plan,end_date:'2026-09-20'},'2026-09').planned,500);
 assert.equal(expensePlanTotals({...plan,end_date:'2026-09-20',spent:0},'2026-10').projected,0);
 assert.equal(expensePlanTotals({...plan,spent:0},'2026-10').remaining,500);
 assert.equal(expensePlanMonth(new Date('2026-09-30T20:00:00Z')),'2026-10');
});
test('multiple plans and legacy recurring expenses add without double counting',()=>{
 const totals=[plan,{...plan,id:'mum',amount:200,spent:210}].map(p=>expensePlanTotals(p,'2026-09'));
 const entries=[{kind:'Living expense',amount:1200,frequency:'Yearly'},{kind:'Other expense',amount:100,frequency:'Once',expense_plan_id:'p'}];
 assert.equal(estimatedCashFlow(entries,totals.reduce((n,p)=>n+p.projected,0)).monthlyExpenses,810);
 assert.equal(convertAmount(totals[0].projected,'USD','UZS',12000),6000000);
 assert.equal(convertAmount(500,'EUR','USD'),null);
});

test('selecting October adds future plans to mortgage estimates and uses that month spending',()=>{
 const future={...plan,start_date:'2026-10-19',spent:0};
 const mortgage={kind:'Mortgage',amount:90000,estimated_monthly_payment:1600};
 const september=estimatedCashFlow([mortgage],expensePlanTotals(future,'2026-09').projected);
 const october=estimatedCashFlow([mortgage],expensePlanTotals(future,'2026-10').projected);
 assert.equal(september.monthlyExpenses+september.mortgagePayments,1600);
 assert.equal(october.monthlyExpenses+october.mortgagePayments,2100);
 const overspent=estimatedCashFlow([mortgage],expensePlanTotals({...future,spent:650},'2026-10').projected);
 assert.equal(overspent.monthlyExpenses+overspent.mortgagePayments,2250);
});
