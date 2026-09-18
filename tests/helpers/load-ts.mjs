import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Load the same pure helpers as production, retaining their dependency graph.
export function loadTS(file,overrides={},cache=new Map()){
 const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute).exports;
 const loaded={exports:{}};cache.set(absolute,loaded);
 const source=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=name=>{
  if(name in overrides)return overrides[name];
  if(!name.startsWith('.')&&!name.startsWith('@/'))return require(name);
  const root=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(absolute),name);
  const resolved=[root,root+'.ts',root+'.tsx',root+'.js',root+'.json'].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
  if(!resolved)throw Error('Missing dependency '+root);
  return resolved.endsWith('.json')?JSON.parse(fs.readFileSync(resolved,'utf8')):loadTS(resolved,overrides,cache);
 };
 new Function('require','module','exports',source)(localRequire,loaded,loaded.exports);return loaded.exports;
}
