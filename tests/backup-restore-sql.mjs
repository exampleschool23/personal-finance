import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`59000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('verified backup restores exact balances and history atomically without replay, rejects changes and other owners',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','Cash','Cash','USD',1000.12345678,'2020-01-01','Once'),('${id(11)}','${id(1)}','Business','Business','USD',2000,'2020-01-01','Once'),('${id(12)}','${id(2)}','Private','Cash','USD',900,'2020-01-01','Once');INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES('${id(20)}','${id(1)}','Food','Living expense','USD',100.12345678,'2020-01-02','Once','${id(10)}');SET ROLE authenticated;`);
 await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,opened_on) VALUES('${id(30)}','${id(1)}','Mortgage','Mortgage','USD',1000,'2027-01-01','Once','2020-01-01');`);
 await db.query('SELECT record_mortgage_payment($1,$2,100,10,$3,$4)',[id(31),id(30),'2020-02-01','']);
 await db.query('SELECT save_income_source($1)',[{id:id(40),name:'Salary',kind:'Salary',currency:'USD',mode:'fixed',amount:500,frequency:'Monthly',start_date:'2020-01-01',end_date:null,linked_record_id:null,archived:false}]);
 const backup=(await db.query('SELECT export_finance_backup()::text AS backup')).rows[0].backup;
 const parsed=JSON.parse(backup);assert.equal(parsed.version,2);assert.ok(parsed.tables.finance_records.length>3);assert.ok(parsed.tables.mortgage_payments.length>0);assert.ok(parsed.tables.income_sources.length>0);
 const preview=async text=>(await db.query('SELECT preview_finance_restore($1) AS result',[text])).rows[0].result;
 const firstPreview=await preview(backup);assert.equal(firstPreview.current_records,parsed.tables.finance_records.length);
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,'stale']),/workspace changed/);
 await assert.rejects(preview(backup.replace('Food','Tampered')),/unchanged verified/);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);await assert.rejects(preview(backup),/unchanged verified/);
 await assert.rejects(db.query("INSERT INTO backup_manifests(id,user_id,digest) VALUES($1,$2,'bad')",[id(99),id(2)]),/permission denied/);
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';UPDATE finance_records SET name='Changed' WHERE id='${id(20)}';`);
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,firstPreview.expected_state]),/workspace changed/);
 const nextPreview=await preview(backup);
 // Simulate a future incompatible constraint and verify full rollback, including
 // the private restore context and automatically generated recovery copy.
 await db.exec("RESET ROLE;ALTER TABLE finance_records ADD CONSTRAINT fail_restore CHECK(name<>'Food') NOT VALID;SET ROLE authenticated;");
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,nextPreview.expected_state]),/fail_restore/);
 assert.equal((await db.query('SELECT name FROM finance_records WHERE id=$1',[id(20)])).rows[0].name,'Changed');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM backup_recovery_points')).rows[0].n,0);
 assert.equal((await db.query('SELECT finance_restore_active() AS active')).rows[0].active,false);
 await db.exec('RESET ROLE;ALTER TABLE finance_records DROP CONSTRAINT fail_restore;SET ROLE authenticated;');
 const result=(await db.query('SELECT restore_finance_backup($1,$2) AS result',[backup,nextPreview.expected_state])).rows[0].result;
 const retried=(await db.query('SELECT restore_finance_backup($1,$2) AS result',[backup,nextPreview.expected_state])).rows[0].result;assert.deepEqual(retried,result);
 const recovery=(await db.query('SELECT backup FROM backup_recovery_points WHERE id=$1',[result.recovery_id])).rows[0].backup;
 assert.ok(recovery.tables.finance_records.some(row=>row.name==='Changed'));
 const restored=(await db.query('SELECT export_finance_backup() AS backup')).rows[0].backup;
 for(const name of Object.keys(parsed.tables)){
  const sort=rows=>rows.map(row=>JSON.stringify(row)).sort();
  assert.deepEqual(sort(restored.tables[name]),sort(parsed.tables[name]),name);
 }
 assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount),900);
 await db.exec(`RESET ROLE;`);
 assert.equal((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(12)])).rows[0].amount,'900');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='D'")).rows[0].n,0);
 }finally{await db.close();}
});

test('backups carry transaction rules with their criteria, tags and tag links; older backups without them still restore',async()=>{
 const db=new PGlite();const owner=id(1),other=id(2);try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 const setup=fs.readFileSync('database/setup.sql','utf8');
 assert.ok(setup.includes(fs.readFileSync('migrations/099_rules_in_backups.sql','utf8')));
 await db.exec(setup);
 await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Card','Cash','USD',500,'2020-01-01','Once'),('${id(11)}','${owner}','Studio','Business','USD',0,'2020-01-01','Once'),('${id(12)}','${other}','Other cash','Cash','USD',10,'2020-01-01','Once');
  INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES('${id(20)}','${owner}','Coffee shop','Other expense','USD',5,'2020-01-02','Once','${id(10)}');
  INSERT INTO transaction_categories(id,user_id,name,direction) VALUES('${id(50)}','${owner}','Coffee','expense');
  INSERT INTO transaction_tags(id,user_id,name,color) VALUES('${id(60)}','${owner}','Trip','teal'),('${id(61)}','${owner}','Receipts','blue'),('${id(62)}','${other}','Theirs','red');
  INSERT INTO transaction_tag_links(record_id,tag_id,user_id) VALUES('${id(20)}','${id(60)}','${owner}');
  INSERT INTO transaction_rules(id,user_id,pattern,match,direction,kind,category_id,business_id,tag_ids,account_id,match_kind,amount_min,amount_max) VALUES('${id(70)}','${owner}','coffee shop','exact','expense','Other expense','${id(50)}','${id(11)}',ARRAY['${id(60)}','${id(61)}']::uuid[],'${id(10)}','Other expense',1.5,99.12345678);
  INSERT INTO transaction_rules(id,user_id,pattern,direction,match_business_id,tag_ids) VALUES('${id(71)}','${owner}','','any','${id(11)}',ARRAY['${id(61)}']::uuid[]);
  INSERT INTO transaction_rules(id,user_id,pattern,direction,tag_ids) VALUES('${id(79)}','${other}','theirs','any',ARRAY['${id(62)}']::uuid[]);
  SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
 const backup=(await db.query('SELECT export_finance_backup()::text AS backup')).rows[0].backup;
 const parsed=JSON.parse(backup);
 assert.deepEqual(['transaction_tags','transaction_tag_links','transaction_rules'].map(name=>parsed.tables[name].length),[2,1,2]);
 const saved=parsed.tables.transaction_rules.find(rule=>rule.id===id(70));
 assert.deepEqual([saved.match,saved.account_id,saved.match_kind,saved.amount_min,saved.amount_max,saved.category_id,saved.business_id,[...saved.tag_ids].sort()],['exact',id(10),'Other expense',1.5,99.12345678,id(50),id(11),[id(60),id(61)]]);
 assert.equal(parsed.tables.transaction_rules.find(rule=>rule.id===id(71)).match_business_id,id(11));
 // After the backup: a rule removed, a tag deleted (which edits the remaining rule), a link removed and a new rule added.
 await db.exec(`DELETE FROM transaction_rules WHERE id='${id(71)}';DELETE FROM transaction_tags WHERE id='${id(61)}';INSERT INTO transaction_rules(id,user_id,pattern,direction,kind) VALUES('${id(72)}','${owner}','rent','expense','Rent expense');`);
 await db.query('SELECT tag_transactions($1,$2,$3)',[[id(20)],[],[id(60)]]);
 assert.deepEqual((await db.query('SELECT tag_ids FROM transaction_rules WHERE id=$1',[id(70)])).rows[0].tag_ids,[id(60)]);
 const preview=(await db.query('SELECT preview_finance_restore($1) AS result',[backup])).rows[0].result;
 assert.deepEqual([preview.counts.transaction_rules,preview.counts.transaction_tags,preview.counts.transaction_tag_links],[2,2,1]);
 await db.query('SELECT restore_finance_backup($1,$2)',[backup,preview.expected_state]);
 const restored=(await db.query('SELECT export_finance_backup() AS backup')).rows[0].backup;
 const sort=rows=>rows.map(row=>JSON.stringify(row)).sort();
 for(const name of Object.keys(parsed.tables))assert.deepEqual(sort(restored.tables[name]),sort(parsed.tables[name]),name);
 // Restored rules still work: applying one sets its category, business and tags again.
 assert.equal((await db.query('SELECT apply_transaction_rule($1) AS n',[id(70)])).rows[0].n,1);
 assert.deepEqual((await db.query('SELECT custom_category_id,business_id FROM finance_records WHERE id=$1',[id(20)])).rows[0],{custom_category_id:id(50),business_id:id(11)});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_tag_links WHERE record_id=$1',[id(20)])).rows[0].n,2);
 // A backup from before rules were backed up has none of these tables; it still verifies and restores without them.
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_rules WHERE user_id=$1',[other])).rows[0].n,1,'other owners keep their rules');
 const older={...parsed,id:id(98),tables:{...parsed.tables}};for(const name of ['transaction_tags','transaction_tag_links','transaction_rules'])delete older.tables[name];
 const olderText=JSON.stringify(older);
 await db.query('SELECT register_verified_finance_backup($1,$2)',[olderText,owner]);
 await db.exec(`SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`);
 const olderPreview=(await db.query('SELECT preview_finance_restore($1) AS result',[olderText])).rows[0].result;
 assert.equal(olderPreview.counts.transaction_rules,0);
 await db.query('SELECT restore_finance_backup($1,$2)',[olderText,olderPreview.expected_state]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_rules')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_records')).rows[0].n,parsed.tables.finance_records.length);
 // A present table that is not a list is still refused.
 const broken=JSON.stringify({...older,id:id(97),tables:{...older.tables,transaction_rules:{}}});
 await db.exec('RESET ROLE');await assert.rejects(db.query('SELECT register_verified_finance_backup($1,$2)',[broken,owner]),/invalid owner data/);
 }finally{await db.close();}
});
