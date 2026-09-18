import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('permanent deletion erases recovery data, is idempotent and isolates owners',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/048_permanently_delete_recovery_items.sql','utf8');
 assert.ok(setup.includes(migration));await db.exec(setup.slice(0,setup.indexOf(migration)));await db.exec(migration);
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES('${id(3)}','${id(1)}','Cash','Cash','USD',123,'2026-01-01','2026-01-01'),('${id(4)}','${id(1)}','Debt','Debt','USD',12,'2026-01-01','2026-01-01');`);
 await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(4)]);
 const archive=(await db.query('SELECT * FROM deleted_items')).rows[0];
 const active=(await db.query('SELECT * FROM finance_records')).rows;
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);
 await db.query('SELECT permanently_delete_item($1)',[archive.id]);
 await db.exec(`SET request.jwt.claim.sub='${id(1)}'`);
 assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,1);
 await assert.rejects(db.query('DELETE FROM deleted_items'),/permission denied/);
 await db.query('SELECT permanently_delete_item($1)',[archive.id]);
 await db.query('SELECT permanently_delete_item($1)',[archive.id]);
 await db.query('SELECT restore_deleted_item($1)',[archive.id]);
 assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
 assert.deepEqual((await db.query('SELECT * FROM finance_records')).rows,active);
 await db.exec("SET request.jwt.claim.sub=''");await assert.rejects(db.query('SELECT permanently_delete_item($1)',[archive.id]),/sign in/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT permanently_delete_item($1)',[archive.id]),/permission denied/);
 }finally{await db.close();}
});
test('permanent-delete API validates owner session, origin, id and reports failed writes',async()=>{
 let auth=true,origin=true,fail=false,offline=false;const calls=[];
 const api=loadTS('app/api/deleted-items/route.ts',{'@/lib/supabase':{sameOrigin:()=>origin,session:async()=>auth?{token:'owner-token'}:null,supa:async(path,init,token)=>{calls.push({path,init,token});if(offline)throw Error();return Response.json({}, {status:fail?404:200});}}});
 const req=(value=id(3))=>new Request('https://local/api/deleted-items',{method:'DELETE',body:JSON.stringify({id:value})});
 origin=false;assert.equal((await api.DELETE(req())).status,403);origin=true;
 auth=false;assert.equal((await api.DELETE(req())).status,401);auth=true;
 assert.equal((await api.DELETE(req('bad'))).status,400);assert.equal(calls.length,0);
 assert.equal((await api.DELETE(req())).status,200);assert.equal(calls[0].token,'owner-token');assert.equal(calls[0].path,'/rest/v1/rpc/permanently_delete_item');assert.deepEqual(JSON.parse(calls[0].init.body),{p_id:id(3)});
 fail=true;assert.equal((await api.DELETE(req())).status,409);offline=true;assert.equal((await api.DELETE(req())).status,503);
});
