import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('the fresh setup includes migration 106, which keeps the counters away from signed-in people',()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/106_rate_limits.sql','utf8');
 assert.ok(setup.includes(migration),'the fresh setup includes the migration');
 assert.match(migration,/SECURITY DEFINER SET search_path=''/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.hit_rate_limit\(text,integer,integer\) FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(migration,/user_id/,'buckets are hashed keys, never an owner column');
});

test('hit_rate_limit counts each bucket and window on its own, prunes expired windows, and only the service role may call it',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  // Applying the migration again changes nothing.
  await db.exec(fs.readFileSync('migrations/106_rate_limits.sql','utf8'));
  const hit=async(bucket,max,seconds)=>(await db.query('SELECT public.hit_rate_limit($1,$2,$3) AS ok',[bucket,max,seconds])).rows[0].ok;
  await db.exec('SET ROLE service_role');
  assert.deepEqual([await hit('signin:ip:a',2,60),await hit('signin:ip:a',2,60),await hit('signin:ip:a',2,60)],[true,true,false]);
  assert.equal(await hit('signin:ip:b',2,60),true,'another address has its own count');
  assert.equal(await hit('signin:ip:a',5,3600),true,'a longer window on the same key counts separately');
  await assert.rejects(hit('',1,60),/Check the rate limit/);
  await assert.rejects(hit('x',0,60),/Check the rate limit/);
  await assert.rejects(hit('x',1,0),/Check the rate limit/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT hits FROM rate_limits WHERE bucket='signin:ip:a' AND window_seconds=60`)).rows[0].hits,3);
  await db.exec(`INSERT INTO rate_limits(bucket,window_seconds,window_start,hits,expires_at) VALUES('old',60,now()-interval '2 hours',9,now()-interval '1 hour')`);
  await db.exec('SET ROLE service_role');await hit('signin:ip:c',1,60);await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM rate_limits WHERE bucket='old'`)).rows[0].n,0,'expired windows are pruned');
  for(const role of ['anon','authenticated']){
   await db.exec(`SET ROLE ${role}`);
   await assert.rejects(hit('signin:ip:a',100,60),/permission denied/,role);
   await assert.rejects(db.query('SELECT * FROM rate_limits'),/permission denied/,role);
   await db.exec('RESET ROLE');
  }
 }finally{await db.close();}
});
