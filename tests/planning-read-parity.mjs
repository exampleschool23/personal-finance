import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';

// The planning read for large accounts: pages follow the last id instead of an offset, deposits are not read twice,
// and migration 108 adds owner indexes. Every scope must answer exactly what the offset reader answered, for the
// owner, for a household member opening the owner's workspace, and for someone else.
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,partner,stranger]=[1,2,3].map(id);
const migration=fs.readFileSync('migrations/108_owner_read_indexes.sql','utf8');

test('the fresh setup includes migration 108',()=>{
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
});

/** A small PostgREST: the query grammar the planning read uses, run through RLS as the signed-in person. */
function postgrest(){
 const split=text=>{const parts=[];let depth=0,quoted=false,start=0;for(let i=0;i<=text.length;i++){const c=text[i];if(c==='"')quoted=!quoted;else if(!quoted&&c==='(')depth++;else if(!quoted&&c===')')depth--;else if(c===undefined||(!quoted&&depth===0&&c===',')){parts.push(text.slice(start,i));start=i+1;}}return parts;};
 const list=value=>split(value.slice(1,-1)).map(item=>item.replace(/^"(.*)"$/,'$1'));
 function condition(alias,text,values){
  const group=/^(and|or)\((.*)\)$/.exec(text);
  if(group)return '('+split(group[2]).map(part=>condition(alias,part,values)).join(group[1]==='and'?' AND ':' OR ')+')';
  const [column,...rest]=text.split('.');let op=rest.shift(),negate=false;
  if(op==='not'){negate=true;op=rest.shift();}
  const value=rest.join('.'),target=`${alias}."${column}"`;
  let sql;
  if(op==='in'){values.push(list(value));sql=`${target} = ANY($${values.length})`;}
  else{values.push(value);sql=`${target} ${{eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='}[op]} $${values.length}`;}
  return negate?`NOT (${sql})`:sql;
 }
 return function query(path){
  const url=new URL('https://db.local'+path),table=url.pathname.replace('/rest/v1/','');
  const values=[],where=[],columns=[];let order='',limit='',offset='';
  const embedded=url.searchParams.get('investment_history.and');
  for(const [key,value] of url.searchParams){
   if(key==='select'){
    for(const column of split(value)){
     const embed=/^investment_history(!inner)?\((.*)\)$/.exec(column);
     if(column==='*')columns.push('t.*');
     else if(embed){
      const filter=embedded?' AND '+condition('h','and'+embedded,values):'';
      columns.push(`(SELECT json_build_object(${embed[2].split(',').map(name=>`'${name}',h."${name}"`).join(',')}) FROM public.investment_history h WHERE h.id=t.id${filter}) AS investment_history`);
      if(embed[1])where.push(`EXISTS(SELECT 1 FROM public.investment_history h WHERE h.id=t.id${filter})`);
     }else columns.push(`t."${column}"`);
    }
   }else if(key==='order')order=' ORDER BY '+value.split(',').map(part=>{const [column,direction]=part.split('.');return `t."${column}" ${direction.toUpperCase()}`;}).join(',');
   else if(key==='limit')limit=' LIMIT '+Number(value);
   else if(key==='offset')offset=' OFFSET '+Number(value);
   else if(key==='or'||key==='and')where.push(condition('t',key+value,values));
   else if(key!=='investment_history.and')where.push(condition('t',key+'.'+value,values));
  }
  return {sql:`SELECT coalesce(json_agg(x),'[]')::text AS rows FROM (SELECT ${columns.join(',')} FROM public.${table} t${where.length?' WHERE '+where.join(' AND '):''}${order}${limit}${offset}) x`,values};
 };
}

async function fixture(db){
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
  GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 // Applying the migration again changes nothing.
 await db.exec(migration);
 // Bulk rows straight into the tables (triggers off): the owner has more than a page of records, activity,
 // occurrences and movements; the stranger has a little of everything.
 await db.exec(`SET session_replication_role=replica;
  INSERT INTO auth.users VALUES('${owner}','owner@example.com'),('${partner}','partner@example.com'),('${stranger}','stranger@example.com');
  INSERT INTO household_members(owner_id,member_id,role) VALUES('${owner}','${partner}','member');
  CREATE TEMP TABLE people AS SELECT * FROM (VALUES('${owner}'::uuid,10),('${stranger}'::uuid,1)) p(uid,scale);
  INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,rate,date,frequency,notes,shared,estimated_monthly_payment)
   SELECT gen_random_uuid(),p.uid,'Holding '||i,(ARRAY['Cash','Cash','Stock','Deposit','Treasury bill','Loan','Mortgage','Money lent','Property','Deposit'])[1+i%10],(ARRAY['USD','EUR'])[1+i%2],1000*i,1+i%3,10,CASE WHEN i%10 IN (3,4,9) THEN 12+i%5 ELSE 0 END,date '2024-01-01'+i*9,'Once','',true,CASE WHEN i%10 IN (5,6) THEN 50 ELSE 0 END
   FROM people p,generate_series(1,2*p.scale) i;
  INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,rate,date,frequency,notes,shared)
   SELECT gen_random_uuid(),p.uid,'Plan '||i,(ARRAY['Salary','Rent expense','Living expense','Other income','Charity'])[1+i%5],'USD',100+i,1,0,0,date '2024-01-03'+i,(ARRAY['Monthly','Weekly'])[1+i%2],'',true FROM people p,generate_series(1,p.scale/2+1) i;
  INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,rate,date,frequency,notes,shared)
   SELECT gen_random_uuid(),p.uid,'Shop '||(i%40),(ARRAY['Living expense','Other expense','Salary','Charity','Rent expense','Other income','Living expense','Rent income'])[1+i%8],(ARRAY['USD','EUR'])[1+i%2],5+i%300+0.25,1,0,0,date '2024-01-05'+(i*1000/(130*p.scale)),'Once','note '||i,true FROM people p,generate_series(1,130*p.scale) i;
  INSERT INTO payment_occurrences(id,user_id,record_id,due_on,status)
   SELECT gen_random_uuid(),r.user_id,r.id,(r.date+(m||' month')::interval)::date,(ARRAY['paid','dismissed'])[1+m%2] FROM finance_records r,generate_series(0,110) m WHERE r.frequency<>'Once';
  INSERT INTO account_activity(id,user_id,action,account_id,target_id,amount,occurred_on,notes,before_balance,after_balance)
   SELECT gen_random_uuid(),p.uid,(ARRAY['transfer','repayment','reconcile','mortgage'])[1+i%4],(SELECT id FROM finance_records WHERE user_id=p.uid AND kind='Cash' ORDER BY id LIMIT 1),CASE WHEN i%7=0 THEN NULL ELSE (SELECT id FROM finance_records WHERE user_id=p.uid AND kind='Loan' ORDER BY id LIMIT 1) END,10+i,date '2024-01-05'+(i*1000/(110*p.scale)),'',0,0 FROM people p,generate_series(1,110*p.scale) i;
  INSERT INTO investment_history(id,user_id,record_id,event_type,occurred_on,amount,balance,created_at)
   SELECT gen_random_uuid(),r.user_id,r.id,CASE WHEN m=0 THEN 'baseline' ELSE 'contribution' END,(r.date+(m||' month')::interval)::date,100,r.amount+100*m,timestamptz '2024-01-01'+(m||' hour')::interval FROM finance_records r,generate_series(0,24) m WHERE r.kind IN ('Deposit','Treasury bill','Stock');
  INSERT INTO investment_account_links(id,user_id,account_id,amount)
   SELECT h.id,h.user_id,(SELECT id FROM finance_records WHERE user_id=h.user_id AND kind='Cash' ORDER BY id LIMIT 1),100 FROM investment_history h WHERE h.event_type='contribution' AND extract(month from h.occurred_on)::int%3=0;
  INSERT INTO mortgage_payments(id,user_id,mortgage_id,principal,interest,paid_on)
   SELECT gen_random_uuid(),r.user_id,r.id,100,10,(r.date+(m||' month')::interval)::date FROM finance_records r,generate_series(0,20) m WHERE r.kind='Mortgage';
  INSERT INTO savings_goals(id,user_id,name,target,allocated,currency,kind,target_date) SELECT gen_random_uuid(),p.uid,'Goal '||i,1000*i,0,'USD','net_worth',date '2030-01-01' FROM people p,generate_series(1,3) i;
  INSERT INTO transaction_categories(id,user_id,name,direction) SELECT gen_random_uuid(),p.uid,'Category '||i,CASE WHEN i%2=0 THEN 'income' ELSE 'expense' END FROM people p,generate_series(1,4) i;
  INSERT INTO holding_accounts(id,user_id,name,kind,currency) SELECT gen_random_uuid(),p.uid,'Broker '||i,'Stock','USD' FROM people p,generate_series(1,2) i;
  INSERT INTO asset_movements(id,user_id,kind,source_id,target_id,sent,received,source_value,target_value,occurred_on,source_before,source_after,target_before,target_after)
   SELECT gen_random_uuid(),p.uid,'transfer',(SELECT id FROM finance_records WHERE user_id=p.uid AND kind='Cash' ORDER BY id LIMIT 1),(SELECT id FROM finance_records WHERE user_id=p.uid AND kind='Stock' ORDER BY id LIMIT 1),1,1,1,1,date '2024-01-05'+i,0,0,0,0 FROM people p,generate_series(1,52*p.scale) i;
  SET session_replication_role=origin;ANALYZE;`);
}

test('every planning scope answers the same as the offset reader, for the owner, a household member and someone else',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await fixture(db);
  const indexes=(await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%_owner_id' OR indexname='account_activity_owner_date' ORDER BY 1`)).rows.map(row=>row.indexname);
  for(const name of ['account_activity_owner_date','account_activity_owner_id','investment_account_links_owner_id','mortgage_payments_owner_id','payment_occurrences_owner_id','savings_goals_owner_id','transaction_categories_owner_id'])assert.ok(indexes.includes(name),name);
  await db.exec('SET ROLE authenticated');
  const translate=postgrest();
  let workspace=null,queue=Promise.resolve();const paths=[];
  // One request at a time, each with its own signed-in person and workspace header, as PostgREST sets them.
  const supa=(path,init,token)=>{paths.push(path);const run=queue.then(async()=>{
   const {sql,values}=translate(path);
   await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)`,[token,JSON.stringify(workspace?{'x-workspace-owner':workspace}:{})]);
   try{return Response.json(JSON.parse((await db.query(sql,values)).rows[0].rows));}catch(error){return Response.json({message:error.message},{status:400});}
  });queue=run.catch(()=>{});return run;};
  const supabase={session:async()=>({token:viewer,user:{id:viewer}}),supa,sameOrigin:()=>true};
  const quiet={'@/lib/notify-action':{queueMilestoneCheck:()=>{}},'@/lib/dated-exchange-rate':{loadDatedExchangeRate:async()=>{throw Error('unused');}}};
  let viewer=owner;
  const current=loadTS('app/api/planning/route.ts',{'@/lib/supabase':supabase,'./supabase':supabase,...quiet});
  // The reader before this change: offset pages, and deposits read again for their estimates.
  const {readAllPages,pagePath}=loadTS('lib/owner-rows.ts');
  const {depositForecasts}=loadTS('lib/deposit-forecasts.ts',{'./supabase':supabase});
  const legacy=loadTS('app/api/planning/route.ts',{'@/lib/supabase':supabase,...quiet,
   '@/lib/server-records':{readOwnerRows:(table,token,extra={})=>{const params=new URLSearchParams({select:'*',order:'id.asc',...extra});return readAllPages(range=>supa(pagePath('/rest/v1/'+table+'?'+params,range),{},token),'Could not load planning data.');}},
   '@/lib/deposit-forecasts':{depositForecasts:token=>depositForecasts(token)}});
  const answer=async(api,query)=>{const response=await api.GET(new Request('https://app.local/api/planning'+query));return {status:response.status,body:await response.json()};};
  const read=async(api,query)=>{const reply=await answer(api,query);assert.equal(reply.status,200,query);return reply.body;};
  const scopes=['?scope=full','?scope=workspace','?scope=review&month=2026-03','?scope=budget&month=2026-03&from=2024-04','?scope=insights'];
  const ownerView={};
  for(const [who,as,open] of [['owner',owner,null],['member',partner,owner],['member at home',partner,null],['stranger',stranger,null],['stranger asking for the owner',stranger,owner]]){
   viewer=as;workspace=open;
   for(const query of scopes){
    paths.length=0;
    const before=await answer(legacy,query);const legacyPaths=paths.splice(0);
    const reply=await answer(current,query),after=reply.body;
    assert.deepEqual(reply,before,`${who} ${query}`);
    assert.equal(reply.status,who==='stranger asking for the owner'?503:200,`${who} ${query}`);
    if(who==='owner'){
     ownerView[query]=after;
     // Id-ordered pages never use an offset now, and deposits come from the records already read.
     assert.ok(paths.every(path=>!/offset=/.test(path)||/investment_history\?record_id/.test(path)),query);
     assert.ok(legacyPaths.some(path=>/offset=500/.test(path)),'the fixture spans several pages: '+query);
     if(query!=='?scope=insights'){assert.equal(paths.filter(path=>/finance_records\?kind=in/.test(path)).length,0,query);assert.equal(legacyPaths.filter(path=>/finance_records\?kind=in/.test(path)).length,1,query);}
    }
    if(who==='member')assert.deepEqual(after,ownerView[query],'a household member sees the owner’s workspace: '+query);
   }
  }
  // The owner's workspace is large enough to need several pages, and its numbers are the database's.
  const full=ownerView['?scope=full'];
  viewer=owner;workspace=null;
  await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.headers','{}',false)`,[owner]);
  const count=async table=>Number((await db.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);
  assert.equal(full.records.length,await count('finance_records'));assert.ok(full.records.length>1000);
  assert.equal(full.activity.length,await count('account_activity'));assert.ok(full.activity.length>1000);
  assert.equal(full.occurrences.length,await count('payment_occurrences'));assert.equal(full.movements.length,await count('asset_movements'));
  assert.deepEqual(full.records.map(record=>record.id),[...full.records.map(record=>record.id)].sort(),'records stay in id order');
  assert.ok(full.records.some(record=>record.kind==='Deposit'&&record.estimated_monthly_income>0),'deposits carry their estimate');
  assert.ok(full.debtPayments.length>500);
  assert.equal(ownerView['?scope=review&month=2026-03'].records.filter(record=>record.frequency==='Once'&&['Salary','Living expense'].includes(record.kind)).every(record=>record.date>='2026-02-01'&&record.date<'2026-04-01'),true);
  // Someone else sees only their own rows; asking for a workspace they are not part of is refused.
  viewer=stranger;workspace=null;
  const own=await read(current,'?scope=full');assert.ok(own.records.length>0&&own.records.length<200);
  assert.ok(!own.records.some(record=>full.records.some(other=>other.id===record.id)));
 }finally{await db.close();}
});
