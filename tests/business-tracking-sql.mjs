import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`92000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('business tracking: accounts, transactions, rules, tags and imports stay with their owner',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/092_business_tracking.sql','utf8');
  assert.ok(setup.includes(migration),'the fresh setup includes the migration');
  await db.exec(setup);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const save=record=>db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01',...record})]);
  const row=async n=>(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(n)])).rows[0];
  await save({id:id(10),name:'Candles',kind:'Business',amount:0,business_structure:'llc',business_color:'teal'});
  await save({id:id(11),name:'Rentals',kind:'Business',amount:0,business_structure:'rental_property',business_color:'amber'});
  await assert.rejects(save({id:id(12),name:'Checking',kind:'Cash',amount:100,business_color:'teal'}),/business_profile/);
  await assert.rejects(save({id:id(13),name:'Bad logo',kind:'Business',amount:0,business_logo:'javascript:alert(1)'}),/check/i);
  await save({id:id(12),name:'Checking',kind:'Cash',amount:1000});
  await save({id:id(14),name:'Supplies',kind:'Other expense',amount:40,account_id:id(12)});
  await save({id:id(15),name:'Groceries',kind:'Living expense',amount:30,account_id:id(12)});
  await save({id:id(16),name:'Sale',kind:'Other income',amount:90,account_id:id(12),business_id:id(11)});
  await assert.rejects(save({id:id(17),name:'Nested',kind:'Business',amount:0,business_id:id(10)}),/business_cashflow/);

  // An account moves to a business with the transactions that followed it; one given another business by hand stays.
  assert.equal((await db.query('SELECT set_account_business($1,$2) AS n',[id(12),id(10)])).rows[0].n,2);
  assert.equal((await row(12)).business_id,id(10));assert.equal((await row(14)).business_id,id(10));assert.equal((await row(16)).business_id,id(11));
  // A transaction moved back to the household is left there when the account changes business again.
  assert.equal((await db.query('SELECT set_transaction_business($1,NULL) AS n',[[id(15)]])).rows[0].n,1);
  assert.equal((await db.query('SELECT set_account_business($1,$2) AS n',[id(12),id(11)])).rows[0].n,1);
  assert.equal((await row(14)).business_id,id(11));assert.equal((await row(15)).business_id,null);
  // Business transactions change category; business income needs a business.
  assert.equal((await db.query("SELECT set_transaction_category($1,'Rent expense',NULL) AS n",[[id(14)]])).rows[0].n,1);
  assert.equal((await db.query("SELECT set_transaction_category($1,'Business income',NULL) AS n",[[id(16)]])).rows[0].n,1);
  assert.equal((await row(16)).name,'Rentals','business income is named after its business');
  assert.equal((await db.query('SELECT set_transaction_business($1,NULL) AS n',[[id(16)]])).rows[0].n,0,'business income keeps its business');
  await assert.rejects(db.query('SELECT set_transaction_business($1,$2)',[[id(14)],id(12)]),/your businesses/);

  // Tags and rules.
  await db.exec(`INSERT INTO transaction_tags(id,name) VALUES('${id(30)}','Sunset'),('${id(31)}','Tax 2026')`);
  await assert.rejects(db.exec(`INSERT INTO transaction_tags(id,name) VALUES('${id(32)}',' sunset ')`),/duplicate|unique/i);
  assert.equal((await db.query('SELECT set_transaction_tags($1,$2,$3) AS n',[[id(14),id(15)],[id(30)],[]])).rows[0].n,2);
  assert.equal((await db.query('SELECT set_transaction_tags($1,$2,$3) AS n',[[id(14)],[],[id(30)]])).rows[0].n,1);
  await assert.rejects(db.exec(`INSERT INTO transaction_tag_links(record_id,tag_id) VALUES('${id(14)}','${id(30)}')`),/permission/);
  await save({id:id(18),name:'CandleScience order',kind:'Other expense',amount:55,account_id:id(12)});
  await save({id:id(19),name:'CandleScience refund',kind:'Other income',amount:5,account_id:id(12)});
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,tag_ids) VALUES('${id(40)}','candlescience','any','${id(10)}','{${id(31)}}')`);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction) VALUES('${id(41)}','x','any')`),/transaction_rules_action/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,kind) VALUES('${id(41)}','x','any','Other expense')`),/transaction_rules_kind/);
  assert.equal((await db.query('SELECT apply_transaction_rule($1) AS n',[id(40)])).rows[0].n,2);
  assert.equal((await row(18)).business_id,id(10));assert.equal((await row(19)).business_id,id(10));
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM transaction_tag_links WHERE tag_id='${id(31)}'`)).rows[0].n,2);

  // Imports take the account's business, then a matching rule's business and tags.
  await db.exec(`RESET ROLE;INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id,import_key) VALUES('${id(20)}','${id(1)}','Cleaning','Other expense','USD',20,'2026-01-02','Once','${id(12)}','k1'),('${id(21)}','${id(1)}','CandleScience wax','Other expense','USD',20,'2026-01-02','Once','${id(12)}','k2');SET ROLE authenticated;`);
  assert.equal((await row(20)).business_id,id(11));assert.equal((await row(21)).business_id,id(10));
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM transaction_tag_links WHERE record_id='${id(21)}'`)).rows[0].n,1);

  // Deleting a tag removes it from rules, and rules left with no action go too.
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,tag_ids) VALUES('${id(42)}','sale','any','{${id(31)}}')`);
  await db.exec(`DELETE FROM transaction_tags WHERE id='${id(31)}'`);
  assert.deepEqual((await db.query('SELECT id::text,tag_ids::text[] AS tags FROM transaction_rules ORDER BY id')).rows,[{id:id(40),tags:[]}]);

  // Another owner sees nothing and cannot touch these rows.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT set_transaction_business($1,NULL) AS n',[[id(14)]])).rows[0].n,0);
  await assert.rejects(db.query('SELECT set_account_business($1,NULL)',[id(12)]),/your accounts/);
  await assert.rejects(db.query('SELECT set_transaction_tags($1,$2,$3)',[[id(15)],[id(30)],[]]),/your tags/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_tags')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_tag_links')).rows[0].n,0);
 }finally{await db.close();}
});
