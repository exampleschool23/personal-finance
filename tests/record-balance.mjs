import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {applyRecordChange,withSavedRecord}=loadTS('lib/record-balance.ts');
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
test('a saved edit shows at once in place, with its cash account moved, before the reload returns',()=>{
 const other={id:'other',kind:'Other expense',amount:5,frequency:'Once',currency:'USD'};
 const stored=applyRecordChange([cash,other],undefined,expense);
 const order=stored.map(row=>row.id);
 const edited=withSavedRecord(stored,{...expense,amount:300.125,notes:'edited'});
 assert.deepEqual(edited.map(row=>row.id),order);
 assert.equal(edited.find(row=>row.id==='expense').amount,300.125);
 assert.equal(edited.find(row=>row.id==='cash').amount,849.9375);
 // Fields the form does not send stay as stored.
 const tagged=withSavedRecord([{...expense,revision:3}],{...expense,amount:1});
 assert.equal(tagged[0].revision,3);assert.equal(tagged[0].amount,1);
 // A new record comes first; the input is never changed.
 assert.equal(withSavedRecord([cash],expense)[0].id,'expense');assert.equal(cash.amount,1000);
});
test('a saved record whose account is not in the list still shows its new values',()=>{
 const page=[expense,{id:'x',kind:'Other income',amount:1,frequency:'Once',currency:'USD'}];
 const edited=withSavedRecord(page,{...expense,amount:10});
 assert.deepEqual(edited.map(row=>[row.id,row.amount]),[['expense',10],['x',1]]);
 assert.equal(withSavedRecord([],expense)[0].id,'expense');
});
