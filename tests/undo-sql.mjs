import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('goals, lending tracker updates and recorded scheduled payments can be undone and restored by their owner only',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Cash','Cash','USD',100,'2020-01-01','Once'),('${id(11)}','${owner}','Salary','Salary','USD',1500,'2020-01-01','Monthly'),('${id(30)}','${owner}','Car loan','Loan','USD',1000,'2030-01-01','Once');GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;`);
  const day=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  const count=async(sql,params=[])=>(await db.query(sql,params)).rows.length;
  const archived=async source=>(await db.query('SELECT id FROM deleted_items WHERE source=$1 ORDER BY deleted_at DESC',[source])).rows[0]?.id;

  // Recorded scheduled payment: delete reopens the reminder and reverses cash; restore relinks it.
  await db.query("SELECT planning_action_with_actual_amount('occurrence',$1)",[{id:id(20),account_id:id(10),target_id:id(11),date:'2020-02-01',amount:1500,notes:''}]);
  assert.equal(await amount(10),1600);assert.equal(await count('SELECT * FROM payment_occurrences WHERE transaction_id=$1',[id(20)]),1);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(20)]);
  assert.equal(await amount(10),100);assert.equal(await count('SELECT * FROM payment_occurrences'),0);
  const payment=await archived('finance_records');assert.ok(payment);
  await db.query('SELECT restore_deleted_item($1)',[payment]);
  assert.equal(await amount(10),1600);
  assert.deepEqual((await db.query('SELECT status,due_on::text FROM payment_occurrences WHERE transaction_id=$1',[id(20)])).rows,[{status:'paid',due_on:'2020-02-01'}]);

  // Lending repayment: the newest update can be deleted, cash and its mirror entry are reversed, then the loan deletes.
  await db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(31),id(30),'withdrawal',day,300,null,'Repay',id(10)]);
  assert.equal(await amount(30),700);assert.equal(await amount(10),1300);
  const mirror=()=>count("SELECT * FROM investment_history WHERE record_id=$1 AND event_type='withdrawal' AND amount=300",[id(10)]);
  assert.equal(await mirror(),1);
  await assert.rejects(db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(30)]),/saved tracker updates/);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  await assert.rejects(db.query('SELECT delete_tracker_update($1,$2)',[id(31),id(30)]),/not found/);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  await db.query('SELECT delete_tracker_update($1,$2)',[id(31),id(30)]);
  await db.query('SELECT delete_tracker_update($1,$2)',[id(31),id(30)]);
  assert.equal(await amount(30),1000);assert.equal(await amount(10),1600);assert.equal(await mirror(),0);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(30)]);
  assert.equal(await count('SELECT * FROM finance_records WHERE id=$1',[id(30)]),0);

  // Savings goal: delete keeps its activity for restore without inventing a second opening entry.
  await db.query("SELECT planning_action('goal',$1)",[{id:id(40),name:'Trip',account_id:id(10),target:500,allocated:50,target_date:null,archived:false}]);
  assert.equal(await count('SELECT * FROM goal_events WHERE goal_id=$1',[id(40)]),1);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  await db.query('SELECT delete_savings_goal($1)',[id(40)]);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  assert.equal(await count('SELECT * FROM savings_goals WHERE id=$1',[id(40)]),1);
  await db.query('SELECT delete_savings_goal($1)',[id(40)]);await db.query('SELECT delete_savings_goal($1)',[id(40)]);
  assert.equal(await count('SELECT * FROM savings_goals'),0);assert.equal(await count('SELECT * FROM goal_events'),0);
  const goal=await archived('savings_goals');assert.ok(goal);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal(await count('SELECT * FROM deleted_items'),0);
  await db.query('SELECT restore_deleted_item($1)',[goal]);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  assert.equal(await count('SELECT * FROM savings_goals'),0);
  await db.query('SELECT restore_deleted_item($1)',[goal]);
  assert.deepEqual((await db.query('SELECT name,allocated::float AS allocated FROM savings_goals')).rows,[{name:'Trip',allocated:50}]);
  assert.deepEqual((await db.query("SELECT event_type,delta::float AS delta FROM goal_events")).rows,[{event_type:'opening',delta:50}]);
  assert.equal(await count('SELECT * FROM deleted_items WHERE id=$1',[goal]),0);
 }finally{await db.close();}
});
