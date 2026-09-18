import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('rules, splits and forecast assignments are atomic, owner scoped, backed up and preserve balances',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const owner=id(1),other=id(2);
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 // Exercise the incremental migration against the preceding schema.
 const setup=fs.readFileSync('database/setup.sql','utf8');const migration=fs.readFileSync('migrations/035_transaction_tools.sql','utf8');assert.ok(setup.includes(migration));await db.exec(setup.slice(0,setup.indexOf(migration)));await db.exec(migration);
 await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
 const record=async(n,kind,amount,extra={})=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id,custom_category_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(n),owner,extra.name??'Shop',kind,extra.currency??'USD',amount,'2026-01-01',extra.frequency??'Once',extra.account??null,extra.category??null]);
 const category=async n=>db.query("SELECT planning_action('category',$1)",[{id:id(n),name:'Category '+n}]);
 await category(10);await category(11);await record(20,'Cash',1000);
 await record(26,'Other expense',2);
 await db.query('INSERT INTO category_rules(id,user_id,pattern,category_id,direction,priority) VALUES($1,$2,$3,$4,$5,$6)',[id(30),owner,'shop',id(10),'expense',0]);
 // A normal edit is an upsert: BEFORE INSERT must leave its category unchanged.
 await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,custom_category_id,notes) VALUES($1,$2,'Shop','Other expense','USD',2,'2026-01-01','Once',null,'Edited note') ON CONFLICT(id) DO UPDATE SET notes=EXCLUDED.notes,custom_category_id=EXCLUDED.custom_category_id",[id(26),owner]);
 assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE id=$1',[id(26)])).rows[0].custom_category_id,null);
 await record(21,'Other expense',.3,{account:id(20)});await record(22,'Other expense',1,{category:id(11)});await record(23,'Salary',5);
 assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE id=$1',[id(21)])).rows[0].custom_category_id,id(10));assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE id=$1',[id(22)])).rows[0].custom_category_id,id(11));assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE id=$1',[id(23)])).rows[0].custom_category_id,null);
 const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(20)])).rows[0].amount);
 const split=async(parts)=>db.query('SELECT save_transaction_splits($1,$2)',[id(21),parts]);
 const parts=[{category_id:id(10),amount:.1},{category_id:id(11),amount:.2}];await split(parts);await split(parts);assert.equal(await balance(),999.7);
 await assert.rejects(split([{category_id:id(10),amount:.1},{category_id:id(11),amount:.1}]),/must equal/);assert.equal((await db.query('SELECT * FROM transaction_splits')).rows.length,2);
 await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[id(21)]),/Clear the split/);
 await db.query('DELETE FROM finance_records WHERE id=$1',[id(21)]);assert.equal(await balance(),1000);
 const deleted=(await db.query("SELECT id FROM deleted_items WHERE data->>'id'=$1",[id(21)])).rows[0].id;
 await db.query('SELECT restore_deleted_item($1)',[deleted]);assert.equal(await balance(),999.7);assert.equal((await db.query('SELECT * FROM transaction_splits')).rows.length,2);
 await record(24,'Rent expense',5,{frequency:'Monthly'});await record(25,'Cash',100,{currency:'EUR'});
 await db.query('SELECT save_forecast_assignment($1,$2)',[id(24),id(20)]);await assert.rejects(db.query('SELECT save_forecast_assignment($1,$2)',[id(24),id(25)]),/same|currency/);
 const imported=[{name:'Shop imported',date:'2026-01-02',amount:-10,notes:'',key:'b'.repeat(64)}];await db.query('SELECT import_account_transactions($1,$2)',[id(20),imported]);await db.query('SELECT import_account_transactions($1,$2)',[id(20),imported]);assert.equal(await balance(),989.7);
 assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE import_key=$1',['b'.repeat(64)])).rows[0].custom_category_id,id(10));
 const backup=(await db.query('SELECT export_finance_backup() AS data')).rows[0].data;assert.equal(backup.tables.transaction_splits.length,2);assert.equal(backup.tables.category_rules.length,1);assert.equal(backup.tables.forecast_assignments.length,1);
 await db.exec(`SET request.jwt.claim.sub='${other}';`);
 for(const table of ['category_rules','transaction_splits','forecast_assignments'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0);
 await assert.rejects(split(parts),/actual transaction/);await assert.rejects(db.query('SELECT save_forecast_assignment($1,$2)',[id(24),id(20)]),/recurring/);
 await assert.rejects(db.query('INSERT INTO category_rules(id,user_id,pattern,category_id,direction) VALUES($1,$2,$3,$4,$5)',[id(31),other,'shop',id(10),'all']),/foreign key/);
 await db.exec(`SET request.jwt.claim.sub='${owner}';`);await split([]);await db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[id(21)]);assert.equal(await balance(),989);
 }finally{await db.close();}
});
