import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const overrides={'@/components/language-provider':language};
test('filters expose an accessible mobile disclosure and preserve the search outside it',()=>{
 const {RecordFilters}=loadTS('components/record-filters.tsx',overrides);
 const html=renderToStaticMarkup(React.createElement(RecordFilters,{value:{query:'shop',category:'all',from:'',to:'',order:'newest'},onChange:()=>{},categories:[],kinds:[]}));
 assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls=/);assert.match(html,/data-expanded="false"/);assert.match(html,/value="shop"/);assert.match(html,/Filters.*1/);
});
test('failed settings render a retry control and prevent saving fallback preferences',()=>{
 const {SettingsPanel}=loadTS('components/settings-panel.tsx',{...overrides,'@/components/investment-comparison-settings':{InvestmentComparisonSettings:()=>null}});
 const html=renderToStaticMarkup(React.createElement(SettingsPanel,{initial:{language:'en',currencies:['USD']},demo:false,onSaved:()=>{},loading:false,loadError:'Offline',onRetry:()=>{}}));
 assert.match(html,/Retry loading settings/);assert.match(html,/role="alert"/);assert.match(html,/<button[^>]*disabled=""[^>]*>Save settings/);
});
test('partial totals explicitly name excluded currencies and disappear when coverage is complete',()=>{
 const {PartialTotal}=loadTS('components/partial-total.tsx',overrides);
 assert.equal(renderToStaticMarkup(React.createElement(PartialTotal,{currencies:[]})),'');
 const html=renderToStaticMarkup(React.createElement(PartialTotal,{currencies:['EUR','UZS']}));assert.match(html,/Partial total/);assert.match(html,/EUR, UZS/);
});
test('discard guard keeps changed forms open until explicitly discarded, and leaves clean forms immediately',()=>{
 const slots=[],effects=[];let cursor=0,closed=0;const listeners=new Map();const previousWindow=globalThis.window;
 const hooks={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},useEffect(effect){effects.push(effect);}};
 globalThis.window={addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:type=>listeners.delete(type)};
 try{
  // This harness supplies fake hook primitives and invokes the loaded function directly.
  const {useDiscardChanges:runDiscardGuard}=loadTS('components/discard-changes.tsx',{...overrides,react:hooks,'@/components/ui/alert-dialog':{}});
  const render=(dirty,busy=false)=>{cursor=0;return runDiscardGuard(dirty,()=>closed++,busy);};
  render(false).close();assert.equal(closed,1);
  render(true).close();let result=render(true);assert.equal(closed,1);assert.equal(result.confirmation.props.open,true);
  result.confirmation.props.setOpen(false);assert.equal(render(true).confirmation.props.open,false);assert.equal(closed,1);
  render(true,true).close();assert.equal(render(true).confirmation.props.open,false);
  render(true).close();result=render(true);result.confirmation.props.discard();assert.equal(closed,2);assert.equal(render(true).confirmation.props.open,false);
 }finally{globalThis.window=previousWindow;}
});
test('account security clears the persistent workspace session before navigating after a password change',async context=>{
 const navigation=[];let cleared=false;context.mock.method(globalThis,'fetch',async()=>Response.json({message:'Password changed.'}));
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{...overrides,react:{...React,useState:initial=>[initial,()=>{}],useEffect:()=>{}},'next/navigation':{useRouter:()=>({replace:path=>{assert.ok(cleared);navigation.push(path);},refresh:()=>{}})}});
 const tree=AccountAccessPanel({settings:true,onSignedOut:()=>{cleared=true;}});const find=node=>{if(!node||typeof node!=='object')return null;if(node.type==='form')return node;return React.Children.toArray(node.props?.children).map(find).find(Boolean);};
 await find(tree).props.onSubmit({preventDefault:()=>{}});assert.equal(cleared,true);assert.deepEqual(navigation,['/']);
});
