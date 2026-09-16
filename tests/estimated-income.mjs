import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedCashFlow,value} from '../lib/finance.ts';
import {marketEntry} from '../lib/market.ts';
test('forecast uses personal estimates without multiplying ownership or duplicating linked income',()=>{
 const business={id:'b',kind:'Business',amount:55000,ownership_percentage:40,estimated_monthly_income:1000};
 const result=estimatedCashFlow([business,{id:'p',kind:'Property',estimated_monthly_income:500},{kind:'Other income',business_id:'b',amount:900,frequency:'Monthly'},{kind:'Salary',amount:2000,frequency:'Monthly'},{kind:'Living expense',amount:600,frequency:'Monthly'}]);
 assert.equal(result.estimatedIncome,1500);assert.equal(result.forecast,2900);assert.equal(value(business),22000);
});
test('estimates convert with records and do not become asset value',()=>{
 const record={id:'p',name:'Rental',kind:'Property',amount:10000,cost:0,currency:'USD',estimated_monthly_income:500};
 const converted=marketEntry(record,'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(converted.estimated_monthly_income,6000000);assert.equal(value(converted),120000000);
 assert.deepEqual(estimatedCashFlow([]),{estimatedIncome:0,forecast:0});
});
