import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('deleting tracker updates restores ownership and valuation, reverses exact cash once, isolates owners and rolls back failures',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,ownership_percentage,date) VALUES('${id(10)}','${id(1)}','Sheep','Business','UZS',160000000,50,'2026-09-17'),('${id(11)}','${id(1)}','Cash','Cash','USD',1000,100,'2026-09-17');SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
 const day=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
 const save=async(n,balance)=>db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(n),id(10),'contribution',day,1000000,balance,'Feeding']);
 const remove=n=>db.query('SELECT delete_tracker_update($1,$2)',[id(n),id(10)]);
 const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
 await save(20,80000000);
 // Mirror the existing cross-currency cash link with a precise historical delta.
 await db.exec(`RESET ROLE;INSERT INTO investment_account_links(id,user_id,account_id,amount,account_currency,record_currency,exchange_rate,rate_date) VALUES('${id(20)}','${id(1)}','${id(11)}',-84.12345678,'USD','UZS',11887.292, '${day}');UPDATE finance_records SET amount=915.87654322 WHERE id='${id(11)}';SET ROLE authenticated;SET request.jwt.claim.sub='${id(2)}';`);
 await assert.rejects(remove(20),/not found/);
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
 await save(21,90000000);await assert.rejects(remove(20),/newer balance/);
 await remove(21);assert.equal(await amount(10),80000000);
 await remove(20);assert.equal(await amount(10),160000000);assert.equal(await amount(11),1000);
 await remove(20);assert.equal(await amount(11),1000);
 await assert.rejects(save(20,80000000),/was deleted/);
 assert.equal((await db.query('SELECT * FROM investment_account_links WHERE id=$1',[id(20)])).rows.length,0);
 const baseline=(await db.query("SELECT id FROM investment_history WHERE record_id=$1 AND event_type='baseline'",[id(10)])).rows[0].id;
 await assert.rejects(db.query('SELECT delete_tracker_update($1,$2)',[baseline,id(10)]),/cannot be deleted/);
 await assert.rejects(db.query('DELETE FROM investment_history'),/permission denied/);
 await save(22,150000000);
 await db.exec(`RESET ROLE;INSERT INTO investment_account_links(id,user_id,account_id,amount,account_currency) VALUES('${id(22)}','${id(1)}','${id(11)}',2000,'USD');SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
 await assert.rejects(remove(22),/invalid balance/);assert.equal(await amount(10),150000000);assert.equal(await amount(11),1000);
 assert.equal((await db.query('SELECT * FROM investment_history WHERE id=$1',[id(22)])).rows.length,1);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);assert.equal((await db.query('SELECT * FROM deleted_tracker_updates')).rows.length,0);
 }finally{await db.close();}
});
