import { apiFunction } from './helpers/api-function.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { value, kinds, income, expenses, assetRecordKinds } from '../lib/finance.ts';
import { isCurrency } from '../lib/currencies.ts';
import { z } from 'zod';
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const sort = apiFunction('value', compile('lib/asset-sort.ts') + ';return sortAssetsByWorth;')(value);
test('sorts total worth before pagination, including quantity, ownership and converted values', () => {
 const rows = Array.from({length: 11}, (_, i) => ({id: String(i), kind: 'Cash', amount: i, currency: 'USD'}));
 rows.push({id:'stock',kind:'Stock',amount:2,quantity:100,currency:'USD'}, {id:'business',kind:'Business',amount:1000,ownership_percentage:10,currency:'USD'}, {id:'fx',kind:'Cash',amount:100000,currency:'UZS'}, {id:'unknown',kind:'Cash',amount:999999,currency:'EUR'});
 const original = structuredClone(rows);
 const sorted = sort(rows, r => r.currency === 'EUR' ? null : {...r, amount:r.currency === 'UZS' ? r.amount / 10000 : r.amount});
 assert.deepEqual(sorted.slice(0,2).map(r=>r.id), ['stock','business']);
 assert.equal(sorted.at(-1).id,'unknown');
 assert.equal(sorted.slice(0,10).length,10);
 assert.deepEqual(rows,original);
 assert.deepEqual(sort([{id:'b',amount:0},{id:'a',amount:0}]).map(r=>r.id),['a','b']);
});
test('asset API supplies all holdings across database batches with owner authentication', async () => {
 const calls=[];
 const batch=Array.from({length:500},(_,i)=>({id:String(i)}));
 const supa=async(path, init, token)=>{
  calls.push({path,token});
  if(path.includes('/rpc/')) return Response.json({records:[],total:501,page:1});
  return Response.json(new URL('https://db'+path).searchParams.get('offset') === '0' ? batch : [{id:'last',kind:'Crypto',currency:'EUR',name:'Bitcoin (BTC)',amount:50000,quantity:1,holding_account_id:'exchange'},{id:'stock',kind:'Stock',currency:'UZS',name:'AAPL',amount:100,quantity:2,holding_account_id:'broker'}]);
 };
 const api=apiFunction('z','isCurrency','kinds','income','expenses','assetRecordKinds','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return GET;')(z,isCurrency,kinds,income,expenses,assetRecordKinds,async()=>({token:'owner',user:{id:'owner'}}),supa,()=>true,async()=>[]);
 const response=await api(new Request('https://local/api/records?section=assets&currency=USD'));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.records.length,502);
 assert.equal(data.total,502);
 assert.equal(calls.length,3);
 assert.deepEqual(data.records.slice(-2).map(row=>[row.kind,row.currency,row.holding_account_id]),[['Crypto','EUR','exchange'],['Stock','UZS','broker']]);
 for(const call of calls.slice(1)){
  const params=new URL('https://db'+call.path).searchParams;
  assert.equal(call.token,'owner');
  assert.equal(params.get('currency'),null);
  assert.equal(params.get('kind'),`in.(${assetRecordKinds.join(',')})`);
 }
});
