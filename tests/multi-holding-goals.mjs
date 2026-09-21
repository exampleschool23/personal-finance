import { apiFunction } from './helpers/api-function.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { instrumentFor } from '../lib/market.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id=n=>`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),wallet=id(2),goalId=id(3);
const btc={holding_account_id:wallet,asset_kind:'Crypto',asset_symbol:'BTC',target:4,monthly_contribution:null};
const ton={...btc,asset_symbol:'TON',target:30000};
const goal={...btc,id:goalId,name:'Crypto Millionaire',kind:'investment',account_id:null,allocated:0,target_date:'2030-12-01',annual_return:0};
function api(supa){return apiFunction('instrumentFor','z','session','supa','sameOrigin','readOwnerRows','isCurrency','depositForecasts',compile('app/api/planning/route.ts')+';return POST;')(instrumentFor,z,async()=>({token:'owner'}),supa,()=>true,async()=>[],()=>true,async()=>[]);}
const request=data=>new Request('https://local/api/planning',{method:'POST',body:JSON.stringify({action:'goal',data})});

test('a missing multi-holding migration blocks the write instead of silently losing TON',async()=>{
 const calls=[];
 const post=api(async(path,init,token)=>{calls.push(path);assert.equal(token,'owner');return Response.json({code:'42703'},{status:400});});
 const result=await post(request({...goal,investment_targets:[btc,ton]}));
 assert.equal(result.status,503);
 assert.match((await result.json()).error,/database is updated/);
 assert.deepEqual(calls,['/rest/v1/savings_goals?select=investment_targets&limit=0']);
});

test('the API preserves BTC and 30,000 TON and rejects invalid or duplicate second holdings',async()=>{
 const writes=[];
 const post=api(async(path,init)=>{if(init.method==='POST')writes.push(JSON.parse(init.body).p_data);return Response.json({ok:true});});
 assert.equal((await post(request({...goal,investment_targets:[btc,ton]}))).status,200);
 assert.deepEqual(writes[0].investment_targets,[btc,ton]);
 for(const second of [btc,{...ton,target:0},{...ton,target:1e13},{...ton,asset_symbol:'UNKNOWN'}])assert.equal((await post(request({...goal,investment_targets:[btc,second]}))).status,400);
 assert.equal(writes.length,1);
});

test('migration preserves the existing goal and round-trips BTC plus 30,000 TON through the real save function',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${id(4)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Multi-holding accumulation goals.')[0].split('-- Multiple independently measured holdings in one accumulation goal.')[0]);
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES('${wallet}','${owner}','Crypto Account','Crypto','USD');`);
  const save=data=>db.query("SELECT planning_action('goal',$1)",[data]);
  await save(goal);
  // Reproduce the reported loss on the older schema: it reports success but keeps BTC only.
  await save({...goal,investment_targets:[btc,ton]});
  assert.equal((await db.query('SELECT asset_symbol FROM savings_goals')).rows[0].asset_symbol,'BTC');
  await db.exec(fs.readFileSync('migrations/027_multi_holding_goals.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  const read=async()=>(await db.query('SELECT * FROM savings_goals WHERE id=$1',[goalId])).rows[0];
  assert.deepEqual((await read()).investment_targets,[btc]);
  await save({...goal,investment_targets:[btc,ton]});
  assert.deepEqual((await read()).investment_targets,[btc,ton]);
  await save({...goal,investment_targets:[btc,{...ton,target:35000}]});
  assert.equal((await read()).investment_targets[1].target,35000);
  await assert.rejects(save(goal),/Reload this goal/);
  await assert.rejects(save({...goal,investment_targets:[btc,btc]}),/already included/);
  await assert.rejects(save({...goal,investment_targets:[btc,{...ton,holding_account_id:id(5)}]}),/matching stock or crypto/);
  assert.equal((await read()).investment_targets[1].target,35000);
  await save({...goal,investment_targets:[btc,ton]});
  const backup=(await db.query('SELECT export_finance_backup() AS result')).rows[0].result;
  assert.deepEqual(backup.tables.savings_goals[0].investment_targets,[btc,ton]);
  await db.exec(`SET request.jwt.claim.sub='${id(4)}'`);
  assert.equal((await db.query('SELECT * FROM savings_goals')).rows.length,0);
 }finally{await db.close();}
});
