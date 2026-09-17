import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('daily snapshot upserts are owner-private, use Tashkent dates and cannot rewrite older days',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  const sql=fs.readFileSync('migrations/017_portfolio_snapshots.sql','utf8');assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(sql));await db.exec(sql);
  await db.exec(`INSERT INTO portfolio_snapshots(user_id,occurred_on,assets,debt,rates) VALUES('${owner}','2000-01-01',50,10,'{"USD":1}');SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const first=(await db.query(`SELECT capture_portfolio_snapshot(100,20,'{"USD":1}') AS snapshot,(now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day`)).rows[0];assert.equal(first.snapshot.occurred_on,first.day);
  await db.query(`SELECT capture_portfolio_snapshot(200,20,'{"USD":1}')`);
  const rows=(await db.query('SELECT * FROM portfolio_snapshots ORDER BY occurred_on')).rows;assert.equal(rows.length,2);assert.equal(Number(rows[0].assets),50);assert.equal(Number(rows[1].assets),200);
  await assert.rejects(db.query('UPDATE portfolio_snapshots SET assets=999'),/permission denied/);
  await assert.rejects(db.query(`SELECT capture_portfolio_snapshot(200,20,'{"USD":1,"EUR":0}')`),/Invalid exchange rates/);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);assert.equal((await db.query('SELECT * FROM portfolio_snapshots')).rows.length,0);
  await db.query(`SELECT capture_portfolio_snapshot(300,0,'{"USD":1}')`);assert.equal((await db.query('SELECT * FROM portfolio_snapshots')).rows.length,1);
  await db.exec(`SET request.jwt.claim.sub='';`);await assert.rejects(db.query(`SELECT capture_portfolio_snapshot(1,0,'{"USD":1}')`),/Please sign in/);
 }finally{await db.close();}
});
