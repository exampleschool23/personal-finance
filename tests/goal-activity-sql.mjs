import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('goal funding and ledger are atomic, idempotent, owner isolated, and do not move cash',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();const id=n=>`c0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const owner=id(1),other=id(2);
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/036_goal_funding_and_activity.sql','utf8');const start=setup.indexOf(migration);assert.ok(start>0);await db.exec(setup.slice(0,start));await db.exec(migration);
 await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Cash','Cash','USD',1000,'2026-01-01','Once');`);
 const makeGoal=async(n,allocated=0)=>db.query("SELECT planning_action('goal',$1)",[{id:id(n),name:'Goal '+n,account_id:id(10),kind:'savings',currency:'USD',target:500,allocated,target_date:'2027-01-01'}]);await makeGoal(20,100);await makeGoal(21,0);
 const payload={id:id(30),goal_id:id(20),target_id:null,source_id:null,amount:50,date:'2026-01-02',type:'contribution',notes:'Contribution'};
 const save=p=>db.query('SELECT record_goal_activity($1)',[p]);await save(payload);await save(payload);await assert.rejects(save({...payload,amount:51}),/different details/);
 assert.equal(Number((await db.query('SELECT allocated FROM savings_goals WHERE id=$1',[id(20)])).rows[0].allocated),150);
 assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount),1000);
 await save({...payload,id:id(31),type:'transfer',target_id:id(21),amount:40});
 const values=(await db.query('SELECT allocated FROM savings_goals ORDER BY id')).rows.map(row=>Number(row.allocated));assert.deepEqual(values,[110,40]);
 const count=(await db.query('SELECT * FROM goal_events')).rows.length;await assert.rejects(save({...payload,id:id(32),type:'withdrawal',amount:999}),/balance or target/);assert.equal((await db.query('SELECT * FROM goal_events')).rows.length,count);
 await db.query('SELECT configure_goal_funding($1)',[{goal_id:id(20),priority:1,monthly:100,enabled:true,paused_until:null,mode:'refill'}]);
 assert.equal((await db.query('SELECT funding_enabled FROM savings_goals WHERE id=$1',[id(20)])).rows[0].funding_enabled,true);
 await makeGoal(20,120);assert.equal(Number((await db.query("SELECT sum(delta) AS value FROM goal_events WHERE goal_id=$1",[id(20)])).rows[0].value),120);
 await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES($1,$2,'Income','Salary','USD',250,'2026-01-01','Once',$3)",[id(35),owner,id(10)]);
 await save({...payload,id:id(36),source_id:id(35),amount:200});
 await assert.rejects(save({...payload,id:id(37),goal_id:id(21),source_id:id(35),amount:100}),/already allocated/);
 await save({...payload,id:id(37),source_id:id(35),amount:.125});
 assert.equal(Number((await db.query('SELECT allocated FROM savings_goals WHERE id=$1',[id(20)])).rows[0].allocated),320.125);
 await save({...payload,id:id(38),amount:179.875});
 assert.ok((await db.query('SELECT completed_on FROM savings_goals WHERE id=$1',[id(20)])).rows[0].completed_on);
 await save({...payload,id:id(39),type:'withdrawal',amount:5});
 assert.ok((await db.query('SELECT completed_on FROM savings_goals WHERE id=$1',[id(20)])).rows[0].completed_on);
 assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount),1250);
 const backup=(await db.query('SELECT export_finance_backup() AS data')).rows[0].data;assert.equal(backup.tables.goal_operations.length,6);assert.ok(backup.tables.goal_events.length>0);
 await db.exec(`SET request.jwt.claim.sub='${other}';`);assert.equal((await db.query('SELECT * FROM goal_events')).rows.length,0);assert.equal((await db.query('SELECT * FROM goal_operations')).rows.length,0);await assert.rejects(save({...payload,id:id(33)}),/active savings/);await assert.rejects(save(payload),/different details/);
 await assert.rejects(db.query('SELECT configure_goal_funding($1)',[{goal_id:id(20),priority:0,monthly:0,enabled:false,paused_until:null,mode:'refill'}]),/not found/);
 }finally{await db.close();}
});
