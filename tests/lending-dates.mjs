import { isCurrency } from '../lib/currencies.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { kinds, income, expenses } from '../lib/finance.ts';
const source=fs.readFileSync(new URL('../app/api/records/route.ts',import.meta.url),'utf8');
const validation=source.slice(source.indexOf('const validDate='),source.indexOf('async function handle'));
const js=ts.transpileModule(validation+'\nreturn schema;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const schema=new Function('z','kinds','isCurrency','income','expenses',js)(z,kinds,isCurrency,income,expenses);
const record={id:'c2067d73-5366-4bda-b92c-9f23868af98a',name:'Borrower',kind:'Money lent',currency:'USD',amount:100,quantity:1,cost:0,rate:0,date:'',lent_date:'2026-09-01',frequency:'Once',notes:''};
test('lending date required and due date optional',()=>{
 assert.equal(schema.safeParse(record).success,true);
 assert.equal(schema.safeParse({...record,lent_date:''}).success,false);
 assert.equal(schema.safeParse({...record,date:'2026-10-01'}).success,true);
});
test('rejects impossible and reversed dates; other records still require dates',()=>{
 assert.equal(schema.safeParse({...record,lent_date:'2026-02-30'}).success,false);
 assert.equal(schema.safeParse({...record,date:'2026-08-01'}).success,false);
 assert.equal(schema.safeParse({...record,kind:'Cash'}).success,false);
 assert.equal(schema.safeParse({...record,kind:'Cash',date:'2026-09-01'}).success,true);
});

test('business assets and optional cashflow links validate separately',()=>{
 const business={...record,kind:'Business',date:'2026-09-01',business_id:null};
 assert.equal(schema.safeParse(business).success,true);
 assert.equal(schema.safeParse({...record,kind:'Other income',date:'2026-09-01',business_id:record.id}).success,true);
 assert.equal(schema.safeParse({...record,kind:'Charity',date:'2026-09-01',business_id:record.id}).success,true);
 assert.equal(schema.safeParse({...business,business_id:record.id}).success,false);
 assert.equal(schema.safeParse({...business,kind:'Other expense',business_id:'invalid'}).success,false);
});

test('ownership is constrained to 0–100 and defaults to full ownership',()=>{
 const business={...record,kind:'Business',date:'2026-09-01'};
 assert.equal(schema.parse(business).ownership_percentage,100);
 for(const percentage of [-1,100.1,Infinity]) assert.equal(schema.safeParse({...business,ownership_percentage:percentage}).success,false);
 for(const percentage of [0,40,100]) assert.equal(schema.safeParse({...business,ownership_percentage:percentage}).success,true);
});
