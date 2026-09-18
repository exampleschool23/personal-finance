import fs from 'node:fs';
import ts from 'typescript';
export function harness(file,name,dependencies){
 const slots=[],pending=[];let cursor=0;
 const changed=(a,b)=>!a||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const hooks={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
  useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
  useCallback(callback,deps){const index=cursor++;if(changed(slots[index]?.deps,deps))slots[index]={deps,callback};return slots[index].callback;},
  useEffect(effect,deps){const index=cursor++;if(changed(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps};pending.push(()=>{old?.cleanup?.();slots[index].cleanup=effect();});}},
 };
 const bindings={...hooks,...dependencies};
 const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const hook=new Function(...Object.keys(bindings),js+`;return ${name};`)(...Object.values(bindings));
 return (...args)=>{cursor=0;const result=hook(...args);while(pending.length)pending.shift()();return result;};
}
