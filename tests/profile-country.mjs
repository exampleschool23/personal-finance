import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('country migration preserves existing preferences, owner isolation and older backups',async()=>{
 const db=new PGlite();
 const owner='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO authenticated; INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  const original=fs.readFileSync('migrations/004_settings_and_fiat_currencies.sql','utf8');
  await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.user_preferences'),original.indexOf('-- Run after the lending-date')));
  await db.exec(`INSERT INTO user_preferences(user_id) VALUES('${owner}');`);
  await db.exec(fs.readFileSync('migrations/068_profile_country.sql','utf8'));
  assert.equal((await db.query('SELECT country FROM user_preferences')).rows[0].country,'');
  // Older backups omit the new field and jsonb_populate_recordset fills it with null.
  await db.query('INSERT INTO user_preferences SELECT * FROM jsonb_populate_recordset(NULL::user_preferences,$1)',[JSON.stringify([{user_id:other,language:'en',currencies:['USD']}])]);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}'; UPDATE user_preferences SET country='UZ';`);
  assert.equal((await db.query('SELECT country FROM user_preferences')).rows[0].country,'UZ');
  await assert.rejects(db.exec("UPDATE user_preferences SET country='XX'"),/check constraint/);
  await db.exec(`SET request.jwt.claim.sub='${other}'; UPDATE user_preferences SET country='US' WHERE user_id='${owner}';`);
  assert.equal((await db.query('SELECT country FROM user_preferences')).rows[0].country,null);
  await db.exec(`SET request.jwt.claim.sub='${owner}';`);
  assert.equal((await db.query('SELECT country FROM user_preferences')).rows[0].country,'UZ');
  await db.exec("UPDATE user_preferences SET country=''");
  assert.equal((await db.query('SELECT country FROM user_preferences')).rows[0].country,'');
 }finally{await db.close();}
});
