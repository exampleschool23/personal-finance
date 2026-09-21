import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const owner='58000000-0000-4000-8000-000000000001',other='58000000-0000-4000-8000-000000000002',id='58000000-0000-4000-8000-000000000010';
test('record saves reject stale edits, preserve retry safety, audit changes and isolate owners',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 // Verify incremental installation as well as the fresh setup in restore tests.
 await db.exec(fs.readFileSync('database/setup.sql','utf8').split('BEGIN;\nALTER TABLE public.finance_records ADD COLUMN revision')[0]);
 await db.exec(fs.readFileSync('migrations/058_record_revisions.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/059_verified_backup_restore.sql','utf8'));
 await db.exec(`SET request.jwt.claim.sub='${owner}';SET ROLE authenticated`);
 const row={id,name:'Cash',kind:'Cash',currency:'USD',amount:100.12345678,date:'2026-01-01',frequency:'Once'};
 const save=async(record,version=null)=>(await db.query('SELECT save_finance_record($1,$2) AS result',[record,version])).rows[0].result[0];
 const initial=await save(row);assert.equal(initial.revision,1);
 const next=await save({...row,name:'Updated'},1);assert.equal(next.revision,2);
 assert.equal((await save({...row,name:'Updated'},1)).revision,2);
 await assert.rejects(save({...row,amount:200},1),/changed since/);
 await assert.rejects(save({...row,amount:200}),/changed since/);
 assert.equal((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id])).rows[0].amount,'100.12345678');
 assert.equal((await db.query('SELECT * FROM record_edit_history')).rows.length,1);
 await db.exec(`SET request.jwt.claim.sub='${other}'`);
 assert.equal((await db.query('SELECT * FROM record_edit_history')).rows.length,0);
 await assert.rejects(save({...row,amount:1},2),/changed since/);
 await assert.rejects(save({...row,amount:1}));
 await assert.rejects(save({...row,user_id:owner}));
 }finally{await db.close();}
});
