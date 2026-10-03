import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const legal=loadTS('lib/legal.ts');
const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));

test('the terms and privacy policy name the operator and contact, and never tie the app to a country',()=>{
 for(const document of [legal.termsOfUse,legal.privacyPolicy]){
  const text=JSON.stringify(document);
  assert.ok(text.includes(legal.legalContact),document.kind);
  assert.ok(document.sections.length>=6,document.kind);
  for(const section of document.sections){assert.ok(section.heading.trim());assert.ok(section.paragraphs.length);}
  assert.doesNotMatch(text,/Uzbekistan|governed by the laws of|\[[A-Z ]+\]|TODO|TBD/i,document.kind);
  assert.equal(new Set(document.sections.map(section=>section.heading)).size,document.sections.length,'section headings are keys, so they must be unique');
 }
 assert.ok(JSON.stringify(legal.privacyPolicy).includes(legal.legalOperator));
 assert.match(legal.legalUpdated,/^\d{4}-\d{2}-\d{2}$/);
 assert.deepEqual(legal.legalPaths,{terms:'/terms',privacy:'/privacy'});
});

test('the privacy policy lists every outside service the code talks to',()=>{
 const text=JSON.stringify(legal.privacyPolicy);
 for(const name of ['Supabase','Vercel','Telegram','Google','Cloudflare R2','Twelve Data','Coinbase','Kraken','Bitfinex','ExchangeRate-API'])assert.ok(text.includes(name),name);
});

test('both pages exist, are public, and link to each other; sign-in and sign-up link to them',()=>{
 for(const [route,kind] of [['app/terms/page.tsx','terms'],['app/privacy/page.tsx','privacy']]){
  const source=fs.readFileSync(route,'utf8');
  assert.match(source,new RegExp(`<LegalPage kind="${kind}"/>`));
  assert.ok(!route.includes('(workspace)'),'outside the signed-in workspace');
 }
 const page=fs.readFileSync('components/legal-page.tsx','utf8');
 assert.match(page,/legalPaths\[other\]/);assert.match(page,/formatDate\(legalUpdated,locale\)/);
 assert.match(fs.readFileSync('components/auth-card.tsx','utf8'),/legalPaths\.terms[\s\S]*legalPaths\.privacy/);
 assert.match(fs.readFileSync('components/account-access-card.tsx','utf8'),/<p className=\{styles\.consent\}>\{t\('By creating an account/);
 for(const key of ['Terms of use','Privacy policy','Last updated: {date}','This document is available in English.','Back to Hoggish','Legal','By creating an account, you agree to the terms of use and privacy policy.'])assert.ok(en[key],key);
});
