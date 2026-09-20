import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentPeriodTotals}=loadTS('lib/investment-period.ts');
const event=(id,type,amount,date='2026-09-19')=>({id,record_id:'sheep',event_type:type,amount,occurred_on:date,created_at:date,balance:null,ownership_percentage:100});
const input={records:[{id:'sheep',kind:'Business',currency:'USD'},{id:'debt',kind:'Mortgage',currency:'USD'}],events:[event('old','income',900,'2026-08-01'),event('add','contribution',84),event('income','income',150),event('cost','expense',20),event('snapshot','baseline',9000),{...event('mortgage','mortgage_payment',100),record_id:'debt',principal:80}],today:'2026-09-20',currency:'USD',market:{rates:{}}};
test('period counts actual receipts, investment payments and costs separately from principal',()=>{
 assert.deepEqual(investmentPeriodTotals(input,'2026-09-19'),{income:150,invested:164,expenses:40,missing:[]});
 assert.equal(investmentPeriodTotals(input,'2026-09-20').income,0);
 assert.equal(investmentPeriodTotals(input,'2026-01-01').income,1050);
});
test('missing rates are disclosed and future events excluded',()=>{
 const result=investmentPeriodTotals({...input,currency:'EUR'},'2026-09-19');
 assert.deepEqual(result.missing,['USD']);
 assert.equal(investmentPeriodTotals({...input,events:[event('future','income',99,'2027-01-01')]},'2026-09-19').income,0);
});

test('includes overall actual income and expenses without counting linked tracker rows twice',()=>{
 const row=(id,kind,amount,extra={})=>({id,kind,amount,currency:'USD',date:'2026-09-19',frequency:'Once',...extra});
 const totals=investmentPeriodTotals({...input,cashflows:[row('salary','Salary',1500),row('food','Living expense',50),row('copy','Business income',150,{history_event_id:'income'}),row('mortgage-copy','Other expense',100,{mortgage_payment_id:'mortgage',payment_principal:80,payment_interest:20}),row('plan','Salary',9000,{frequency:'Monthly'})]},'2026-09-19');
 assert.deepEqual(totals,{income:1650,invested:164,expenses:90,missing:[]});
});
