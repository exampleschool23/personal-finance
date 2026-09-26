import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`69000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('direct deposit and security conversions remain atomic, idempotent and owner scoped',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Trades, deposit transfers and compounding settings.')[0]);
  await db.exec(fs.readFileSync('migrations/025_asset_movements.sql','utf8'));
  await db.exec(fs.readFileSync('migrations/069_investment_account_conversions.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const day=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  for(const [n,kind,amount,quantity] of [[10,'Deposit',2000,1],[11,'Crypto',1000,0],[12,'Stock',100,0]])await db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(1),kind,kind,'USD',amount,quantity,day]);
  const move={id:id(100),kind:'buy',source_id:id(10),target_id:id(11),sent:1000,received:1,source_value:1000,target_value:1000,fee:0,date:day,notes:''};
  await db.query('SELECT record_asset_movement($1)',[move]);await db.query('SELECT record_asset_movement($1)',[move]);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount),1000);
  const convert={...move,id:id(101),source_id:id(11),target_id:id(12),sent:1,received:10};
  await db.query('SELECT record_asset_movement($1)',[convert]);
  assert.equal(Number((await db.query('SELECT quantity FROM finance_records WHERE id=$1',[id(12)])).rows[0].quantity),10);
  assert.equal(Number((await db.query('SELECT count(*) FROM asset_movements')).rows[0].count),2);
  await assert.rejects(db.query('SELECT record_asset_movement($1)',[{...convert,id:id(102)}]),/Insufficient/);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(db.query('SELECT record_asset_movement($1)',[{...move,id:id(103)}]),/own source/);
  assert.equal((await db.query('SELECT * FROM asset_movements')).rows.length,0);
 }finally{await db.close();}
});
