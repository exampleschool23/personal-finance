import {loadTS as loadCashAccountTS} from './helpers/load-ts.mjs';
const {requiresCashAccount}=loadCashAccountTS('lib/cash-account-required.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { value } from '../lib/finance.ts';
import { marketEntry } from '../lib/market.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {holdingAccountValue}=new Function('value','marketEntry',compile('lib/holding-accounts.ts')+';return {holdingAccountValue};')(value,marketEntry);
const record=(id,account,kind,amount,quantity,currency='USD')=>({id,holding_account_id:account,name:kind==='Stock'?'AAPL':'Bitcoin',kind,amount,quantity,cost:0,rate:0,currency,date:'2026-09-17',frequency:'Once',notes:''});

test('account containers sum only their holdings with quantities, quotes, and complete FX',()=>{
 const account={id:'broker',name:'Broker',kind:'Stock',currency:'USD'};
 const records=[record('a','broker','Stock',50,4),record('b','broker','Stock',20,3),record('c','other','Stock',100,1),record('d',null,'Cash',900,1)];
 const result=holdingAccountValue(account,records,null);
 assert.equal(result.total,260);assert.equal(result.holdings.length,2);
 assert.equal(records.reduce((sum,row)=>sum+value(row),0),1260);
 assert.equal(holdingAccountValue({...account,id:'empty'},records,null).total,0);
 const withCash=[...records,record('cash','broker','Cash',500,1)];
 assert.equal(holdingAccountValue(account,withCash,null).total,760);
 assert.equal(withCash.reduce((sum,row)=>sum+value(row),0),1760);
 assert.equal(holdingAccountValue({...account,currency:'EUR'},records,null).total,null);
 assert.equal(holdingAccountValue({...account,currency:'EUR'},records,{rates:{EUR:.9},quotes:{},fx:null}).total,234);
 assert.equal(holdingAccountValue(account,records,{quotes:{'Stock:AAPL':{usd:60}},fx:null}).total,420);
 assert.equal(holdingAccountValue({id:'wallet',name:'Wallet',kind:'Crypto',currency:'USD'},[record('btc','wallet','Crypto',60000,.08)],null).total,4800);
});

test('account API validates input, applies authenticated ownership and reports missing assignments',async()=>{
 const id='30000000-0000-4000-8000-000000000001',owner='30000000-0000-4000-8000-000000000002';
 let signedIn=true,rows=[{id}],calls=[];
 const post=new Function('z','isCurrency','session','sameOrigin','supa',compile('app/api/holding-accounts/route.ts')+';return POST;')(z,c=>['USD','EUR'].includes(c),async()=>signedIn?{user:{id:owner},token:'owner-token'}:null,r=>r.headers.get('origin')==='https://local',async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json(rows);});
 const request=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
 const draft={action:'save',id,name:'Brokerage',kind:'Stock',currency:'USD',user_id:id};
 assert.equal((await post(request(draft,'https://other'))).status,403);
 signedIn=false;assert.equal((await post(request(draft))).status,401);signedIn=true;
 for(const bad of [{...draft,kind:'Deposit'},{...draft,currency:'XXX'},{...draft,name:' '},{action:'assign',record_id:'bad',holding_account_id:null}])assert.equal((await post(request(bad))).status,400);
 assert.equal(calls.length,0);
 assert.equal((await post(request(draft))).status,200);assert.equal(calls[0].body.user_id,owner);assert.equal(calls[0].token,'owner-token');assert.equal(calls[0].body.action,undefined);
 assert.equal((await post(request({action:'assign',record_id:id,holding_account_id:null,amount:999}))).status,200);
 assert.deepEqual(calls[1].body,{holding_account_id:null});assert.match(calls[1].path,/kind=in\.\(Cash,Stock,Crypto\)/);
 rows=[];assert.equal((await post(request({action:'assign',record_id:id,holding_account_id:null}))).status,404);
});

test('holding accounts enforce ownership and type while preserving balances and backups',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  // Exercise the incremental upgrade with pre-existing records.
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Stock and crypto accounts with multiple holdings.')[0]);
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,date,frequency) VALUES('${id(10)}','${owner}','AAPL','Stock','USD',50,4,'2026-09-17','Once'),('${id(11)}','${owner}','Cash','Cash','USD',1000,1,'2026-09-17','Once');`);
  await db.exec(fs.readFileSync('migrations/024_holding_accounts.sql','utf8'));
  await db.exec(`INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES('${id(20)}','${owner}','Broker','Stock','USD'),('${id(21)}','${owner}','Wallet','Crypto','EUR'),('${id(22)}','${other}','Private','Stock','USD');SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT holding_account_id FROM finance_records WHERE id=$1',[id(10)])).rows[0].holding_account_id,null);
  const assign=account=>db.query('UPDATE finance_records SET holding_account_id=$1 WHERE id=$2',[account,id(10)]);
  await assert.rejects(assign(id(21)),/matching/);await assert.rejects(assign(id(22)),/matching/);
  await assign(id(20));await assign(id(20));
  await assert.rejects(db.query('UPDATE finance_records SET holding_account_id=$1 WHERE id=$2',[id(20),id(11)]),/matching/);
  await assert.rejects(db.query("UPDATE holding_accounts SET kind='Crypto' WHERE id=$1",[id(20)]),/Move the holdings/);
  await db.query("UPDATE holding_accounts SET name='Renamed',currency='EUR' WHERE id=$1",[id(20)]);
  const records=(await db.query('SELECT * FROM finance_records ORDER BY id')).rows;
  assert.equal(Number(records[0].amount)*Number(records[0].quantity),200);assert.equal(Number(records[1].amount),1000);
  assert.equal((await db.query('SELECT * FROM investment_history')).rows.length,2);
  const backup=(await db.query('SELECT export_finance_backup() AS data')).rows[0].data;
  assert.equal(backup.tables.holding_accounts.length,2);assert.equal(backup.tables.finance_records.length,2);
  assert.ok(backup.tables.holding_accounts.every(account=>account.user_id===owner));
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('SELECT * FROM holding_accounts')).rows.length,1);
  assert.equal((await db.query('UPDATE holding_accounts SET name=$1 WHERE id=$2 RETURNING id',['Forbidden',id(20)])).rows.length,0);
  await assert.rejects(db.query('INSERT INTO holding_accounts(user_id,name,kind,currency) VALUES($1,$2,$3,$4)',[owner,'Fake','Stock','USD']),/row-level/);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);await assign(null);
  await db.query("UPDATE holding_accounts SET kind='Crypto' WHERE id=$1",[id(20)]);
 }finally{await db.close();}
});

test('record saves preserve holding membership and accept cash balances',async()=>{
 const {kinds,income,expenses}=await import('../lib/finance.ts');
 const owner='50000000-0000-4000-8000-000000000001',accountId='50000000-0000-4000-8000-000000000002';
 let saved;
 const post=new Function('requiresCashAccount','z','kinds','income','expenses','isCurrency','session','supa','sameOrigin','depositForecasts',compile('app/api/records/route.ts')+';return POST;').bind(null,requiresCashAccount)(z,kinds,income,expenses,c=>c==='USD',async()=>({user:{id:owner},token:'owner-token'}),async(path,init,token)=>{assert.equal(token,'owner-token');saved=JSON.parse(init.body);return Response.json([saved]);},()=>true,async()=>[]);
 const holding={...record('50000000-0000-4000-8000-000000000003',accountId,'Stock',13.45,2.5),notes:''};
 const request=body=>new Request('https://local/api/records',{method:'POST',body:JSON.stringify(body)});
 assert.equal((await post(request(holding))).status,200);assert.equal(saved.holding_account_id,accountId);assert.equal(saved.user_id,owner);assert.equal(saved.amount,13.45);assert.equal(saved.quantity,2.5);
 assert.equal((await post(request({...holding,kind:'Cash'}))).status,200);
});

test('cash investment accounts combine currency balances once and exclude instruments',()=>{
 const account={id:'reserve',name:'Reserve',kind:'Cash',currency:'USD'};
 const rows=[record('usd','reserve','Cash',100,1),record('uzs','reserve','Cash',1200000,1,'UZS'),record('stock','reserve','Stock',999,1),record('other','other','Cash',500,1)];
 const result=holdingAccountValue(account,rows,{rates:{UZS:12000},quotes:{},fx:null});
 assert.equal(result.total,200);assert.equal(result.holdings.length,2);
 assert.equal(holdingAccountValue(account,rows,null).total,null);
});
