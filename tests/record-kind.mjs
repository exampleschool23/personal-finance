import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {changeRecordKind}=loadTS('lib/record-kind.ts');
const {cashFlowAmountMissing}=loadTS('lib/cash-account-required.ts');
const entry=(patch={})=>({id:'1',name:'Car loan',kind:'Loan',currency:'USD',amount:12500.75,quantity:1,cost:0,rate:9.5,date:'2027-01-31',lent_date:'',opened_on:'2026-01-31',frequency:'Once',notes:'',ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0,...patch});
test('changing between balance categories keeps the entered amount and its precision',()=>{
 const debt=changeRecordKind(entry(),'Debt','2026-09-29');
 assert.equal(debt.kind,'Debt');assert.equal(debt.amount,12500.75);assert.equal(debt.rate,9.5);assert.equal(debt.opened_on,'2026-01-31');
 assert.equal(changeRecordKind(entry({kind:'Property',amount:150000}),'Valuables','2026-09-29').amount,150000);
});
test('a unit price is never reused as a balance, or a balance as a unit price',()=>{
 assert.equal(changeRecordKind(entry({kind:'Cash',amount:900}),'Stock','2026-09-29').amount,0);
 const cash=changeRecordKind(entry({kind:'Crypto',name:'BTC',amount:84000,quantity:.5,cost:60000}),'Cash','2026-09-29');
 assert.deepEqual([cash.amount,cash.quantity,cash.cost],[0,1,0]);
});
test('fields hidden by the new category are reset instead of being saved unseen',()=>{
 const property=changeRecordKind(entry({kind:'Business',ownership_percentage:40,estimated_monthly_income:700,rate:3}),'Property','2026-09-29');
 assert.deepEqual([property.ownership_percentage,property.estimated_monthly_income,property.rate],[100,700,0]);
 const cash=changeRecordKind(entry({kind:'Mortgage',estimated_monthly_payment:450,rate:12}),'Cash','2026-09-29');
 assert.deepEqual([cash.estimated_monthly_payment,cash.rate,cash.is_investment??false],[0,0,false]);
 assert.equal(changeRecordKind(entry({kind:'Cash',is_investment:true,holding_account_id:'a'}),'Deposit','2026-09-29').is_investment,false);
 assert.equal(changeRecordKind(entry({kind:'Cash',holding_account_id:'a'}),'Deposit','2026-09-29').holding_account_id,null);
});
test('money lent has no due date by default and other categories always have a date',()=>{
 assert.equal(changeRecordKind(entry(),'Money lent','2026-09-29').date,'');
 assert.equal(changeRecordKind(entry({kind:'Money lent',date:'',lent_date:''}),'Loan','2026-09-29').date,'2026-09-29');
 assert.equal(changeRecordKind(entry(),'Property','2026-09-29').opened_on,null);
});
test('selecting the same category changes nothing',()=>{const original=entry();assert.equal(changeRecordKind(original,'Loan','2026-09-29'),original);});
test('income and expenses need a positive amount; balances may be zero',()=>{
 for(const kind of ['Salary','Other income','Living expense','Charity'])for(const amount of [0,-1,NaN])assert.equal(cashFlowAmountMissing({kind,amount}),true,kind+amount);
 assert.equal(cashFlowAmountMissing({kind:'Living expense',amount:.01}),false);
 for(const kind of ['Cash','Business','Mortgage','Money lent'])assert.equal(cashFlowAmountMissing({kind,amount:0}),false,kind);
});
