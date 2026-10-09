import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`94000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const path=(owner,record,file,ext='jpg')=>`${id(owner)}/${id(record)}/${id(file)}.${ext}`;

test('migration 094 is in the fresh setup and installs without Supabase Storage',()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/094_record_attachments.sql','utf8');
 assert.ok(setup.includes(migration),'the fresh setup includes the migration');
 assert.match(migration,/to_regclass\('storage\.objects'\) IS NULL/);
 assert.match(migration,/public,file_size_limit,allowed_mime_types[\s\S]*'attachments','attachments',false,10485760/);
 assert.doesNotMatch(migration,/FOR UPDATE TO authenticated/,'stored files and rows are never edited in place');
});

test('attachments stay with their owner and their record, survive Recently deleted and go with permanent deletion',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');
   CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
   GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  assert.deepEqual((await db.query("SELECT public,file_size_limit::int AS size,allowed_mime_types FROM storage.buckets WHERE id='attachments'")).rows,[{public:false,size:10485760,allowed_mime_types:['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']}]);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const save=record=>db.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01',...record})]);
  await save({id:id(10),name:'Checking',kind:'Cash',amount:1000});
  await save({id:id(11),name:'Groceries',kind:'Living expense',amount:30,account_id:id(10)});
  const attach=(file,{owner=1,record=11,mime='image/jpeg',ext='jpg',size=1200}={})=>db.query('INSERT INTO record_attachments(id,user_id,record_id,path,file_name,mime,size) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(file),id(owner),id(record),path(owner,record,file,ext),'receipt.jpg',mime,size]);
  await attach(20);await attach(21,{mime:'application/pdf',ext:'pdf'});
  // The path must be the owner's folder, the record and the attachment id with the type's extension.
  await assert.rejects(db.query('INSERT INTO record_attachments(id,record_id,path,file_name,mime,size) VALUES($1,$2,$3,$4,$5,$6)',[id(22),id(11),path(2,11,22),'x.jpg','image/jpeg',10]),/record_attachments_path/);
  await assert.rejects(attach(22,{ext:'png'}),/record_attachments_path/);
  await assert.rejects(attach(22,{mime:'image/gif',ext:'gif'}),/check/i);
  await assert.rejects(attach(22,{size:10485761}),/check/i);
  await assert.rejects(attach(22,{record:99}),/row-level security/,'only to an existing record of the owner');
  await assert.rejects(db.exec(`UPDATE record_attachments SET file_name='x'`),/permission denied/);
  for(let n=0;n<18;n++)await attach(100+n);
  await assert.rejects(attach(200),/up to 20 attachments/);

  // Storage: the owner's own folder, and only for their records.
  await db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments','${path(1,11,20)}')`);
  await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments','${path(2,11,20)}')`),/row-level security/);
  await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments','${path(1,99,20)}')`),/row-level security/);

  // Another owner sees and removes nothing, and cannot attach to these records.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM storage.objects')).rows[0].n,0);
  await db.exec('DELETE FROM record_attachments;DELETE FROM storage.objects;');
  await assert.rejects(attach(23,{owner:2}),/row-level security/);
  await assert.rejects(db.exec(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments','${path(2,11,23)}')`),/row-level security/);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments')).rows[0].n,20);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM storage.objects')).rows[0].n,1);

  // Recently deleted keeps them; restoring brings the record back with them.
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(11)]);
  const archived=(await db.query('SELECT id FROM deleted_items')).rows[0].id;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments')).rows[0].n,20);
  await db.query('SELECT restore_deleted_item($1)',[archived]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments WHERE record_id=$1',[id(11)])).rows[0].n,20);

  // Permanent deletion returns the paths to remove and keeps their rows until the files are gone (migration 130);
  // another owner's call returns nothing.
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(11)]);
  const again=(await db.query('SELECT id FROM deleted_items')).rows[0].id;
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.deepEqual((await db.query('SELECT permanently_delete_item($1) AS r',[again])).rows[0].r,{ok:true,paths:[]});
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  const result=(await db.query('SELECT permanently_delete_item($1) AS r',[again])).rows[0].r;
  assert.equal(result.paths.length,20);assert.ok(result.paths.every(item=>item.startsWith(`${id(1)}/${id(11)}/`)));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments')).rows[0].n,20,'rows stay until the files are removed');
  // A failed removal leaves the rows, so the next purge returns the same paths again.
  assert.deepEqual((await db.query('SELECT permanently_delete_item($1) AS r',[again])).rows[0].r.paths,result.paths);
  // Another owner cannot forget them; the owner forgets only what was asked.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT forget_attachments($1) AS n',[result.paths])).rows[0].n,0);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await db.query('SELECT forget_attachments($1) AS n',[result.paths.slice(0,5)])).rows[0].n,5);
  assert.equal((await db.query('SELECT forget_attachments($1) AS n',[result.paths])).rows[0].n,15);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM record_attachments')).rows[0].n,0);
  await assert.rejects(db.query('SELECT orphan_attachment_paths($1)',[id(1)]),/permission denied/);
 }finally{await db.close();}
});
