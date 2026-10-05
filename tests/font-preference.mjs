import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { applyFont, defaultFont, fontBootScript, fontIds, fonts, fontStorageKey, isFont, resolveFont } from '../lib/fonts.ts';
import { defaultPreferences } from '../lib/currencies.ts';
import {stylesheet} from './helpers/stylesheet.mjs';

test('the font catalogue, the migration, the stylesheet and the boot script agree',()=>{
 assert.deepEqual(fontIds,['inter','onest']);
 assert.equal(defaultFont,'inter');
 assert.equal(defaultPreferences.font,'inter');
 for(const value of ['inter','onest'])assert.ok(isFont(value));
 for(const value of ['Inter','',null,undefined,42,'onest ']){assert.ok(!isFont(value));assert.equal(resolveFont(value),'inter');}
 assert.equal(resolveFont('onest'),'onest');
 const migration=fs.readFileSync('migrations/076_font_preference.sql','utf8');
 assert.match(migration,new RegExp(`CHECK \\(font IN \\(${fontIds.map(id=>`'${id}'`).join(',')}\\)\\)`));
 assert.match(migration,/DEFAULT 'inter'/);
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
 const css=stylesheet();
 for(const font of fonts)assert.ok(css.includes(`[data-font="${font.id}"]{--font-ui:${font.family},var(--font-system)}`),font.id);
 assert.match(css,/^\s*--font-sans: var\(--font-ui\);$/m);
 assert.match(css,/^body\{[^\n]*font-family:var\(--font-ui\)/m);
 const layout=fs.readFileSync('app/layout.tsx','utf8');
 for(const font of fonts)assert.ok(layout.includes(`import "@fontsource-variable/${font.id}";`),font.id);
 assert.ok(layout.includes('__html: fontBootScript'));
 // Onest ships Cyrillic subsets, so Russian and Uzbek Cyrillic text use the same face as Latin.
 const onest=fs.readFileSync('node_modules/@fontsource-variable/onest/index.css','utf8');
 assert.match(onest,/unicode-range: U\+0301,U\+0400-045F/);
});

test('the boot script restores the saved font before hydration and ignores unknown values',()=>{
 for(const [saved,expected] of [['onest','onest'],['inter','inter'],['comic-sans',undefined],[null,undefined]]){
  const documentElement={dataset:{}};
  const localStorage={getItem:key=>key===fontStorageKey?saved:null};
  new Function('document','localStorage',fontBootScript)({documentElement},localStorage);
  assert.equal(documentElement.dataset.font,expected,String(saved));
 }
 const documentElement={dataset:{}};
 new Function('document','localStorage',fontBootScript)({documentElement},{getItem(){throw Error('blocked');}});
 assert.equal(documentElement.dataset.font,undefined);
});

test('applying a font marks the root and remembers it only for signed-in accounts',()=>{
 const stored={};
 globalThis.localStorage={setItem:(key,value)=>{stored[key]=value;}};
 try{
  const root={dataset:{}};
  applyFont('onest',true,root);
  assert.equal(root.dataset.font,'onest');
  assert.equal(stored[fontStorageKey],'onest');
  applyFont('inter',false,root);
  assert.equal(root.dataset.font,'inter');
  assert.equal(stored[fontStorageKey],'onest');
  globalThis.localStorage={setItem(){throw Error('blocked');}};
  applyFont('onest',true,root);
  assert.equal(root.dataset.font,'onest');
 }finally{delete globalThis.localStorage;}
});

test('font migration keeps existing owners on Inter, rejects unknown fonts and respects owner RLS',async()=>{
 const db=new PGlite();
 const owner='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO authenticated; INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  const original=fs.readFileSync('migrations/004_settings_and_fiat_currencies.sql','utf8');
  await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.user_preferences'),original.indexOf('-- Run after the lending-date')));
  await db.exec(`INSERT INTO user_preferences(user_id,language,currencies) VALUES('${owner}','ru',ARRAY['UZS','USD']);`);
  for(let run=0;run<2;run++)await db.exec(fs.readFileSync('migrations/076_font_preference.sql','utf8'));
  assert.deepEqual((await db.query('SELECT language,currencies,font FROM user_preferences')).rows,[{language:'ru',currencies:['UZS','USD'],font:'inter'}]);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}'; UPDATE user_preferences SET font='onest';`);
  assert.equal((await db.query('SELECT font FROM user_preferences')).rows[0].font,'onest');
  await assert.rejects(db.exec("UPDATE user_preferences SET font='comic-sans'"),/check constraint/);
  await assert.rejects(db.exec("UPDATE user_preferences SET font=NULL"),/null value/);
  await db.exec(`SET request.jwt.claim.sub='${other}'; UPDATE user_preferences SET font='inter' WHERE user_id='${owner}';`);
  await db.exec(`INSERT INTO user_preferences(user_id) VALUES('${other}');`);
  assert.equal((await db.query('SELECT font FROM user_preferences')).rows[0].font,'inter');
  await db.exec(`SET request.jwt.claim.sub='${owner}';`);
  assert.equal((await db.query('SELECT font FROM user_preferences')).rows[0].font,'onest');
 }finally{await db.close();}
});
