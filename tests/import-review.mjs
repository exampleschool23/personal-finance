import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('statement source identifiers survive CSV mapping and deduplicate overlapping rows independently of position',async()=>{
 const {mapCSV}=loadTS('lib/csv.ts');const mapped=mapCSV([['Name','Date','Amount','ID'],['Shop','2026-01-02','-5','bank-42']],{name:0,date:1,amount:2,notes:-1,sourceId:3,dateFormat:'iso',decimal:'.'});assert.equal(mapped[0].sourceId,'bank-42');
 assert.throws(()=>mapCSV([['Name','Date','Amount','ID'],['Shop','2026-01-02','-5','']],{name:0,date:1,amount:2,notes:-1,sourceId:3,dateFormat:'iso',decimal:'.'}),/identifiers/);
 const calls=[];const api=loadTS('app/api/import/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'}),sameOrigin:()=>true,supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json({added:1,skipped:0});}},'@/lib/server-records':{readOwnerRows:async()=>[]}});
 const request=rows=>new Request('https://local',{method:'POST',body:JSON.stringify({batch_id:id(1),account_id:id(2),rows})});
 assert.equal((await api.POST(request(mapped))).status,200);assert.equal((await api.POST(request([{...mapped[0],sourceId:'another'},mapped[0]]))).status,200);assert.equal(calls[0].body.p_rows[0].key,calls[1].body.p_rows[1].key);assert.equal(calls[0].body.p_batch,id(1));assert.ok(calls.every(c=>c.path.endsWith('/import_statement')&&c.token==='owner'));
});
test('import batches, owner preferences, undo and account deletion work across an incremental upgrade',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();const owner=id(1),other=id(2);
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 const setup=fs.readFileSync('database/setup.sql','utf8'),m37=fs.readFileSync('migrations/037_workspace_preferences.sql','utf8'),m38=fs.readFileSync('migrations/038_import_review.sql','utf8');assert.ok(setup.includes(m37));assert.ok(setup.includes(m38));await db.exec(setup.slice(0,setup.indexOf(m37)));await db.exec(m37);await db.exec(m38);await db.exec(fs.readFileSync('migrations/039_account_deletion.sql','utf8'));
 await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON finance_records TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${owner}','Cash','Cash','USD',100,'2026-01-01','Once');INSERT INTO workspace_preferences VALUES('${owner}','allocation','{"weights":{"Cash":100}}');`);
 const rows=[{name:'Salary',amount:100,date:'2026-01-02',notes:'',key:'a'.repeat(64)},{name:'Shop',amount:-150,date:'2026-01-02',notes:'',key:'b'.repeat(64)}];const save=async(batch,data=rows)=>(await db.query('SELECT import_statement($1,$2,$3) AS result',[id(batch),id(10),data])).rows[0].result;
 const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
 assert.deepEqual(await save(20),{added:2,skipped:0});assert.equal(await balance(),50);assert.deepEqual(await save(20),{added:2,skipped:0});assert.equal(await balance(),50);assert.deepEqual(await save(21),{added:0,skipped:2});await assert.rejects(save(22,[{...rows[0],amount:101}]),/different details/);await assert.rejects(save(23,[rows[0],rows[0]]),/Duplicate source/);
 await db.query('SELECT undo_statement_import($1)',[id(20)]);await db.query('SELECT undo_statement_import($1)',[id(20)]);assert.equal(await balance(),100);await assert.rejects(save(20),/undone/);
 await save(24);await db.query("UPDATE finance_records SET notes='edited' WHERE import_key=$1",[rows[0].key]);await assert.rejects(db.query('SELECT undo_statement_import($1)',[id(24)]),/changed/);assert.equal(await balance(),50);
 await db.query("SELECT planning_action('goal',$1)",[{id:id(30),name:'Goal',account_id:id(10),kind:'savings',currency:'USD',target:100,allocated:5}]);await db.query('SELECT record_goal_activity($1)',[{id:id(31),goal_id:id(30),target_id:null,source_id:null,amount:5,date:'2026-01-03',type:'contribution',notes:''}]);
 const backup=(await db.query('SELECT export_finance_backup() AS data')).rows[0].data;assert.equal(backup.tables.workspace_preferences.length,1);assert.equal(backup.tables.import_batches.length,3);
 await db.exec(`SET request.jwt.claim.sub='${other}';`);for(const table of ['workspace_preferences','import_batches','import_batch_items'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0);await assert.rejects(db.query('SELECT undo_statement_import($1)',[id(24)]),/not found/);await assert.rejects(db.query('INSERT INTO workspace_preferences VALUES($1,$2,$3)',[owner,'watchlists',{items:[]}]),/row-level security/);
 await db.exec(`RESET ROLE;DELETE FROM auth.users WHERE id='${owner}';`);for(const table of ['finance_records','savings_goals','goal_events','goal_operations','workspace_preferences','import_batches','import_batch_items'])assert.equal((await db.query('SELECT * FROM '+table+' WHERE user_id=$1',[owner])).rows.length,0);
 }finally{await db.close();}
});
