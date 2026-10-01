import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';

const {languageCatalogue,languageCodes,pdfUnsupportedLanguages}=loadTS('lib/languages.ts');
const {dictionaries,locales,isLanguage,directionOf}=loadTS('lib/i18n.ts');
const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
const placeholders=text=>[...text.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort().join();
const tags=text=>[...text.matchAll(/<\/?\w+[^>]*>/g)].map(match=>match[0]).sort().join();

test('the catalogue lists thirty languages with a locale, a direction and a dictionary each',()=>{
 assert.equal(languageCatalogue.length,30);
 assert.equal(new Set(languageCodes).size,30);
 assert.deepEqual([...languageCodes].sort(),['ar','bn','en','es','es-MX','fr','hi','ja','ko','pt','ru','th','uz','ur','vi','zh','de','it','tr','id','ms','pl','uk','nl','cs','ro','fa','he','fil','sw'].sort());
 for(const {code,locale,dir,native,short} of languageCatalogue){
  assert.ok(isLanguage(code),code);
  assert.equal(locales[code],locale);
  assert.ok(dictionaries[code]&&Object.keys(dictionaries[code]).length>1000,code);
  assert.ok(native&&short,code);
  assert.equal(directionOf(code),dir);
  // Every locale must be a valid Intl locale that formats numbers and money.
  assert.ok(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(1234).length>3,locale);
 }
 assert.deepEqual(languageCatalogue.filter(item=>item.dir==='rtl').map(item=>item.code),['ar','ur','fa','he']);
 assert.ok(!isLanguage('xx')&&!isLanguage('EN')&&!isLanguage(undefined));
 // The bundled PDF font covers Latin and Cyrillic only.
 for(const code of ['en','es','es-MX','pt','fr','ru','vi','uz','de','it','tr','id','ms','pl','uk','nl','cs','ro','fil','sw'])assert.ok(!pdfUnsupportedLanguages.includes(code),code);
 for(const code of ['ar','ur','hi','bn','zh','ja','ko','th','fa','he'])assert.ok(pdfUnsupportedLanguages.includes(code),code);
});

test('Latin digits are used for amounts in every language, so inputs and totals stay readable',()=>{
 for(const {code,locale} of languageCatalogue){
  const formatted=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(1234567);
  assert.match(formatted,/^[0-9\s.,'’  ٬٫]+$/,`${code}: ${formatted}`);
 }
});

test('every dictionary translates every English key, keeping placeholders and markup intact',()=>{
 for(const {code} of languageCatalogue){
  if(code==='en')continue;
  const dictionary=dictionaries[code];
  const missing=Object.keys(en).filter(key=>typeof dictionary[key]!=='string'||!dictionary[key].trim());
  assert.deepEqual(missing.slice(0,3),[],`${code}: ${missing.length} missing`);
  for(const [key,value] of Object.entries(en)){
   assert.equal(placeholders(dictionary[key]),placeholders(value),`${code}: ${key}`);
   assert.equal(tags(dictionary[key]),tags(value),`${code}: ${key}`);
  }
  assert.deepEqual(Object.keys(dictionary).filter(key=>!(key in en)).slice(0,3),[],`${code}: extra keys`);
 }
});

test('each language file is really translated, not a copy of the English text',()=>{
 const words=Object.entries(en).filter(([,value])=>/[A-Za-z]{4,}/.test(value));
 for(const {code} of languageCatalogue){
  if(code==='en'||code==='es-MX')continue;
  const same=words.filter(([key,value])=>dictionaries[code][key]===value).length;
  // Names, codes, acronyms and shared words such as "Total" stay the same.
  assert.ok(same/words.length<0.06,`${code}: ${same} of ${words.length} values are still English`);
 }
 assert.strictEqual(dictionaries['es-MX'],dictionaries.es);
});

test('key finance labels differ between languages, and the confirmation word stays typeable',()=>{
 for(const {code} of languageCatalogue){
  if(code==='en')continue;
  for(const key of ['Overview','Settings','Net worth','Savings goals'])assert.notEqual(dictionaries[code][key],key,`${code}: ${key}`);
  // Account deletion compares what the owner types with the word DELETE.
  assert.ok(dictionaries[code]['Type DELETE to confirm'].includes('DELETE'),code);
 }
});
