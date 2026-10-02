import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`93000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('rule criteria: exact names, accounts, businesses, categories and amounts narrow what a rule changes',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/093_rule_criteria.sql','utf8');
  assert.ok(setup.includes(migration),'the fresh setup includes the migration');
  await db.exec(setup);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const save=record=>db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01',...record})]);
  const row=async n=>(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(n)])).rows[0];
  const apply=async n=>(await db.query('SELECT apply_transaction_rule($1) AS n',[id(n)])).rows[0].n;
  await save({id:id(10),name:'Candles',kind:'Business',amount:0});
  await save({id:id(11),name:'Rentals',kind:'Business',amount:0});
  await save({id:id(12),name:'Checking',kind:'Cash',amount:1000});
  await save({id:id(13),name:'Card',kind:'Cash',amount:1000});
  await db.query("SELECT planning_action('category',$1)",[{id:id(50),name:'Advertising',direction:'expense'}]);
  await save({id:id(20),name:'Shop',kind:'Other expense',amount:40,account_id:id(12)});
  await save({id:id(21),name:'Shop online',kind:'Other expense',amount:400,account_id:id(12)});
  await save({id:id(22),name:'shop',kind:'Other expense',amount:15,account_id:id(13)});
  await save({id:id(23),name:'Ads',kind:'Other expense',amount:90,account_id:id(13),custom_category_id:id(50)});
  await save({id:id(24),name:'Sale',kind:'Other income',amount:500,account_id:id(13)});

  // A rule needs a criterion, a sensible amount range and a category of its own direction.
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id) VALUES('${id(40)}',' ','any','${id(10)}')`),/transaction_rules_criteria/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,amount_min,amount_max) VALUES('${id(40)}','x','any','${id(10)}',50,10)`),/transaction_rules_amount_range/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,match_kind) VALUES('${id(40)}','x','income','${id(10)}','Other expense')`),/transaction_rules_match_direction/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,match) VALUES('${id(40)}','x','any','${id(10)}','regex')`),/match_check/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,account_id) VALUES('${id(40)}','x','any','${id(10)}','${id(10)}')`),/your accounts/);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,match_business_id) VALUES('${id(40)}','x','any','${id(10)}','${id(12)}')`),/your businesses/);

  // An exact name ignores case and spaces around it, and leaves longer names alone.
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,match) VALUES('${id(41)}',' SHOP ','any','${id(10)}','exact')`);
  assert.equal(await apply(41),2);
  assert.equal((await row(20)).business_id,id(10));assert.equal((await row(22)).business_id,id(10));assert.equal((await row(21)).business_id,null);
  // An account and an amount range together; the name is optional once another criterion is set.
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,account_id,amount_min,amount_max) VALUES('${id(42)}','','expense','${id(11)}','${id(12)}',100,400)`);
  assert.equal(await apply(42),1);
  assert.equal((await row(21)).business_id,id(11));assert.equal((await row(20)).business_id,id(10));
  // A category criterion: everything in Advertising moves to a business, whatever its name.
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,match_kind,match_category_id) VALUES('${id(43)}','','any','${id(10)}','Other expense','${id(50)}')`);
  assert.equal(await apply(43),1);
  assert.equal((await row(23)).business_id,id(10));assert.equal((await row(24)).business_id,null);
  // A business criterion: only that business's transactions take the category.
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,kind,match_business_id) VALUES('${id(44)}','shop','expense','Rent expense','${id(11)}')`);
  assert.equal(await apply(44),1);
  assert.equal((await row(21)).kind,'Rent expense');assert.equal((await row(20)).kind,'Other expense');

  // Statement imports follow the same criteria.
  await db.exec(`RESET ROLE;INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id,import_key) VALUES('${id(30)}','${id(1)}','Shop','Other expense','USD',20,'2026-01-02','Once','${id(13)}','k1'),('${id(31)}','${id(1)}','Shop two','Other expense','USD',20,'2026-01-02','Once','${id(13)}','k2'),('${id(32)}','${id(1)}','Big order','Other expense','USD',250,'2026-01-02','Once','${id(12)}','k3');SET ROLE authenticated;`);
  assert.equal((await row(30)).business_id,id(10));assert.equal((await row(31)).business_id,null);assert.equal((await row(32)).business_id,id(11));

  // Deleting an account takes the rules that named it along; another owner cannot name these records.
  await save({id:id(14),name:'Spare',kind:'Cash',amount:0});
  await db.exec(`INSERT INTO transaction_rules(id,pattern,direction,business_id,account_id) VALUES('${id(46)}','','any','${id(10)}','${id(14)}')`);
  await db.exec(`DELETE FROM finance_records WHERE id='${id(14)}'`);
  assert.deepEqual((await db.query('SELECT id::text FROM transaction_rules ORDER BY id')).rows.map(item=>item.id),[id(41),id(42),id(43),id(44)]);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(db.exec(`INSERT INTO transaction_rules(id,pattern,direction,tag_ids,account_id) VALUES('${id(45)}','x','any','{}','${id(13)}')`),/transaction_rules|your accounts|foreign key/);
 }finally{await db.close();}
});
