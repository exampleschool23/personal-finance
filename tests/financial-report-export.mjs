import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}}
function fixture(){
 const states=[],built=[];let cursor=0;const downloading={current:false};
 const {FinancialReportExport}=loadTS('components/financial-report-export.tsx',{
  react:{...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value;}];},useRef:()=>downloading},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key,language:'uz'})},
  '@/lib/financial-report':{buildFinancialReport:(backup,language,context)=>{built.push({backup,language,context});return {}; }},
  '@/lib/financial-report-pdf':{renderFinancialReportPdf:async()=>new Uint8Array([37,80,68,70,45])},
 });
 return {render:(demo=false)=>{cursor=0;return FinancialReportExport({demo});},built};
}
test('report download uses only the owner backup and local font; failures never download a partial file',async()=>{
 const original={fetch:globalThis.fetch,document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let downloads=0,failed=true;const requests=[];
 globalThis.fetch=async path=>{requests.push(path);return path==='/api/backup'?(failed?Response.json({error:'Offline'},{status:503}):Response.json({version:1})):new Response(new Uint8Array([1]));};
 globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 URL.createObjectURL=()=> 'blob:report';URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const h=fixture();let tree=h.render();find(tree,node=>node.type==='textarea').props.onChange({target:{value:'My interests'}});tree=h.render();
  find(tree,node=>node.props?.children==='Download PDF').props.onClick();await flush();await flush();
  assert.equal(downloads,0);assert.equal(h.built.length,0);assert.ok(find(h.render(),node=>node.props?.role==='alert'));
  failed=false;find(h.render(),node=>node.props?.children==='Download PDF').props.onClick();await flush();await flush();
  assert.equal(downloads,1);assert.deepEqual(h.built,[{backup:{version:1},language:'uz',context:'My interests'}]);assert.ok(requests.every(path=>path==='/api/backup'||path==='/fonts/NotoSans-Regular.ttf'));
  assert.equal(find(h.render(true),node=>node.props?.children==='Download PDF').props.disabled,true);
 }finally{globalThis.fetch=original.fetch;globalThis.document=original.document;globalThis.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});
