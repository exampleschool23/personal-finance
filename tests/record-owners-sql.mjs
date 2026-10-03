import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,partner,stranger]=[1,2,3].map(id);

test('the fresh setup includes migration 102',()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/102_record_owners.sql','utf8');
 assert.ok(setup.includes(migration),'the fresh setup includes the migration');
 assert.equal(migration.split('auth.uid()').length-1,1,'only the trigger naming who added a record reads auth.uid(); functions on shared tables use active_owner()');
});

test('accounts and transactions belong to the household or to one person, and transactions follow their account',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
   INSERT INTO auth.users VALUES('${owner}','owner@example.com'),('${partner}','partner@example.com'),('${stranger}','stranger@example.com');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  const as=async(user,workspace=null)=>db.exec(`SET request.jwt.claim.sub='${user}';SET request.headers='${JSON.stringify(workspace?{'x-workspace-owner':workspace}:{})}';`);
  const save=(record,revision=null)=>db.query('SELECT save_finance_record($1::jsonb,$2) AS r',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-01-01',...record}),revision]).then(result=>result.rows[0].r[0]);
  const call=(fn,...args)=>db.query(`SELECT ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args).then(result=>result.rows[0].r);
  const ownerOf=async record=>{const row=(await db.query('SELECT shared,member_id FROM finance_records WHERE id=$1',[record])).rows[0];return row.shared?'shared':row.member_id;};

  // Alone: everything is shared, whoever it is entered by.
  await as(owner);
  await save({id:id(10),name:'Joint checking',kind:'Cash',amount:1000});
  await save({id:id(11),name:'Groceries',kind:'Living expense',amount:30,account_id:id(10)});
  await save({id:id(12),name:'Found money',kind:'Other income',amount:5});
  assert.deepEqual(await Promise.all([10,11,12].map(n=>ownerOf(id(n)))),['shared','shared','shared']);
  await as(stranger);
  await save({id:id(40),name:'Private',kind:'Cash',amount:500});

  await as(owner);
  const invite=await call('create_household_invite','member');
  await as(partner);await call('accept_household_invite',invite.token);
  await as(partner,owner);
  const dinner=await save({id:id(13),name:'Dinner',kind:'Living expense',amount:45,account_id:id(10)});
  assert.deepEqual([dinner.shared,dinner.member_id],[true,partner],'a shared record still names who added it');

  // One transaction is given to the owner by hand; the account then goes to the partner and takes the rest along.
  assert.equal(await call('set_record_owner',[id(11)],owner),1);
  assert.equal(await call('set_record_owner',[id(11)],owner),0);
  assert.equal(await call('set_account_owner',id(10),partner),1,'only the transaction that followed the account moves');
  assert.equal(await call('set_account_owner',id(10),partner),0);
  assert.deepEqual(await Promise.all([10,11,12,13].map(n=>ownerOf(id(n)))),[partner,owner,'shared',partner]);

  // New transactions take their account's owner unless one is given.
  await as(owner);
  await save({id:id(14),name:'Fuel',kind:'Other expense',amount:20,account_id:id(10)});
  await save({id:id(15),name:'Mine',kind:'Other expense',amount:20,account_id:id(10),member_id:owner});
  await save({id:id(16),name:'Ours',kind:'Other expense',amount:20,account_id:id(10),shared:true});
  await save({id:id(17),name:'Named',kind:'Other expense',amount:20,account_id:id(10),member_id:partner,shared:false});
  await save({id:id(18),name:'Outsider',kind:'Other expense',amount:20,account_id:id(10),member_id:stranger,shared:false});
  assert.deepEqual(await Promise.all([14,15,16,17,18].map(n=>ownerOf(id(n)))),[partner,owner,'shared',partner,'shared']);

  // Saving a record again without naming an owner keeps it.
  const fuel=(await db.query('SELECT revision FROM finance_records WHERE id=$1',[id(14)])).rows[0];
  await save({id:id(14),name:'Fuel and oil',kind:'Other expense',amount:20,account_id:id(10)},fuel.revision);
  assert.equal(await ownerOf(id(14)),partner);

  // Sharing the account again brings back what followed it; choices made by hand stay.
  assert.equal(await call('set_account_owner',id(10),null),3);
  assert.deepEqual(await Promise.all([10,11,13,14,15,17].map(n=>ownerOf(id(n)))),['shared',owner,'shared','shared',owner,'shared']);
  assert.equal(await call('set_record_owner',[id(11),id(15)],null),2);

  // Investment accounts: the holdings inside follow.
  await db.query(`INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES($1,$2,'Brokerage','Stock','USD')`,[id(20),owner]);
  await save({id:id(21),name:'AAPL',kind:'Stock',amount:100,quantity:2,holding_account_id:id(20)});
  assert.equal(await ownerOf(id(21)),'shared');
  assert.equal(await call('set_account_owner',id(20),partner),1);
  assert.equal((await db.query('SELECT member_id FROM holding_accounts WHERE id=$1',[id(20)])).rows[0].member_id,partner);
  await save({id:id(22),name:'MSFT',kind:'Stock',amount:100,quantity:1,holding_account_id:id(20)});
  assert.deepEqual(await Promise.all([21,22].map(n=>ownerOf(id(n)))),[partner,partner]);
  assert.equal(await call('set_account_owner',id(20),null),2);
  assert.equal((await db.query('SELECT member_id FROM holding_accounts WHERE id=$1',[id(20)])).rows[0].member_id,null);

  // Only people of this household own things, and only this workspace's accounts change.
  await assert.rejects(call('set_account_owner',id(10),stranger),/no longer in your household/);
  await assert.rejects(call('set_record_owner',[id(11)],stranger),/no longer in your household/);
  await assert.rejects(call('set_account_owner',id(40),partner),/Choose one of your accounts/);
  await assert.rejects(call('set_account_owner',id(11),partner),/Choose one of your accounts/,'a transaction is not an account');
  await assert.rejects(call('set_record_owner',Array.from({length:501},(_,n)=>id(1000+n)),null),/Check the record fields/);
  assert.equal(await call('set_record_owner',[id(40)],owner),0);

  // The partner's own workspace is untouched, and what they own here is shared again once they are named after leaving.
  await as(partner,owner);
  assert.equal(await call('set_account_owner',id(10),partner),7,'every shared transaction of the account follows it');
  await as(owner);
  await db.query('SELECT remove_household_member($1,$2)',[owner,partner]);
  const kept=(await db.query('SELECT revision,member_id,shared FROM finance_records WHERE id=$1',[id(13)])).rows[0];
  assert.deepEqual([kept.member_id,kept.shared],[partner,false],'records keep their owner until they are next saved');
  await save({id:id(13),name:'Dinner out',kind:'Living expense',amount:45,account_id:id(10),member_id:partner,shared:false},kept.revision);
  assert.equal(await ownerOf(id(13)),'shared');
  await assert.rejects(call('set_account_owner',id(10),partner),/no longer in your household/);
 }finally{await db.close();}
});
