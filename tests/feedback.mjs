import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const dictionaries=Object.fromEntries(['en','ru','uz'].map(language=>[language,JSON.parse(readFileSync(new URL(`../lib/locales/${language}.json`,import.meta.url),'utf8'))]));
function feedback(language='en') {
 const calls=[],raw=[];
 const context={exports:{},document:{documentElement:{lang:language}},require(name){
  if(name==='sonner')return {toast:{success:(...args)=>{calls.push(args);raw.push(['success',...args]);},error:(...args)=>raw.push(['error',...args])}};
  if(name==='@/lib/i18n')return {isLanguage:value=>['en','ru','uz'].includes(value),translate:(lang,key)=>dictionaries[lang][key]??key};
  throw Error(name);
 }};
 const source=readFileSync(new URL('../lib/feedback.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {show:context.exports.showSaved,showDeleted:context.exports.showDeleted,showError:context.exports.showError,showNotice:context.exports.showNotice,calls,raw};
}
test('save confirmation uses current language and contains no subtitle',()=>{
 for(const [language,label] of [['en','Saved'],['ru','Сохранено'],['uz','Saqlandi']]){
  const {show,calls}=feedback(language);show();
  assert.equal(calls[0][0],label);
  assert.equal(calls[0][1].description,undefined);
  assert.equal(calls[0][1].className,'app-feedback save-confirmation');
  assert.equal(calls[0][1].duration,3000);
 }
});
test('a finished delete says Deleted in the Saved popup, in the current language',()=>{
 for(const language of ['en','ru','uz']){
  const {showDeleted,calls}=feedback(language);showDeleted();
  assert.equal(calls[0][0],dictionaries[language].Deleted);
  assert.equal(calls[0][1].id,'save-confirmation');assert.equal(calls[0][1].className,'app-feedback save-confirmation');
 }
});
// 7 October 2026: every user-initiated change answers with a toast, deletes and restores included.
test('deletes, restores and detail-dialog changes confirm with a toast',()=>{
 const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
 for(const path of ['components/workspace/state/use-record-save.ts','components/delete-category-dialog.tsx','hooks/use-expense-plans.ts','components/record-attachments.tsx','components/investment-tracker.tsx','hooks/use-tags.ts','hooks/use-transaction-rules.ts'])assert.match(read(path),/showDeleted\(\)/,path);
 assert.match(read('components/recently-deleted.tsx'),/if\(permanent\)showDeleted\(\);else showNotice\('Restored'\)/);
 assert.match(read('components/import-history.tsx'),/showNotice\('Import undone'\)/);
 const details=read('components/transaction-details-dialog.tsx');
 assert.match(details,/setRecord\(\{\.\.\.record,business_id:next\}\);showSaved\(\);/);assert.match(details,/\[\.\.\.tagIds,id\]\);showSaved\(\);/);
 assert.match(read('components/workspace/workspace-provider.tsx'),/showError\('Could not sign out\. Please try again\.'\)/,'a failed sign-out is shown on any screen');
 for(const path of ['hooks/use-category-icons.ts','hooks/use-display-order.ts','hooks/use-goal-order.ts','hooks/use-dashboard-layout.ts'])assert.match(read(path),/if ?\(demo\) ?\{? ?showSaved\(\)/,`${path}: the sample workspace confirms too`);
});
test('settings language wins immediately and repeated saves reuse one popup',()=>{
 const {show,calls}=feedback('en');show('ru');show('uz');
 assert.equal(calls[0][0],'Сохранено');assert.equal(calls[1][0],'Saqlandi');
 assert.equal(calls[0][1].id,calls[1][1].id);
});
test('unknown document language falls back to English',()=>{
 const {show,calls}=feedback('invalid');show();assert.equal(calls[0][0],'Saved');
});
test('errors reuse the shared popup, translate known keys, and keep server messages',()=>{
 for(const [language,label] of [['en','Could not read the complete backup.'],['ru',dictionaries.ru['Could not read the complete backup.']],['uz',dictionaries.uz['Could not read the complete backup.']]]){
  const {showError,raw}=feedback(language);showError('Could not read the complete backup.');
  assert.equal(raw[0][0],'error');assert.equal(raw[0][1],label);
  assert.equal(raw[0][2].className,'app-feedback error-feedback');
  assert.equal(raw[0][2].id,'error-feedback');
  assert.equal(raw[0][2].description,undefined);
 }
 const {showError,raw}=feedback('ru');showError('Unexpected server text');showError('Could not read the complete backup.',{detail:'Retry the same payment to avoid duplicates.'});
 assert.equal(raw[0][1],'Unexpected server text');
 assert.equal(raw[1][2].description,dictionaries.ru['Retry the same payment to avoid duplicates.']);
 assert.equal(raw[0][2].id,raw[1][2].id);
});
test('empty errors show nothing',()=>{
 const {showError,raw}=feedback('en');showError('');assert.equal(raw.length,0);
});

test('notices use their own longer-lived popup, translate known keys and ignore empty text',()=>{
 for(const [language,label] of [['en','Check your email to verify your account.'],['ru',dictionaries.ru['Check your email to verify your account.']],['uz',dictionaries.uz['Check your email to verify your account.']]]){
  const {showNotice,calls}=feedback(language);showNotice('Check your email to verify your account.');
  assert.equal(calls[0][0],label);
  assert.equal(calls[0][1].id,'notice-feedback');
  assert.equal(calls[0][1].className,'app-feedback');
  assert.equal(calls[0][1].duration,8000);
 }
 const {showNotice,calls}=feedback('en');showNotice('');assert.equal(calls.length,0);
 showNotice('Account deleted.','ru'==='ru'?{language:'ru'}:{});assert.equal(calls[0][0],dictionaries.ru['Account deleted.']);
});
