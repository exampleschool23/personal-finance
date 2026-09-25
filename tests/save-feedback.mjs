import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const dictionaries=Object.fromEntries(['en','ru','uz'].map(language=>[language,JSON.parse(readFileSync(new URL(`../lib/locales/${language}.json`,import.meta.url),'utf8'))]));
function feedback(language='en') {
 const calls=[];
 const context={exports:{},document:{documentElement:{lang:language}},require(name){
  if(name==='sonner')return {toast:{success:(...args)=>calls.push(args)}};
  if(name==='@/lib/i18n')return {isLanguage:value=>['en','ru','uz'].includes(value),translate:(lang,key)=>dictionaries[lang][key]??key};
  throw Error(name);
 }};
 const source=readFileSync(new URL('../lib/save-feedback.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {show:context.exports.showSaved,calls};
}
test('save confirmation uses current language and contains no subtitle',()=>{
 for(const [language,label] of [['en','Saved'],['ru','Сохранено'],['uz','Saqlandi']]){
  const {show,calls}=feedback(language);show();
  assert.equal(calls[0][0],label);
  assert.equal(calls[0][1].description,undefined);
  assert.equal(calls[0][1].className,'save-confirmation');
  assert.equal(calls[0][1].duration,3000);
 }
});
test('settings language wins immediately and repeated saves reuse one popup',()=>{
 const {show,calls}=feedback('en');show('ru');show('uz');
 assert.equal(calls[0][0],'Сохранено');assert.equal(calls[1][0],'Saqlandi');
 assert.equal(calls[0][1].id,calls[1][1].id);
});
test('unknown document language falls back to English',()=>{
 const {show,calls}=feedback('invalid');show();assert.equal(calls[0][0],'Saved');
});
