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

// Text passed to t() as a literal, or as either branch of a condition, must be an English key; otherwise every
// language silently shows the English words. Texts built at run time (label tables, server messages) are not covered.
function translatedLiterals(source){
 const found=[];
 for(const match of source.matchAll(/(?<![\w.])t\(/g)){
  let index=match.index+match[0].length,depth=1,quote='';
  const start=index;
  for(;index<source.length&&depth>0;index++){
   const char=source[index];
   if(quote){if(char==='\\')index++;else if(char===quote)quote='';}
   else if(char==="'"||char==='"'||char==='`')quote=char;
   else if('([{'.includes(char))depth++;
   else if(')]}'.includes(char))depth--;
   else if(char===','&&depth===1)break;
  }
  const argument=source.slice(start,index);
  if(argument.includes('`')||!(/^\s*['"]/.test(argument)||argument.includes('?')))continue;
  for(const literal of argument.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)){
   const before=argument.slice(0,literal.index).trimEnd(),after=argument.slice(literal.index+literal[0].length).trimStart();
   // A literal compared with something, or handed to a function, is a value, not text to show.
   if(/[=!]==?$/.test(before)||/^[=!]==?/.test(after)||/\w\($/.test(before)||/^\]/.test(after)||/^in\b/.test(after))continue;
   const text=(literal[1]??literal[2]).replace(/\\(['"])/g,'$1');
   if(text)found.push(text);
  }
 }
 return found;
}
const sourceFiles=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(`${directory}/${entry.name}`):/\.tsx?$/.test(entry.name)?[`${directory}/${entry.name}`]:[]);

test('every text a component passes to t() is an English key, so no language falls back to English',()=>{
 assert.deepEqual(translatedLiterals("t(busy ? 'Saving…' : 'Save')+t('A, b')+t(kind === 'x' ? \"It's\" : labels[kind])+t(`skip ${1}`)+obj.t('no')+t(names.includes('y') ? 'Yes' : 'No')+t(({a:'Table'})[key??'a'])+t('own' in item ? 'Own' : 'Other')"),['Saving…','Save','A, b',"It's",'Yes','No','Table','Own','Other']);
 const missing=new Map();
 for(const file of ['components','app','hooks'].flatMap(sourceFiles))for(const text of translatedLiterals(fs.readFileSync(file,'utf8')))if(!(text in en))missing.set(text,file);
 assert.deepEqual([...missing],[]);
});

test('texts shown through label tables and server messages of business tracking are English keys too',()=>{
 const {setupGuide,businessAccountGroups,businessStructureLabels,paletteLabels}=loadTS('lib/business.ts');
 const {transactionPeriodLabels}=loadTS('lib/transaction-list.ts');
 const {taxLines,taxTemplateLabels}=loadTS('lib/business-tax.ts');
 const {reportRangeLabels}=loadTS('lib/business-report.ts');
 const texts=[...[true,false,null].flatMap(tracked=>setupGuide(tracked,true).flatMap(card=>[card.title,card.detail,card.action])),...businessAccountGroups.map(([label])=>label),...Object.values(businessStructureLabels),...Object.values(paletteLabels),
  ...Object.values(transactionPeriodLabels),...Object.values(reportRangeLabels),...taxLines.map(line=>line.label),...Object.values(taxTemplateLabels),'Line','Description','Gross income','Expenses','Net profit or loss'];
 // Messages the database raises for business tracking, rules and tags reach the person through t().
 for(const file of ['migrations/092_business_tracking.sql','migrations/093_rule_criteria.sql'])for(const match of fs.readFileSync(file,'utf8').matchAll(/RAISE EXCEPTION '((?:[^']|'')+)'/g))texts.push(match[1].replaceAll("''","'"));
 assert.deepEqual([...new Set(texts)].filter(text=>!(text in en)),[]);
});
