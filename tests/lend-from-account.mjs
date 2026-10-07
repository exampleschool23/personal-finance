import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { lendFromAccount, lendingAccounts } = loadTS('lib/record-balance.ts');
const { recordSchema } = loadTS('lib/record-schema.ts');
const wallet={id:'00000000-0000-4000-8000-000000000001',name:'UZS wallet',kind:'Cash',currency:'UZS',amount:1000000,quantity:1,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''};
const dollars={...wallet,id:'00000000-0000-4000-8000-000000000002',name:'USD card',currency:'USD',amount:5000};
const loan={id:'00000000-0000-4000-8000-000000000003',name:'Abror',kind:'Money lent',currency:'UZS',amount:600000,quantity:1,cost:0,rate:0,date:'',lent_date:'2026-10-07',frequency:'Once',notes:'',lent_from:wallet.id};

test('money lent is paid only from a cash account in its own currency',()=>{
 assert.deepEqual(lendingAccounts([wallet,dollars,loan],'UZS').map(row=>row.id),[wallet.id]);
});

test('new money lent leaves its cash account, and the saved loan does not keep the account',()=>{
 const result=lendFromAccount([wallet,dollars],loan);
 assert.deepEqual(result.rows.map(row=>row.amount),[400000,5000]);
 assert.equal('lent_from' in result.loan,false);
 assert.equal(result.loan.amount,600000);
 assert.deepEqual(lendFromAccount([wallet],{...loan,lent_from:null}).rows,[wallet]);
});

test('money lent beyond the balance or from another currency is refused',()=>{
 assert.throws(()=>lendFromAccount([{...wallet,amount:500000}],loan),/Not enough money/);
 assert.throws(()=>lendFromAccount([dollars],{...loan,lent_from:dollars.id}),/record currency/);
 assert.throws(()=>lendFromAccount([wallet],{...loan,amount:0}),/Not enough money/);
});

test('only a new money lent record may name the account it was paid from',()=>{
 assert.equal(recordSchema.safeParse(loan).success,true);
 assert.equal(recordSchema.safeParse({...loan,revision:3}).success,false);
 assert.equal(recordSchema.safeParse({...loan,kind:'Loan',date:'2026-12-01'}).success,false);
});
