import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`74000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const read=name=>fs.readFileSync(`migrations/${name}.sql`,'utf8');
const [m135,m136,m137]=['135_link_earlier_payments','136_link_payments_as_database','137_category_bills'].map(read);
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);return d;}
const insert=(d,n,fields,owner=1)=>{const keys=Object.keys(fields);return d.query(`INSERT INTO finance_records(id,user_id,${keys.join(',')}) VALUES($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')})`,[id(n),id(owner),...Object.values(fields)]);};
const month=offset=>{const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+offset,1)).toISOString().slice(0,7);};
const named=async(d,n)=>{const row=(await d.query('SELECT occurrence_record_id,occurrence_due_on::text AS due FROM finance_records WHERE id=$1',[id(n)])).rows[0];return [row.occurrence_record_id,row.due];};
const occurrences=async d=>(await d.query('SELECT record_id,due_on::text AS due_on,transaction_id FROM payment_occurrences ORDER BY due_on')).rows.map(row=>[row.record_id,row.due_on,row.transaction_id]);

// "Dildora" is a custom spending category paid around the 5th; its payments came from a spending plan with mixed kinds.
const categories=d=>d.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,'Dildora','expense'),($3,$2,'Gym','expense')",[id(5),id(1),id(6)]);
const bill=(d,n=10,fields={})=>insert(d,n,{name:'Dildora',kind:'Other expense',currency:'USD',amount:250,date:`${month(-2)}-05`,frequency:'Monthly',custom_category_id:id(5),...fields});
const pay=(d,n,date,fields={},owner=1)=>insert(d,n,{name:'Dildora',kind:'Living expense',currency:'USD',amount:250,date,frequency:'Once',custom_category_id:id(5),...fields},owner);

test('migrations 135 to 137 are in setup.sql and safe to re-run',async()=>{
 for(const sql of [m135,m136,m137])assert.ok(setup.includes(sql));
 const d=await db(setup.slice(0,setup.indexOf(m135)));
 try{for(const sql of [m135,m136,m137,m137])await d.exec(sql);}finally{await d.close();}
});

test('saving a bill gives it its category’s history, whatever the spending kind',async()=>{
 const d=await db(setup);
 try{
  await categories(d);
  await pay(d,20,`${month(-3)}-28`);                                  // before the bill starts
  await pay(d,21,`${month(-2)}-05`);
  await pay(d,22,`${month(-2)}-20`,{amount:40,kind:'Charity'});       // a second payment that month adds to it
  await pay(d,23,`${month(-1)}-06`,{currency:'EUR',amount:230,kind:'Other expense'});
  await pay(d,24,`${month(-1)}-07`,{custom_category_id:id(6),name:'Gym'});
  await bill(d);
  assert.deepEqual(await occurrences(d),[[id(10),`${month(-2)}-05`,id(21)],[id(10),`${month(-1)}-05`,id(23)]]);
  assert.deepEqual([await named(d,21),await named(d,22),await named(d,23)],[[id(10),`${month(-2)}-05`],[id(10),`${month(-2)}-05`],[id(10),`${month(-1)}-05`]]);
  for(const n of [20,24])assert.deepEqual(await named(d,n),[null,null],`payment ${n} stays as it was`);
 }finally{await d.close();}
});

test('a new payment in the category settles its bill; built-in kinds and archived bills do not take payments',async()=>{
 const d=await db(setup);
 try{
  await categories(d);
  await bill(d);
  await pay(d,30,`${month(0)}-01`);
  assert.deepEqual(await named(d,30),[id(10),`${month(0)}-05`],'no schedule named, the category’s bill is taken');
  await insert(d,11,{name:'Food',kind:'Living expense',currency:'USD',amount:100,date:`${month(-2)}-01`,frequency:'Monthly'});
  await insert(d,31,{name:'Food',kind:'Living expense',currency:'USD',amount:100,date:`${month(0)}-01`,frequency:'Once'});
  assert.deepEqual(await named(d,31),[null,null],'a built-in kind names a schedule by hand');
  await d.exec(`UPDATE finance_records SET archived=true WHERE id='${id(10)}'`);
  await pay(d,32,`${month(0)}-02`);
  assert.deepEqual(await named(d,32),[null,null],'an archived bill takes nothing');
 }finally{await d.close();}
});

test('a payment edited or recategorised into the category settles its bill; a linked payment keeps its schedule',async()=>{
 const d=await db(setup);
 try{
  await categories(d);
  await bill(d);
  await insert(d,40,{name:'Transfer to Dildora',kind:'Living expense',currency:'USD',amount:250,date:`${month(0)}-01`,frequency:'Once'});
  assert.deepEqual(await named(d,40),[null,null],'uncategorised, it names no schedule');
  await d.query('UPDATE finance_records SET custom_category_id=$1 WHERE id=$2',[id(5),id(40)]);
  assert.deepEqual(await named(d,40),[id(10),`${month(0)}-05`],'the edit names the category’s bill');
  assert.deepEqual(await occurrences(d),[[id(10),`${month(0)}-05`,id(40)]],'and settles the month');
  await insert(d,41,{name:'Dildora',kind:'Living expense',currency:'USD',amount:250,date:`${month(-1)}-03`,frequency:'Once'});
  const moved=(await d.query('SELECT recategorize_transactions($1::uuid[],$2,$3) AS ids',[[id(41)],'Other expense',id(5)])).rows[0].ids;
  assert.deepEqual(moved,[id(41)]);
  assert.deepEqual(await named(d,41),[id(10),`${month(-1)}-05`],'a bulk recategorisation names it too');
  assert.deepEqual(await occurrences(d),[[id(10),`${month(-1)}-05`,id(41)],[id(10),`${month(0)}-05`,id(40)]]);
  await d.query('UPDATE finance_records SET date=$1 WHERE id=$2',[`${month(0)}-02`,id(40)]);
  await d.query('UPDATE finance_records SET custom_category_id=$1 WHERE id=$2',[id(6),id(41)]);
  assert.deepEqual([await named(d,40),await named(d,41)],[[id(10),`${month(0)}-05`],[id(10),`${month(-1)}-05`]],'a saved payment keeps its schedule through later edits');
  assert.equal((await occurrences(d)).length,2);
 }finally{await d.close();}
});

test('a bill links only its owner’s payments, and a payment only its owner’s bill',async()=>{
 const d=await db(setup);
 try{
  await categories(d);
  await d.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,'Dildora','expense')",[id(7),id(2)]);
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await pay(d,50,`${month(-1)}-05`,{custom_category_id:id(7)},2);                       // the other owner, before either bill
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  await pay(d,21,`${month(-1)}-05`);
  await bill(d);
  assert.deepEqual(await named(d,21),[id(10),`${month(-1)}-05`]);
  assert.deepEqual(await named(d,50),[null,null],'the other owner’s payment is not the bill’s history');
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await insert(d,13,{name:'Dildora',kind:'Other expense',currency:'USD',amount:250,date:`${month(-2)}-05`,frequency:'Monthly',custom_category_id:id(7)},2);
  await pay(d,51,`${month(0)}-01`,{custom_category_id:id(7)},2);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  await pay(d,30,`${month(0)}-01`);
  assert.deepEqual([await named(d,50),await named(d,51),await named(d,30)],[[id(13),`${month(-1)}-05`],[id(13),`${month(0)}-05`],[id(10),`${month(0)}-05`]]);
  const byOwner=(await d.query('SELECT user_id,record_id,transaction_id FROM payment_occurrences ORDER BY due_on,user_id')).rows;
  assert.deepEqual(byOwner,[{user_id:id(1),record_id:id(10),transaction_id:id(21)},{user_id:id(2),record_id:id(13),transaction_id:id(50)},{user_id:id(1),record_id:id(10),transaction_id:id(30)},{user_id:id(2),record_id:id(13),transaction_id:id(51)}]);
 }finally{await d.close();}
});

test('a category has one active bill; archiving it frees the category',async()=>{
 const d=await db(setup);
 try{
  await categories(d);
  await bill(d);
  await assert.rejects(bill(d,12),/finance_records_one_bill_per_category/);
  await d.exec(`UPDATE finance_records SET archived=true WHERE id='${id(10)}'`);
  await bill(d,12);
  await assert.rejects(d.query(`UPDATE finance_records SET archived=false WHERE id='${id(10)}'`),/finance_records_one_bill_per_category/);
 }finally{await d.close();}
});

test('migration 137 names bills that share a category instead of guessing which to keep',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(m137)));
 try{
  await categories(d);
  await bill(d);await bill(d,12,{name:'Dildora again'});
  await assert.rejects(d.exec(m137),/share a category: Dildora, Dildora again/);
 }finally{await d.close();}
});

test('bills saved before 137 take their history when it is applied',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(m137)));
 try{
  await categories(d);
  await bill(d);
  await pay(d,21,`${month(-1)}-05`);
  assert.deepEqual(await named(d,21),[null,null]);
  await d.exec(m137);
  assert.deepEqual(await named(d,21),[id(10),`${month(-1)}-05`]);
 }finally{await d.close();}
});
