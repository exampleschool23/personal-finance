import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`a2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const prepare=async(db,owner,schema)=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
 await db.exec(schema);
 await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Wallet','Cash','USD',1000,'2020-01-01','Once'),('${id(11)}','${owner}','Savings','Cash','USD',5000,'2020-01-01','Once');GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;`);
};
const goal=(n,patch={})=>({id:id(n),name:'Laptop',kind:'savings',account_id:id(10),target:2000,allocated:900,target_date:'2030-01-01',archived:false,...patch});
test('an over-reserved savings goal can still be renamed, planned, reduced and archived, but not grown',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await prepare(db,id(1),fs.readFileSync('database/setup.sql','utf8'));
  const save=(data,fn='planning_action')=>db.query(`SELECT ${fn}('goal',$1)`,[data]);
  const saved=async n=>(await db.query('SELECT name,allocated::float8 AS allocated,monthly_contribution::float8 AS monthly,archived,account_id FROM savings_goals WHERE id=$1',[id(n)])).rows[0];
  await save(goal(20));await save(goal(21,{name:'Trip',allocated:100}));
  await assert.rejects(save(goal(22,{name:'Too much',allocated:1})),/Allocations exceed/);
  // Spending takes the account below what both goals reserve.
  await db.exec(`UPDATE finance_records SET amount=400 WHERE id='${id(10)}'`);
  for(const fn of ['planning_action','planning_action_with_actual_amount']){
   await save(goal(20,{name:'Laptop '+fn,monthly_contribution:125.5}),fn);
   assert.deepEqual(await saved(20),{name:'Laptop '+fn,allocated:900,monthly:125.5,archived:false,account_id:id(10)});
   await assert.rejects(save(goal(20,{allocated:900.01}),fn),/Allocations exceed/);
   await assert.rejects(save(goal(23,{name:'New',allocated:50}),fn),/Allocations exceed/);
  }
  await save(goal(20,{allocated:250}));assert.equal((await saved(20)).allocated,250);
  // 250 + 100 now fits within 400, so a reservation can grow again up to the balance.
  await save(goal(20,{allocated:300}));await assert.rejects(save(goal(20,{allocated:301})),/Allocations exceed/);
  // A goal stays in its account; the existing rule is unchanged.
  await assert.rejects(save(goal(20,{allocated:300,account_id:id(11)})),/Archive this goal and create another/);
  // Reactivating an archived goal reserves its amount again.
  await save(goal(21,{name:'Trip',allocated:100,archived:true}));
  await db.exec(`UPDATE finance_records SET amount=50 WHERE id='${id(10)}'`);
  await assert.rejects(save(goal(21,{name:'Trip',allocated:100,archived:false})),/Allocations exceed/);
  await save(goal(21,{name:'Trip',allocated:0,archived:false}));assert.deepEqual([(await saved(21)).allocated,(await saved(21)).archived],[0,false]);
  // A new goal without a reservation is always allowed.
  await save(goal(24,{name:'Idea',allocated:0}));
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
