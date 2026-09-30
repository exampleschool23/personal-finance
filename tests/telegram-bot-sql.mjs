import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`7600000${n}-0000-4000-8000-00000000000${n}`;
const owner=id(1),other=id(2);
async function database(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;GRANT USAGE ON SCHEMA auth TO service_role;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec('GRANT USAGE ON SCHEMA public TO service_role');
 return db;
}
const cash={id:id(3),name:'Wallet',kind:'Cash',currency:'USD',amount:500,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''};
const expense={id:id(4),name:'Groceries',kind:'Living expense',currency:'USD',amount:40,quantity:0,cost:0,rate:0,date:'2026-09-30',frequency:'Once',notes:'',account_id:id(3)};

test('the bot wrappers save as the linked owner through the app functions and refuse unlinked owners',async()=>{
 const db=await database();try{
  await db.exec(`SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  await db.query('SELECT save_finance_record($1,NULL)',[cash]);
  await db.exec(`INSERT INTO telegram_subscriptions(user_id,chat_id,linked_at) VALUES('${owner}',500,now());`);
  await db.exec(`RESET ROLE;RESET request.jwt.claim.sub;SET ROLE service_role;`);
  const saved=(await db.query('SELECT telegram_save_finance_record($1,$2) AS result',[owner,expense])).rows[0].result[0];
  assert.equal(saved.name,'Groceries');assert.equal(saved.user_id,owner);assert.equal(saved.revision,1);
  await assert.rejects(db.query('SELECT telegram_save_finance_record($1,$2)',[other,{...expense,id:id(5)}]),/Telegram is not connected/);
  await assert.rejects(db.query('SELECT telegram_save_finance_record($1,$2)',[null,{...expense,id:id(5)}]),/Telegram is not connected/);
  // The claim set inside the wrapper does not leak into the session.
  assert.equal((await db.query("SELECT current_setting('request.jwt.claim.sub',true) AS sub")).rows[0].sub,'');
  await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(3)])).rows[0].amount),460);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_records')).rows[0].n,2);
 }finally{await db.close();}
});

test('planning actions run as the owner too, and app roles cannot call the wrappers or read drafts',async()=>{
 const db=await database();try{
  await db.exec(`SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  await db.query('SELECT save_finance_record($1,NULL)',[cash]);
  await db.query('SELECT save_finance_record($1,NULL)',[{...cash,id:id(6),name:'Savings',amount:0}]);
  await db.exec(`INSERT INTO telegram_subscriptions(user_id,chat_id,linked_at) VALUES('${owner}',500,now());`);
  await assert.rejects(db.query('SELECT telegram_save_finance_record($1,$2)',[owner,expense]),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM telegram_drafts'),/permission denied/);
  await db.exec(`RESET ROLE;RESET request.jwt.claim.sub;SET ROLE service_role;`);
  const transfer={id:id(7),account_id:id(3),target_id:id(6),amount:100,received:100,fee:0,date:'2026-09-30',notes:''};
  await db.query('SELECT telegram_planning_action($1,$2,$3)',[owner,'transfer',transfer]);
  await db.query(`INSERT INTO telegram_drafts(user_id,step,data) VALUES($1,'amount','{"kind":"expense"}')`,[owner]);
  await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
  const balances=(await db.query('SELECT id,amount FROM finance_records WHERE kind=$1 ORDER BY name',['Cash'])).rows;
  assert.deepEqual(balances.map(row=>Number(row.amount)),[100,400]);
 }finally{await db.close();}
});
