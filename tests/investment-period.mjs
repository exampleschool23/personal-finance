import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentPeriodTotals}=loadTS('lib/investment-period.ts');
const event=(id,type,amount,date='2026-09-19')=>({id,record_id:'sheep',event_type:type,amount,occurred_on:date,created_at:date,balance:null,ownership_percentage:100});
const input={records:[{id:'sheep',kind:'Business',currency:'USD'},{id:'debt',kind:'Mortgage',currency:'USD'}],events:[event('old','income',900,'2026-08-01'),event('add','contribution',84),event('income','income',150),event('cost','expense',20),event('snapshot','baseline',9000),{...event('mortgage','mortgage_payment',100),record_id:'debt',principal:80}],today:'2026-09-20',currency:'USD',market:{rates:{}}};
test('period classifies full mortgage payments and business contributions as invested',()=>{
 assert.deepEqual(investmentPeriodTotals(input,'2026-09-19'),{income:150,invested:184,expenses:20,missing:[]});
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
 assert.deepEqual(totals,{income:1650,invested:184,expenses:70,missing:[]});
});

test('business investments have an invested breakdown that reconciles',()=>{
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals(input,'2026-09-19',details);
 assert.equal(details.invested.find(row=>row.category==='Business investment').amount,84);
 for(const key of Object.keys(details))assert.equal(details[key].reduce((sum,row)=>sum+row.amount,0),totals[key]);
});

test('mortgage cashflow fallback includes interest exactly once and preserves precision',()=>{
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals({...input,events:[],cashflows:[{id:'payment',mortgage_payment_id:'payment',kind:'Other expense',amount:100.25,payment_principal:80,payment_interest:20.25,currency:'USD',date:'2026-09-19',frequency:'Once'}]},'2026-09-19',details);
 assert.equal(totals.invested,100.25);assert.equal(totals.expenses,0);
 assert.equal(details.invested[0].category,'Mortgage');
});
