import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`a2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const prepare=async(db,owner,schema)=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
 await db.exec(schema);
 await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Wallet','Cash','USD',1000,'2020-01-01','Once'),('${id(11)}','${owner}','Savings','Cash','USD',5000,'2020-01-01','Once');GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;`);
};
const goal=(n,patch={})=>({id:id(n),name:'Laptop',kind:'savings',account_id:id(10),target:2000,allocated:900,target_date:'2030-01-01',archived:false,...patch});
test('a savings goal may set aside more than its account holds, and keeps its other rules',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await prepare(db,id(1),fs.readFileSync('database/setup.sql','utf8'));
  const save=(data,fn='planning_action')=>db.query(`SELECT ${fn}('goal',$1)`,[data]);
  const saved=async n=>(await db.query('SELECT name,allocated::float8 AS allocated,monthly_contribution::float8 AS monthly,archived,account_id FROM savings_goals WHERE id=$1',[id(n)])).rows[0];
  await save(goal(20));await save(goal(21,{name:'Trip',allocated:100}));
  // 900 + 100 + 7,000 against a 1,000 balance: allowed, as the goal setup's "Already saved" needs.
  await save(goal(22,{name:'Retirement',target:200000,allocated:7000}));assert.equal((await saved(22)).allocated,7000);
  await db.exec(`UPDATE finance_records SET amount=400 WHERE id='${id(10)}'`);
  for(const fn of ['planning_action','planning_action_with_actual_amount']){
   await save(goal(20,{name:'Laptop '+fn,monthly_contribution:125.5}),fn);
   assert.deepEqual(await saved(20),{name:'Laptop '+fn,allocated:900,monthly:125.5,archived:false,account_id:id(10)});
   await save(goal(20,{allocated:1500}),fn);assert.equal((await saved(20)).allocated,1500);
   await save(goal(23,{name:'New '+fn,allocated:50}),fn);
  }
  // A goal stays in its account, and already saved still cannot pass the target.
  await assert.rejects(save(goal(20,{allocated:300,account_id:id(11)})),/Archive this goal and create another/);
  // Reactivating an archived goal keeps its amount too.
  await save(goal(21,{name:'Trip',allocated:100,archived:true}));
  await save(goal(21,{name:'Trip',allocated:100,archived:false}));assert.equal((await saved(21)).archived,false);
  const refusing=(await db.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc LIKE '%RAISE EXCEPTION ''Allocations exceed%'")).rows[0].n;
  assert.equal(refusing,0,'no function refuses over-allocation any more');
 }finally{await db.close();}
});
test('migration 105 lifts the refusal in place and is safe to run again',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  const migration=fs.readFileSync('migrations/105_allow_over_allocated_goals.sql','utf8'),setup=fs.readFileSync('database/setup.sql','utf8');
  assert.ok(setup.trimEnd().endsWith(migration.trimEnd()),'database/setup.sql ends with migration 105');
  await prepare(db,id(1),setup.slice(0,setup.lastIndexOf(migration.trimEnd())));
  await assert.rejects(db.query("SELECT planning_action('goal',$1)",[goal(20,{allocated:1500})]),/Allocations exceed/);
  await db.exec('RESET ROLE');await db.exec(migration);await db.exec(migration);await db.exec('SET ROLE authenticated');
  await db.query("SELECT planning_action('goal',$1)",[goal(20,{allocated:1500})]);
  assert.equal(Number((await db.query('SELECT allocated FROM savings_goals WHERE id=$1',[id(20)])).rows[0].allocated),1500);
 }finally{await db.close();}
});
test('migration 072 upgrades the functions in place and is safe to run again',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  const migration=fs.readFileSync('migrations/072_edit_over_reserved_goals.sql','utf8'),setup=fs.readFileSync('database/setup.sql','utf8');
  assert.ok(setup.includes(migration.trimEnd()),'database/setup.sql includes migration 072');
  // The schema as it was before 072.
  await prepare(db,id(1),setup.slice(0,setup.lastIndexOf(migration.trimEnd())));
  await db.query("SELECT planning_action('goal',$1)",[goal(20)]);
  await db.exec(`UPDATE finance_records SET amount=400 WHERE id='${id(10)}'`);
  await assert.rejects(db.query("SELECT planning_action('goal',$1)",[goal(20,{name:'Renamed'})]),/Allocations exceed/);
  await db.exec('RESET ROLE');await db.exec(migration);await db.exec(migration);await db.exec('SET ROLE authenticated');
  await db.query("SELECT planning_action('goal',$1)",[goal(20,{name:'Renamed'})]);
  assert.equal((await db.query('SELECT name FROM savings_goals WHERE id=$1',[id(20)])).rows[0].name,'Renamed');
 }finally{await db.close();}
});
