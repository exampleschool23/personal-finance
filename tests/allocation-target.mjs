import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {workspacePreferenceSchema}=loadTS('lib/workspace-preferences.ts');
const parse=data=>workspacePreferenceSchema.safeParse({key:'allocation',data});
test('allocation preserves a precise target and its currency, supports removal and legacy preferences',()=>{
 const data={weights:{Cash:40,Property:60},target_net_worth:{amount:1234567.891,currency:'EUR'}};
 assert.deepEqual(parse(data).data.data,data);
 assert.equal(parse({weights:{Cash:100}}).success,true);
 assert.equal(parse({...data,target_net_worth:null}).success,true);
});
test('allocation rejects invalid target amounts, currencies and weights',()=>{
 for(const amount of [-1,0,Infinity,NaN])assert.equal(parse({weights:{Cash:100},target_net_worth:{amount,currency:'USD'}}).success,false);
 assert.equal(parse({weights:{Cash:100},target_net_worth:{amount:100,currency:'XYZ'}}).success,false);
 assert.equal(parse({weights:{Cash:90},target_net_worth:{amount:100,currency:'USD'}}).success,false);
});
test('target dates round-trip, allow clearing and reject impossible calendar dates',()=>{
 const data={weights:{Cash:100},target_net_worth:{amount:1000000,currency:'USD',date:'2030-09-24'}};
 assert.deepEqual(parse(data).data.data,data);
 assert.equal(parse({...data,target_net_worth:{...data.target_net_worth,date:null}}).success,true);
 for(const date of ['2030-02-30','2030-13-01','24/09/2030',''])assert.equal(parse({...data,target_net_worth:{...data.target_net_worth,date}}).success,false);
});
