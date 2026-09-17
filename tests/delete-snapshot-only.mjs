import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('automatic opening snapshots can be deleted and restored without losing dates; actual activity stays protected',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(900),other=id(901);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/032_delete_snapshot_only_records.sql','utf8');assert.ok(setup.includes(migration));
  await db.exec(setup.slice(0,setup.indexOf(migration)));
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Debt for car','Debt','UZS',140000000,'2030-01-01')",[id(0),owner]);
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const remove=n=>db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(n)]);
  const record=n=>db.query('SELECT * FROM finance_records WHERE id=$1',[id(n)]);
  const history=n=>db.query('SELECT * FROM investment_history WHERE record_id=$1 ORDER BY id',[id(n)]);
  const add=(n,kind)=>db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$3,'USD',1000,'2030-01-01',$4)",[id(n),owner,kind,['Cash','Stock','Crypto','Deposit','Mortgage','Loan','Debt'].includes(kind)?'2020-01-01':null]);
  for(const [n,kind] of ['Debt','Cash','Stock','Crypto','Deposit','Property','Business','Money lent','Mortgage','Loan'].entries()){
   if(n>0)await add(n,kind);
   const before=(await record(n)).rows,opening=(await history(n)).rows;assert.equal(opening.length,1);
   await remove(n);await remove(n);assert.equal((await record(n)).rows.length,0);assert.equal((await history(n)).rows.length,0);
   const archive=(await db.query('SELECT * FROM deleted_items')).rows;assert.equal(archive.length,1);assert.equal(archive[0].history.length,1);
   await db.exec(`SET request.jwt.claim.sub='${other}';`);await db.query('SELECT restore_deleted_item($1)',[archive[0].id]);assert.equal((await record(n)).rows.length,0);
   await db.exec(`SET request.jwt.claim.sub='${owner}';`);
   await db.query('SELECT restore_deleted_item($1)',[archive[0].id]);await db.query('SELECT restore_deleted_item($1)',[archive[0].id]);
   assert.deepEqual((await record(n)).rows,before);assert.deepEqual((await history(n)).rows,opening);assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  }
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(100),id(0),'contribution',today,100,null,'']);
  const debtBefore=(await record(0)).rows,historyBefore=(await history(0)).rows;
  await assert.rejects(remove(0),/saved tracker updates or transactions/);
  assert.deepEqual((await record(0)).rows,debtBefore);assert.deepEqual((await history(0)).rows,historyBefore);
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(101),id(5),'valuation',today,0,1200,'']);
  await assert.rejects(remove(5),/saved tracker updates or transactions/);
  // A non-history dependency still blocks deletion and rolls back the snapshot archive.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,business_id) VALUES($1,$2,'Income','Other income','USD',1,$3,$4)",[id(102),owner,today,id(6)]);
  const businessBefore=(await history(6)).rows;
  await assert.rejects(remove(6),/foreign key/);assert.deepEqual((await history(6)).rows,businessBefore);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
 }finally{await db.close();}
});
