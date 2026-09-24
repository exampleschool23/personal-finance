import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`64000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('transaction history returns complete filtered pages, stable ties, precision and owner isolation',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;INSERT INTO finance_records(id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','Cash','Cash','USD',1000,'2020-01-01','Once'),('${id(11)}','Schedule','Salary','USD',100,'2020-01-01','Monthly');`);
  for(let n=0;n<31;n++)await db.query("INSERT INTO finance_records(id,name,kind,currency,amount,date,frequency,account_id,notes) VALUES($1,$2,'Salary','USD',1.12345678,$3,'Once',$4,$5)",[id(100+n),n===0?'100% literal':'Salary '+n,n<20?'2026-09-01':'2026-08-01',id(10),n===1?'Search this note':'']);
  const page=async(n,query='',from=null,to=null,order='newest')=>(await db.query('SELECT transaction_history_page($1,NULL,$2,\'all\',$3,$4,$5) AS p',[n,query,from,to,order])).rows[0].p;
  const first=await page(1),second=await page(2),last=await page(99);
  assert.equal(first.total,31);assert.equal(first.records.length,10);assert.equal(second.records.length,10);assert.equal(last.page,4);assert.equal(last.records.length,1);
  assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,20);
  assert.equal(first.records[0].amount,1.12345678);
  assert.equal((await page(1,'%')).total,1);assert.equal((await page(1,'search this')).total,1);assert.equal((await page(1,'','2026-09-01','2026-09-30')).total,20);
  assert.equal((await page(1,'',null,null,'oldest')).records[0].date,'2026-08-01');
  await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);assert.equal((await page(1)).total,0);
  await assert.rejects(page(0),/Invalid history/);
 }finally{await db.close();}
});
test('history API validates filters and binds them as RPC values with the owner token',async()=>{
 let authenticated=true;const calls=[];
 const api=loadTS('app/api/transaction-history/route.ts',{'@/lib/supabase':{session:async()=>authenticated?{token:'owner'}:null,supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json({records:[],total:0,page:1});}}});
 for(const query of ['page=0','from=2026-02-30','from=2026-09-01&to=2026-08-01','category=bad','currency=FAKE','order=bad'])assert.equal((await api.GET(new Request('https://local?'+query))).status,400);
 assert.equal(calls.length,0);
 assert.equal((await api.GET(new Request('https://local?page=2&query=100%25&currency=EUR&order=oldest'))).status,200);
 assert.equal(calls[0].token,'owner');assert.equal(calls[0].body.p_query,'100%');assert.equal(calls[0].body.p_page,2);
 authenticated=false;assert.equal((await api.GET(new Request('https://local'))).status,401);assert.equal(calls.length,1);
});
test('workspace excludes transaction history; review includes both selected months and year rollover',()=>{
 const {planningReadFilters}=loadTS('lib/planning-reads.ts');
 const workspace=planningReadFilters('workspace','2026-01');assert.match(workspace.records.or,/frequency.neq.Once/);assert.doesNotMatch(workspace.records.or,/date.gte/);
 const review=planningReadFilters('review','2026-01');assert.match(review.records.or,/date.gte.2025-12-01,date.lt.2026-02-01/);assert.match(review.activity.and,/2025-12-01/);assert.equal(review.investmentLinks['investment_history.and'],'(occurred_on.gte.2025-12-01,occurred_on.lt.2026-02-01)');
 assert.deepEqual(planningReadFilters('full','2026-01').records,{});
 assert.deepEqual(planningReadFilters('insights','2026-01').records,{});
});
