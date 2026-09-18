import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`54000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('scheduled receipts use exact actual amounts atomically without changing estimates',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/046_scheduled_actual_amount.sql','utf8'));
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','Cash','Cash','USD',100,'2020-01-01','Once'),('${id(11)}','${id(1)}','Salary','Salary','USD',1500,'2020-01-01','Monthly');SET ROLE authenticated;`);
 const save=p=>db.query("SELECT planning_action_with_actual_amount('occurrence',$1)",[p]);
 const payment={id:id(20),account_id:id(10),target_id:id(11),date:'2020-02-01',amount:1275.125,notes:''};
 await save(payment);await save(payment);
 const amount=async target=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[target])).rows[0].amount);
 assert.equal(await amount(id(10)),1375.125);assert.equal(await amount(id(20)),1275.125);assert.equal(await amount(id(11)),1500);
 for(const value of [0,-1,null])await assert.rejects(save({...payment,id:id(21),date:'2020-03-01',amount:value}));
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);await assert.rejects(save({...payment,id:id(22),date:'2020-03-01'}));
 }finally{await db.close();}
});
