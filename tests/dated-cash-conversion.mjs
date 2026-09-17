import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {parseDatedExchangeRate,loadDatedExchangeRate} from '../lib/dated-exchange-rate.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows=[{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'01.01.2020'},{Ccy:'EUR',Rate:'1300000',Nominal:'100',Date:'01.01.2020'},{Ccy:'USD',Rate:'99999',Nominal:'1',Date:'03.01.2020'}];
test('dated rates use effective archive dates, nominal units, and fail closed for missing or invalid currencies',()=>{
 assert.deepEqual(parseDatedExchangeRate(rows,'USD','UZS','2020-01-02'),{from:'USD',to:'UZS',date:'2020-01-02',effective_date:'2020-01-01',rate:12000,source:'CBU'});
 assert.equal(parseDatedExchangeRate(rows,'EUR','UZS','2020-01-02').rate,13000);
 assert.equal(parseDatedExchangeRate(rows,'UZS','USD','2020-01-02').rate,1/12000);
 assert.equal(parseDatedExchangeRate(rows,'USD','EUR','2020-01-02').rate,12000/13000);
 for(const bad of [[],[{...rows[0],Nominal:0}],[{...rows[0],Rate:-1}],[rows[2]],[{...rows[0],Date:'31.02.2020'}]])assert.throws(()=>parseDatedExchangeRate(bad,'USD','UZS','2020-01-02'),/unavailable/);
 assert.throws(()=>parseDatedExchangeRate(rows,'GBP','UZS','2020-01-02'),/unavailable/);
});
test('provider request always includes the selected date',async()=>{
 const original=global.fetch;
 try{global.fetch=async url=>{assert.equal(url,'https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/2020-01-02/');return Response.json(rows);};assert.equal((await loadDatedExchangeRate('USD','UZS','2020-01-02')).rate,12000);}
 finally{global.fetch=original;}
});
test('exchange payment API verifies rates server-side and reuses committed rates on retry during an outage',async()=>{
 let rate=12000,prior=[],calls=[],offline=false,authenticated=true;
 const post=new Function('z','session','supa','sameOrigin','loadDatedExchangeRate','depositToday',compile('app/api/investment-history/exchange/route.ts')+';return POST;')(z,async()=>authenticated?{token:'owner'}:null,async(path,init,token)=>{
  assert.equal(token,'owner');if(path.includes('finance_records?'))return Response.json([{id:id(1),kind:'Debt',currency:'UZS'},{id:id(2),kind:'Cash',currency:'USD'}]);
  if(path.includes('investment_account_links?'))return Response.json(prior);
  calls.push(JSON.parse(init.body));return Response.json({ok:true});
 },req=>req.headers.get('origin')==='https://local',async(from,to,date)=>{assert.equal(from,'USD');assert.equal(to,'UZS');assert.equal(date,'2020-01-02');if(offline)throw Error('offline');return {rate,effective_date:'2020-01-01'};},()=> '2026-09-18');
 const body={id:id(10),record_id:id(1),account_id:id(2),type:'withdrawal',amount:80000000,balance:null,date:'2020-01-02',notes:'',exchange_rate:12000};
 const request=(patch={},origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify({...body,...patch})});
 assert.equal((await post(request({},'https://other'))).status,403);
 authenticated=false;assert.equal((await post(request())).status,401);authenticated=true;
 assert.equal((await post(request({exchange_rate:1000000000}))).status,409);assert.equal(calls.length,0);
 assert.equal((await post(request({cash_amount:1}))).status,200);
 assert.equal(calls[0].p_rate,12000);assert.equal(calls[0].p_amount,80000000);assert.equal(calls[0].p_account_currency,'USD');assert.equal(calls[0].p_rate_date,'2020-01-01');assert.equal(calls[0].cash_amount,undefined);
 offline=true;assert.equal((await post(request())).status,422);
 prior=[{account_id:id(2),exchange_rate:12000,rate_date:'2020-01-01',account_currency:'USD',record_currency:'UZS'}];
 assert.equal((await post(request())).status,200);assert.equal(calls.length,2);
 assert.equal((await post(request({exchange_rate:11000}))).status,409);
});

test('converted debt, mortgage and transfers cannot spend more than the locked source balance',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner=id(90),other=id(91),migration=fs.readFileSync('migrations/031_dated_cash_conversion.sql','utf8'),setup=fs.readFileSync('database/setup.sql','utf8');assert.ok(setup.includes(migration));
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(setup.slice(0,setup.indexOf(migration)));await db.exec(migration);
  const add=(n,kind,currency,amount)=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$3,$4,$5,$6,$7)',[id(n),owner,kind,currency,amount,'2030-01-01','2020-01-01']);
  await add(1,'Debt','UZS',2000000000);await add(2,'Cash','USD',9150);await add(3,'Cash','UZS',0);await add(4,'Mortgage','UZS',2000000000);await add(5,'Loan','UZS',2000000000);await add(6,'Cash','USD',9150);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  const pay=(n,record,value,account=2,rate=12000,type='withdrawal',principal=0,interest=0)=>db.query('SELECT record_investment_with_fx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id(n),id(record),type,'2020-01-02',value,null,'',id(account),rate,'2020-01-01','USD','UZS',principal,interest]);
  await assert.rejects(pay(10,1,1000000000),/Not enough money/);
  assert.equal(await amount(2),9150);assert.equal(await amount(1),2000000000);
  assert.equal((await db.query('SELECT * FROM investment_history WHERE id=$1',[id(10)])).rows.length,0);
  await pay(10,1,80000000);assert.ok(Math.abs(await amount(2)-(9150-80000000/12000))<1e-9);assert.equal(await amount(1),1920000000);
  await pay(10,1,80000000);assert.equal(await amount(1),1920000000);
  await assert.rejects(pay(10,1,80000000,2,11000),/different details/);
  const link=(await db.query('SELECT * FROM investment_account_links WHERE id=$1',[id(10)])).rows[0];assert.equal(link.account_currency,'USD');assert.equal(link.record_currency,'UZS');assert.equal(Number(link.exchange_rate),12000);
  for(const rate of [0,-1,'NaN'])await assert.rejects(pay(11,1,1000,2,rate),/dated exchange rate/);
  // Exactly the available amount succeeds; a further spend is rejected.
  await pay(12,5,9150*12000,6);assert.equal(await amount(6),0);
  await assert.rejects(pay(13,5,1,6),/Not enough money/);
  await pay(14,4,1200000,2,12000,'mortgage_payment',1000000,200000);
  assert.equal(await amount(4),1999000000);
  const afterMortgage=await amount(2);await pay(14,4,1200000,2,12000,'mortgage_payment',1000000,200000);assert.equal(await amount(2),afterMortgage);
  const transfer={id:id(20),kind:'transfer',source_id:id(2),target_id:id(3),sent:100,received:1000000000,source_value:100,target_value:1000000000,fee:1,date:'2020-01-02',notes:''};
  const move=data=>db.query('SELECT record_transfer_with_fx($1,$2,$3,$4,$5)',[data,12000,'2020-01-01','USD','UZS']);
  await move(transfer);assert.equal(await amount(3),99*12000);assert.equal(await amount(2),afterMortgage-100);
  await move(transfer);assert.equal(await amount(3),99*12000);
  await assert.rejects(move({...transfer,id:id(21),sent:9150}),/Insufficient balance/);assert.equal(await amount(3),99*12000);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);await assert.rejects(pay(30,1,100),/cash account/);
 }finally{await db.close();}
});

test('transfer API requires the selected date rate and does not trust a submitted conversion rate',async()=>{
 let calls=[],offline=false,prior=[];
 const post=new Function('z','session','sameOrigin','supa','loadDatedExchangeRate',compile('app/api/asset-movements/route.ts')+';return POST;')(z,async()=>({token:'owner'}),()=>true,async(path,init)=>{
  if(path.includes('finance_records?'))return Response.json([{id:id(2),currency:'USD'},{id:id(3),currency:'UZS'}]);
  if(path.includes('asset_movements?'))return Response.json(prior);
  calls.push({path,args:JSON.parse(init.body)});return Response.json({ok:true});
 },async(from,to,date)=>{assert.equal(from,'USD');assert.equal(to,'UZS');assert.equal(date,'2020-01-02');if(offline)throw Error('offline');return {rate:12000,effective_date:'2020-01-01'};});
 const body={id:id(20),kind:'transfer',source_id:id(2),target_id:id(3),sent:100,received:1200000,source_value:100,target_value:1200000,fee:0,date:'2020-01-02',notes:''};
 const request=patch=>new Request('https://local',{method:'POST',body:JSON.stringify({...body,...patch})});
 assert.equal((await post(request({}))).status,400);
 assert.equal((await post(request({exchange_rate:10000000}))).status,409);assert.equal(calls.length,0);
 assert.equal((await post(request({exchange_rate:12000,received:1000000000,target_value:1000000000}))).status,200);
 assert.equal(calls[0].path,'/rest/v1/rpc/record_transfer_with_fx');assert.equal(calls[0].args.p_rate,12000); // SQL recomputes received from sent minus fee.
 offline=true;assert.equal((await post(request({exchange_rate:12000}))).status,422);
 prior=[{exchange_rate:12000,rate_date:'2020-01-01'}];assert.equal((await post(request({exchange_rate:12000}))).status,200);
});
