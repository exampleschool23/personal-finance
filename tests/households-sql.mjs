import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,partner,viewer,stranger]=[1,2,3,4].map(id);

test('the fresh setup includes migration 100 and keeps tokens hashed',()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/100_households.sql','utf8');
 assert.ok(setup.includes(migration),'the fresh setup includes the migration');
 assert.match(migration,/token_hash text NOT NULL UNIQUE/);
 assert.doesNotMatch(migration,/\btoken text\b[^;]*household_invites/,'raw tokens are never stored');
 for(const fn of ['can_read_owner','can_write_owner','active_owner'])assert.match(migration,new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\) RETURNS \\w+\\s+LANGUAGE \\w+ STABLE SECURITY DEFINER SET search_path=public`),fn);
});

test('households share an owner\'s workspace in the database: members edit, viewers read, everyone else sees nothing',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
   INSERT INTO auth.users VALUES('${owner}','owner@example.com'),('${partner}','partner@example.com'),('${viewer}','viewer@example.com'),('${stranger}','stranger@example.com');
   CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
   GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`INSERT INTO user_preferences(user_id,display_name) VALUES('${owner}','Alex'),('${partner}','Sam');`);
  await db.exec('SET ROLE authenticated');
  const as=async(user,workspace=null)=>db.exec(`SET request.jwt.claim.sub='${user}';SET request.headers='${JSON.stringify(workspace?{'x-workspace-owner':workspace}:{})}';`);
  const one=async(sql,params)=>(await db.query(sql,params)).rows[0];
  const count=async(table,where='true')=>(await one(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).n;
  const save=record=>db.query('SELECT save_finance_record($1::jsonb) AS r',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01',...record})]);
  const call=(fn,...args)=>db.query(`SELECT ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args).then(result=>result.rows[0].r);

  // Each person keeps their own finances.
  await as(owner);
  await save({id:id(10),name:'Joint checking',kind:'Cash',amount:1000});
  await save({id:id(11),name:'Groceries',kind:'Living expense',amount:30,account_id:id(10)});
  await db.query(`INSERT INTO transaction_tags(id,name,color) VALUES($1,'Holiday','teal')`,[id(12)]);
  await as(stranger);
  await save({id:id(40),name:'Private',kind:'Cash',amount:500});
  await as(partner);
  await save({id:id(20),name:'Own savings',kind:'Cash',amount:200});

  // An invite alone gives nothing: the link holder sees none of the owner's data and cannot ask for it.
  await as(owner);
  const invite=await call('create_household_invite','member');
  assert.match(invite.token,/^[0-9a-f]{64}$/);
  await db.exec('RESET ROLE');
  assert.equal((await one('SELECT count(*)::int AS n FROM household_invites WHERE token_hash=$1',[invite.token])).n,0,'only the hash is stored');
  await db.exec('SET ROLE authenticated');
  await as(partner);
  assert.equal(await count('finance_records',`user_id='${owner}'`),0);
  await as(partner,owner);
  await assert.rejects(db.query('SELECT count(*) FROM finance_records'),/no longer have access/);
  await assert.rejects(save({id:id(21),name:'Sneaky',kind:'Cash',amount:1}),/no longer have access/);
  await assert.rejects(db.query('SELECT * FROM household_members'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM household_invites'),/permission denied/);

  // Accepting joins the household as a member, once.
  await as(partner);
  assert.deepEqual(await call('preview_household_invite',invite.token),{owner_id:owner,name:'Alex',role:'member',expires_at:invite.expires_at,own:false,joined:false});
  assert.deepEqual(await call('accept_household_invite',invite.token),{owner_id:owner,role:'member'});
  await as(stranger);
  await assert.rejects(call('accept_household_invite',invite.token),/no longer valid/,'a used link cannot be reused');
  await assert.rejects(call('accept_household_invite','f'.repeat(64)),/no longer valid/);
  await assert.rejects(call('accept_household_invite','not a token'),/no longer valid/);

  // A member reads and changes the owner's workspace; what they add belongs to the owner and names them.
  await as(partner,owner);
  assert.equal(await count('finance_records'),2,'only the shared workspace, not the member\'s own records');
  await save({id:id(22),name:'Dinner',kind:'Living expense',amount:45,account_id:id(10)});
  await db.query(`INSERT INTO transaction_tags(id,name,color) VALUES($1,'Shared','teal')`,[id(23)]);
  await db.query(`UPDATE transaction_tags SET name='Holidays' WHERE id=$1`,[id(12)]);
  assert.deepEqual(await one('SELECT user_id,member_id FROM finance_records WHERE id=$1',[id(22)]),{user_id:owner,member_id:partner});
  assert.equal(await one('SELECT user_id FROM transaction_tags WHERE id=$1',[id(23)]).then(row=>row.user_id),owner);
  assert.equal(Number(await one('SELECT amount FROM finance_records WHERE id=$1',[id(10)]).then(row=>row.amount)),925,'balances follow the member\'s spending');
  await db.query(`SELECT move_item_to_deleted($1,'finance_records')`,[id(22)]);
  assert.equal(await count('deleted_items'),1);
  await db.query('SELECT restore_deleted_item(id) FROM deleted_items');
  assert.deepEqual(await call('household_people'),[{id:owner,name:'Alex',role:'owner'},{id:partner,name:'Sam',role:'member'}]);
  // Who paid can name someone in the household, never anyone else.
  await save({id:id(25),name:'Rent',kind:'Other expense',amount:5,account_id:id(10),member_id:owner});
  await save({id:id(26),name:'Gift',kind:'Other expense',amount:5,account_id:id(10),member_id:stranger});
  assert.deepEqual((await db.query('SELECT id,member_id FROM finance_records WHERE id IN ($1,$2) ORDER BY id',[id(25),id(26)])).rows,[{id:id(25),member_id:owner},{id:id(26),member_id:null}]);
  await db.query(`SELECT move_item_to_deleted($1,'finance_records')`,[id(25)]);await db.query(`SELECT move_item_to_deleted($1,'finance_records')`,[id(26)]);
  await db.exec(`RESET ROLE`);await db.exec(`DELETE FROM deleted_items`);await db.exec('SET ROLE authenticated');
  assert.equal(await call('set_transaction_member',[id(11),id(22)],partner),1,'only records that change are counted');
  assert.equal(await one('SELECT member_id FROM finance_records WHERE id=$1',[id(11)]).then(row=>row.member_id),partner);
  await assert.rejects(call('set_transaction_member',[id(11)],stranger),/no longer in your household/);
  await assert.rejects(call('set_transaction_member',[id(40)],partner).then(changed=>{if(changed===0)throw Error('untouched');}),/untouched/,'another owner\'s record is never changed');
  // The member's own workspace stays theirs; their private settings never move.
  await as(partner);
  assert.deepEqual((await db.query('SELECT id FROM finance_records ORDER BY id')).rows.map(row=>row.id),[id(20)]);
  await as(partner,owner);
  assert.deepEqual((await db.query('SELECT display_name FROM user_preferences')).rows,[{display_name:'Sam'}]);
  const backup=await call('export_finance_backup');
  assert.deepEqual(backup.tables.finance_records.map(row=>row.id),[id(20)],'backups are always of one\'s own finances');
  assert.equal(await count('user_preferences',`user_id='${owner}'`),0);
  assert.equal((await db.query(`UPDATE user_preferences SET display_name='x' WHERE user_id='${owner}'`)).affectedRows??0,0);

  // Nobody reaches a third person's data through a household.
  await as(partner,stranger);
  await assert.rejects(db.query('SELECT count(*) FROM finance_records'),/no longer have access/);
  await as(stranger,owner);
  await assert.rejects(db.query('SELECT count(*) FROM transaction_tags'),/no longer have access/);
  await as(stranger);
  assert.equal(await count('finance_records',`user_id<>'${stranger}'`),0);
  assert.equal(await count('transaction_tags'),0);

  // A viewer reads everything and changes nothing, whichever way they try.
  await as(owner);
  const viewing=await call('create_household_invite','viewer');
  await as(viewer);await call('accept_household_invite',viewing.token);
  await as(viewer,owner);
  assert.equal(await count('finance_records'),3);
  assert.equal(await count('transaction_tags'),2);
  await assert.rejects(save({id:id(30),name:'Coffee',kind:'Living expense',amount:3,account_id:id(10)}),/view-only|row-level security/);
  await assert.rejects(save({id:id(11),name:'Renamed',kind:'Living expense',amount:30,account_id:id(10)},),/view-only|row-level security|changed since/);
  await assert.rejects(db.query(`SELECT move_item_to_deleted($1,'finance_records')`,[id(11)]),/view-only/);
  await assert.rejects(call('set_transaction_member',[id(11)],owner),/view-only/);
  await assert.rejects(db.query(`INSERT INTO transaction_tags(id,name,color) VALUES($1,'Nope','teal')`,[id(31)]),/row-level security|view-only/);
  await assert.rejects(db.query(`UPDATE transaction_tags SET name='x'`),/view-only/);
  await assert.rejects(db.query(`DELETE FROM transaction_tags`),/view-only/);
  await assert.rejects(db.query(`UPDATE finance_records SET name='x' WHERE id=$1`,[id(11)]),/view-only/);
  assert.equal(await count('transaction_tags'),2);
  // An invite a viewer creates is for their own household.
  await as(viewer);
  const own=await call('create_household_invite','member');
  assert.deepEqual((await call('household_state')).invites.map(item=>item.id),[own.id]);
  await db.query('SELECT revoke_household_invite($1)',[own.id]);

  // Attachments: household members open the owner's files; only members add or remove them.
  const file=`${owner}/${id(11)}/${id(50)}.jpg`;
  await as(partner,owner);
  await db.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',$1)`,[file]);
  await as(viewer,owner);
  assert.equal(await count('storage.objects'),1);
  await assert.rejects(db.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',$1)`,[`${owner}/${id(11)}/${id(51)}.jpg`]),/row-level security/);
  assert.equal((await db.query('DELETE FROM storage.objects')).affectedRows??0,0);
  await as(stranger);
  assert.equal(await count('storage.objects'),0);

  // The owner manages roles and people; nobody else can.
  await as(partner);
  await assert.rejects(call('set_household_role',viewer,'member'),/no longer in your household/);
  await assert.rejects(db.query('SELECT remove_household_member($1,$2)',[owner,viewer]),/Only the owner/);
  await as(owner);
  const state=await call('household_state');
  assert.deepEqual(state.members.map(member=>[member.id,member.name,member.role]),[[partner,'Sam','member'],[viewer,'viewer@example.com','viewer']]);
  assert.deepEqual(state.invites,[]);
  await db.query('SELECT set_household_role($1,$2)',[viewer,'member']);
  await as(viewer,owner);
  await save({id:id(32),name:'Coffee',kind:'Living expense',amount:3,account_id:id(10)});
  await as(viewer);
  assert.deepEqual((await call('household_state')).memberships,[{owner_id:owner,name:'Alex',role:'member'}]);
  // Leaving ends access at once.
  await db.query('SELECT remove_household_member($1,$2)',[owner,viewer]);
  await as(viewer,owner);
  await assert.rejects(db.query('SELECT count(*) FROM finance_records'),/no longer have access/);
  // Removing a member ends their access at once; records they added stay with the owner.
  await as(owner);
  await db.query('SELECT remove_household_member($1,$2)',[owner,partner]);
  await as(partner,owner);
  await assert.rejects(db.query('SELECT count(*) FROM finance_records'),/no longer have access/);
  await assert.rejects(save({id:id(24),name:'Late',kind:'Living expense',amount:1,account_id:id(10)}),/no longer have access/);
  await as(partner);
  assert.equal(await count('finance_records',`user_id='${owner}'`),0);
  assert.equal(await count('storage.objects'),0);
  await as(owner);
  assert.equal(await one('SELECT member_id FROM finance_records WHERE id=$1',[id(22)]).then(row=>row.member_id),partner);

  // Invites expire, can be withdrawn, and a household holds six people at most.
  const late=await call('create_household_invite','member');
  await db.exec('RESET ROLE');await db.query(`UPDATE household_invites SET expires_at=now()-interval '1 minute' WHERE accepted_at IS NULL`);await db.exec('SET ROLE authenticated');
  await as(stranger);
  await assert.rejects(call('accept_household_invite',late.token),/no longer valid/);
  await as(owner);
  const withdrawn=await call('create_household_invite','viewer');
  await db.query('SELECT revoke_household_invite($1)',[withdrawn.id]);
  await as(stranger);
  await assert.rejects(call('accept_household_invite',withdrawn.token),/no longer valid/);
  await as(owner);
  await assert.rejects(call('accept_household_invite',(await call('create_household_invite','member')).token),/your own household/);
  for(let n=0;n<4;n++)await call('create_household_invite','viewer');
  await assert.rejects(call('create_household_invite','viewer'),/up to six people/);
  await assert.rejects(call('create_household_invite','admin'),/Choose what they can do/);
 }finally{await db.close();}
});

test('every table with an owner is either shared with the household or personal, and only personal functions keep auth.uid()',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  const shared=(await db.query('SELECT public.shared_workspace_tables() AS t')).rows[0].t;
  const personalTables=['backup_manifests','backup_recovery_points','finance_restore_context','telegram_drafts','telegram_login_tokens','telegram_milestones','telegram_subscriptions','user_app_activity','user_preferences'];
  const owned=(await db.query(`SELECT c.table_name AS name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND c.column_name='user_id' AND t.table_type='BASE TABLE' ORDER BY 1`)).rows.map(row=>row.name);
  assert.deepEqual(owned.filter(name=>!shared.includes(name)&&!personalTables.includes(name)),[],'classify new tables in migration 100');
  for(const name of shared){
   const policies=(await db.query(`SELECT coalesce(qual,'')||coalesce(with_check,'') AS text,permissive FROM pg_policies WHERE schemaname='public' AND tablename=$1`,[name])).rows;
   assert.ok(policies.every(policy=>!policy.text.includes('auth.uid()')),name);
   assert.equal(policies.filter(policy=>policy.permissive==='RESTRICTIVE').length,3,name);
   assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid=('public.'||$1)::regclass AND tgname='guard_shared_write'`,[name])).rows[0].n,1,name);
  }
  for(const name of personalTables){
   const policies=(await db.query(`SELECT coalesce(qual,'')||coalesce(with_check,'') AS text FROM pg_policies WHERE schemaname='public' AND tablename=$1`,[name])).rows;
   assert.ok(policies.every(policy=>!policy.text.includes('active_owner')),name);
  }
  const functions=(await db.query(`SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc LIKE '%auth.uid()%' ORDER BY 1`)).rows.map(row=>row.proname);
  assert.deepEqual(functions,['accept_household_invite','active_owner','attachment_folder_readable','attribute_finance_record','can_read_owner','can_write_owner','create_household_invite',
   'export_finance_backup','export_finance_backup_before_movements','export_finance_backup_before_transaction_tools','finance_backup_state','finance_restore_active',
   'get_backup_recovery','guard_shared_write','household_state','mark_app_started','open_household_invite','preview_finance_restore','preview_household_invite',
   'remove_household_member','restore_finance_backup','revoke_household_invite','set_household_role']);
 }finally{await db.close();}
});
