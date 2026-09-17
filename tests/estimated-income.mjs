import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedCashFlow,value} from '../lib/finance.ts';
import {marketEntry} from '../lib/market.ts';
test('forecast uses personal estimates without multiplying ownership or duplicating linked income',()=>{
 const business={id:'b',kind:'Business',amount:55000,ownership_percentage:40,estimated_monthly_income:1000};
 const result=estimatedCashFlow([business,{id:'p',kind:'Property',estimated_monthly_income:500},{kind:'Other income',business_id:'b',amount:900,frequency:'Monthly'},{kind:'Salary',amount:2000,frequency:'Monthly'},{kind:'Living expense',amount:600,frequency:'Monthly'}]);
 assert.equal(result.estimatedAssets.length,2);assert.equal(result.plannedIncome,3500);assert.equal(result.otherIncome,2000);assert.equal(result.monthlyExpenses,600);assert.equal(result.estimatedIncome,1500);assert.equal(result.forecast,2900);assert.equal(value(business),22000);
});
test('estimates convert with records and do not become asset value',()=>{
 const record={id:'p',name:'Rental',kind:'Property',amount:10000,cost:0,currency:'USD',estimated_monthly_income:500};
 const converted=marketEntry(record,'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(converted.estimated_monthly_income,6000000);assert.equal(value(converted),120000000);
 assert.deepEqual(estimatedCashFlow([]),{estimatedAssets:[],otherIncome:0,plannedIncome:0,monthlyExpenses:0,mortgagePayments:0,estimatedIncome:0,forecast:0});
});

test('mortgage estimates reduce forecasts once, ignore paid-off debt and actual one-time payments',()=>{
 const mortgage={kind:'Mortgage',amount:90000,estimated_monthly_payment:1570,currency:'USD',cost:0};
 const salary={kind:'Salary',amount:3000,frequency:'Monthly'};
 assert.equal(estimatedCashFlow([mortgage,salary,{kind:'Other expense',amount:1570,frequency:'Once',mortgage_payment_id:'p'}]).forecast,1430);
 assert.equal(estimatedCashFlow([{...mortgage,amount:0},salary]).forecast,3000);
 const converted=marketEntry(mortgage,'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(converted.estimated_monthly_payment,18840000);
});

test('salary from an owned business is added independently of the business income estimate',()=>{
 const business={id:'cafe',kind:'Business',estimated_monthly_income:1000};
 const salary={id:'salary',kind:'Salary',business_id:'cafe',amount:2500,frequency:'Monthly',date:'2026-09-01'};
 const distribution={kind:'Other income',business_id:'cafe',amount:1000,frequency:'Monthly',date:'2026-09-01'};
 const result=estimatedCashFlow([business,salary,distribution],0,'2026-09');
 assert.equal(result.otherIncome,2500);assert.equal(result.plannedIncome,3500);assert.equal(result.forecast,3500);
 assert.equal(estimatedCashFlow([business,{...salary,frequency:'Yearly',amount:30000}],0,'2026-09').plannedIncome,3500);
 assert.equal(estimatedCashFlow([business,{...salary,frequency:'Once'}],0,'2026-09').plannedIncome,1000);
 assert.equal(estimatedCashFlow([business,{...salary,date:'2026-10-01'}],0,'2026-09').plannedIncome,1000);
 assert.equal(estimatedCashFlow([business,{...salary,date:'2026-01-01',end_date:'2026-08-31'}],0,'2026-09').plannedIncome,1000);
});

test('foreign-currency salary is converted before adding it to the monthly forecast',()=>{
 const salary=marketEntry({kind:'Salary',currency:'UZS',amount:12000000,cost:0,frequency:'Monthly',date:'2026-09-01',business_id:'b'},'USD',{fx:{rate:12000},quotes:{}});
 assert.equal(estimatedCashFlow([{id:'b',kind:'Business',estimated_monthly_income:500},salary],0,'2026-09').plannedIncome,1500);
});
