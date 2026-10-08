import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('a built-in category is deleted for the workspace only: its records move to an added category, amounts and kinds stay, one category remains',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const usage=async kind=>(await db.query('SELECT built_in_category_usage($1) AS data',[kind])).rows[0].data;
  const remove=(kind,replacement=null,name=null)=>db.query('SELECT delete_built_in_category($1,$2,$3) AS data',[kind,replacement,name]);
  const removed=async()=>(await db.query("SELECT data FROM workspace_preferences WHERE key='removed_categories'")).rows[0]?.data.kinds??[];
  // Never used: deleted straight away.
  assert.deepEqual(await usage('Rent expense'),{records:0,deleted:0,watchlists:0,rules:0});
  await remove('Rent expense');
  assert.deepEqual(await removed(),['Rent expense']);
  await assert.rejects(remove('Rent expense'),/not found/);
  await assert.rejects(remove('Groceries'),/not found/);
  // In use: needs an added category of the same direction.
  await db.query("SELECT planning_action('category',$1)",[{id:id(10),name:'Freelance',direction:'income'}]);
  await db.query("SELECT planning_action('category',$1)",[{id:id(11),name:'Food',direction:'expense'}]);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Cash','Cash','USD',100,'2026-09-01','Once')",[id(20),id(1)]);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES($1,$2,'Lunch','Living expense','USD',12.5,'2026-09-02','Once',$3)",[id(21),id(1),id(20)]);
  await db.query("INSERT INTO workspace_preferences(user_id,key,data) VALUES($1,'watchlists',$2)",[id(1),{items:[{id:id(40),name:'Watch',query:'',category:'Living expense',currency:'USD',target:30}]}]);
  assert.deepEqual(await usage('Living expense'),{records:1,deleted:0,watchlists:1,rules:0});
  await assert.rejects(remove('Living expense'),/in use/);
  await assert.rejects(remove('Living expense',id(10)),/same type/);
  const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(20)])).rows[0].amount);
  const before=await balance();
  await remove('Living expense',id(11));
  const lunch=(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(21)])).rows[0];
  assert.equal(lunch.custom_category_id,id(11));assert.equal(lunch.kind,'Living expense');assert.equal(Number(lunch.amount),12.5);
  assert.equal(await balance(),before);
  assert.equal((await db.query("SELECT data FROM workspace_preferences WHERE key='watchlists'")).rows[0].data.items[0].category,id(11));
  assert.deepEqual(await removed(),['Rent expense','Living expense']);
  // A new replacement category can be created on the way.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES($1,$2,'Gift','Charity','USD',5,'2026-09-03','Once',$3)",[id(22),id(1),id(20)]);
  const created=(await remove('Charity',null,'Giving')).rows[0].data.replacement;
  assert.equal((await db.query('SELECT name,direction FROM transaction_categories WHERE id=$1',[created])).rows[0].name,'Giving');
  // The last income category stays.
  await remove('Salary');await remove('Rent income');await remove('Business income');
  await db.exec("RESET ROLE");await db.query('DELETE FROM transaction_categories WHERE id=$1',[id(10)]);await db.exec('SET ROLE authenticated');
  await assert.rejects(remove('Other income'),/at least one category/);
  // Another owner's workspace is untouched.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.deepEqual(await removed(),[]);
  await assert.rejects(remove('Rent expense',id(11)),/same type/);
 }finally{await db.close();}
});
