import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {applyRecordChange}=loadTS('lib/record-balance.ts');
const cash={id:'cash',kind:'Cash',amount:1000,currency:'USD'};
const expense={id:'expense',kind:'Other expense',amount:250.125,account_id:'cash',frequency:'Once',account_exchange_rate:2,currency:'EUR'};
test('create, edit, delete and restore apply exactly one precise cash effect',()=>{
 const start=[cash];const saved=applyRecordChange(start,undefined,expense);
 assert.equal(saved.find(row=>row.id==='cash').amount,874.9375);assert.equal(cash.amount,1000);
 const edited={...expense,amount:300.125};const changed=applyRecordChange(saved,expense,edited);
 assert.equal(changed.find(row=>row.id==='cash').amount,849.9375);
 const removed=applyRecordChange(changed,edited);assert.equal(removed[0].amount,1000);
 assert.deepEqual(applyRecordChange(removed,undefined,edited),changed);
});
test('failed reversals and invalid linked accounts leave input untouched',()=>{
 const income={...expense,kind:'Other income',amount:3000};
 assert.throws(()=>applyRecordChange([cash,income],income),/Not enough/);
 assert.throws(()=>applyRecordChange([],undefined,expense),/cash account/);
 assert.throws(()=>applyRecordChange([cash],undefined,{...expense,account_exchange_rate:0}),/exchange rate/);
 assert.throws(()=>applyRecordChange([cash,expense],cash),/linked records/);
 assert.throws(()=>applyRecordChange([cash],undefined,{...expense,account_exchange_rate:undefined}),/exchange rate/);
 assert.equal(cash.amount,1000);
});
