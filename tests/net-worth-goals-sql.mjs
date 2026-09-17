import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('goal migration preserves cash goals, supports independent wealth targets, and enforces ownership',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Net-worth goals and saved contribution scenarios.')[0]);
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(3)}','${owner}','Savings','Cash','EUR',1000,'2026-09-17','Once');`);
  const action=async data=>db.query("SELECT planning_action('goal',$1)",[data]);
  const cash={id:id(4),name:'Emergency',account_id:id(3),target:2000,allocated:800,target_date:null};
  await action(cash);
  await db.exec(fs.readFileSync('migrations/023_net_worth_goals.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  let goals=(await db.query('SELECT * FROM savings_goals')).rows;
  assert.equal(goals[0].currency,'EUR');assert.equal(goals[0].kind,'savings');assert.equal(Number(goals[0].allocated),800);
  const wealth={id:id(5),name:'Million',kind:'net_worth',account_id:null,currency:'USD',target:1000000,allocated:0,target_date:'2030-12-31',monthly_contribution:2000,annual_return:8};
  await action(wealth);await action({...wealth,monthly_contribution:3000});
  goals=(await db.query('SELECT * FROM savings_goals WHERE id=$1',[wealth.id])).rows;
  assert.equal(Number(goals[0].monthly_contribution),3000);assert.equal(Number(goals[0].annual_return),8);
  for(const bad of [{...wealth,account_id:id(3)},{...wealth,allocated:1},{...wealth,target_date:null},{...wealth,currency:'XXX'},{...wealth,annual_return:101}])await assert.rejects(action(bad));
  await assert.rejects(action({...cash,id:id(6),allocated:300}),/exceed/);
  await action({...cash,archived:true});await action({...cash,id:id(6),allocated:300});
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(3)])).rows[0].amount),1000);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('SELECT * FROM savings_goals')).rows.length,0);
  await assert.rejects(action(wealth),/Goal not found/);
  await action({...wealth,id:id(7)}); // This owner has no cash account.
  await assert.rejects(db.query('UPDATE savings_goals SET target=1'),/permission/);
 }finally{await db.close();}
});
