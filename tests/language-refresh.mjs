import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('provider module refresh preserves the context identity and selected language',()=>{
 const context={current:{language:'uz',setLanguage(){},setDefaultLanguage(){}}};
 const source=fs.readFileSync('components/language-provider.tsx','utf8').replace(/^import .*;\n/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const reload=()=>{const exports={};new Function('exports','LanguageContext','useContext','locales','translate',js)(exports,context,c=>c.current,{uz:'uz-UZ'},(lang,key)=>lang+':'+key);return exports;};
 const before=reload().useLanguage();
 const after=reload().useLanguage();
 assert.equal(after.language,'uz');assert.equal(after.setLanguage,before.setLanguage);
 assert.equal(after.t('Income'),'uz:Income');
 context.current=null;
 assert.throws(()=>reload().useLanguage(),/within LanguageProvider/);
});
