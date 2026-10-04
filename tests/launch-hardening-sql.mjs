import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,partner,stranger]=[1,2,3].map(id);
const migration=fs.readFileSync('migrations/107_launch_hardening.sql','utf8');

test('the fresh setup includes migration 107',()=>{
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
});

test('chats are linked only by the server, stray uploads and outside owners are refused',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
   INSERT INTO auth.users VALUES('${owner}','owner@example.com'),('${partner}','partner@example.com'),('${stranger}','stranger@example.com');
   CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
   GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  // The server links the owner's chat and adds a household member.
  await db.exec(`INSERT INTO telegram_subscriptions(user_id,chat_id,linked_at) VALUES('${owner}',111,now()),('${stranger}',NULL,NULL);
   INSERT INTO household_members(owner_id,member_id,role) VALUES('${owner}','${partner}','member');`);
  await db.exec('SET ROLE authenticated');
  const as=user=>db.exec(`SET request.jwt.claim.sub='${user}';SET request.headers='{}';`);

  await as(stranger);
  await assert.rejects(db.query(`UPDATE telegram_subscriptions SET chat_id=111 WHERE user_id='${stranger}'`),/linked from the bot/,'nobody points their row at another chat');
  await assert.rejects(db.query(`UPDATE telegram_subscriptions SET linked_at=now() WHERE user_id='${stranger}'`),/linked from the bot/);
  await assert.rejects(db.query(`INSERT INTO telegram_subscriptions(user_id,chat_id) VALUES('${stranger}',222)`),/permission denied/);
  await as(owner);
  await db.query(`UPDATE telegram_subscriptions SET digest_enabled=false WHERE user_id='${owner}'`);
  await db.query(`UPDATE telegram_subscriptions SET chat_id=NULL,linked_at=NULL WHERE user_id='${owner}'`);
  assert.equal((await db.query(`SELECT chat_id FROM telegram_subscriptions WHERE user_id='${owner}'`)).rows[0].chat_id,null,'unlinking still works');

  for(const table of ['forecast_assignments','transaction_splits','import_batches'])
   assert.equal((await db.query(`SELECT has_table_privilege('anon','public.${table}','SELECT') AS ok`)).rows[0].ok,false,table);
  assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.transaction_splits','INSERT') AS ok`)).rows[0].ok,false);

  // Investment accounts name only people of the household.
  await db.query(`INSERT INTO holding_accounts(id,user_id,name,kind,currency,member_id) VALUES('${id(30)}','${owner}','Broker','Stock','USD','${partner}'),('${id(31)}','${owner}','Other','Stock','USD','${stranger}')`);
  const members=(await db.query(`SELECT id,member_id FROM holding_accounts ORDER BY id`)).rows;
  assert.deepEqual(members.map(row=>row.member_id),[partner,null]);

  // Uploads go only to the exact path the server hands out.
  await db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({id:id(10),name:'Wallet',kind:'Cash',amount:10,quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01'})]);
  await db.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments','${owner}/${id(10)}/${id(50)}.pdf')`);
  for(const name of [`${owner}/${id(10)}/anything.exe`,`${owner}/${id(10)}/${id(51)}.pdf.html`,`${owner}/${id(10)}/x/${id(52)}.pdf`])
   await assert.rejects(db.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',$1)`,[name]),/row-level security/,name);
 }finally{await db.close();}
});
