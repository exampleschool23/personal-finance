import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const dir='components/presentation-foundation';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.variant;delete props.size;return React.createElement(tag,props);};
const overrides={'@/components/language-provider':language,'@/components/ui/button':{Button:element('button')}};
const load=(name,extra={})=>loadTS(`${dir}/${name}`,{...overrides,...extra});
const render=(component,props,...children)=>renderToStaticMarkup(React.createElement(component,props,...children));
const files=fs.readdirSync(dir).filter(file=>file!=='index.ts');
const imports=source=>[...source.matchAll(/^import\s+(?!type\s)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(match=>match[1]);

test('foundation pieces are pure: no workspace state, data hooks, screens or network',()=>{
 for(const file of files){
  const source=fs.readFileSync(`${dir}/${file}`,'utf8');
  for(const name of imports(source))assert.ok(!/workspace-provider|\/screens\/|\/hooks\/|records-table|screen-notices|next\/navigation/.test(name),`${file}: ${name}`);
  assert.ok(!/\bfetch\(/.test(source),file);
  assert.ok(!/new Intl\.|toLocaleString|toFixed\(/.test(source),file);
 }
});

test('the module index lists every piece exactly once',()=>{
 const index=fs.readFileSync(`${dir}/index.ts`,'utf8');
 const listed=[...index.matchAll(/from '\.\/([^']+)'/g)].map(match=>match[1]);
 assert.deepEqual([...listed].sort(),files.map(file=>file.replace(/\.tsx?$/,'')).sort());
 assert.equal(new Set(listed).size,listed.length);
});

test('empty state renders the icon, heading, guidance and actions in order',()=>{
 const {EmptyState}=load('empty-state.tsx');
 const html=render(EmptyState,{icon:React.createElement('svg'),title:'A fresh start.',description:'Add a record to begin.'},React.createElement('button',null,'Add'));
 assert.equal(html,'<div class="empty"><svg></svg><h3>A fresh start.</h3><p>Add a record to begin.</p><button>Add</button></div>');
 assert.equal(render(EmptyState,{icon:null,description:'Nothing due.',as:'section',className:'panel'}),'<section class="empty panel"><p>Nothing due.</p></section>');
});

test('inline error is announced and only offers Retry when a retry exists',()=>{
 const {InlineError}=load('inline-error.tsx');
 assert.equal(render(InlineError,{message:'Could not load.'}),'<p role="alert" class="error">Could not load. </p>');
 assert.match(render(InlineError,{message:'Could not load.',onRetry:()=>{}}),/^<p role="alert" class="error">Could not load\. <button>Retry<\/button><\/p>$/);
 assert.match(render(InlineError,{message:'x',as:'div',className:'wide'}),/^<div role="alert" class="error wide">/);
});

test('resource state shows loading, then the error with retry, then the content',()=>{
 const {ResourceState}=load('resource-state.tsx',{'@/components/ui/skeleton':{Skeleton:element('span')}});
 const child=React.createElement('p',null,'ready');
 assert.match(render(ResourceState,{loading:true},child),/role="status" aria-busy="true".*Loading records…/);
 assert.match(render(ResourceState,{loading:false,error:'Planning failed.',onRetry:()=>{}},child),/^<p role="alert" class="error">Planning failed\. <button>Retry<\/button><\/p>$/);
 assert.equal(render(ResourceState,{loading:false,error:null},child),'<p>ready</p>');
 assert.equal(render(ResourceState,{loading:true,error:'x'},child).includes('ready'),false);
});

test('segmented control presses exactly the current option and reports the chosen value',()=>{
 const {Segmented}=load('segmented.tsx');
 const options=[{value:30,label:'30 days'},{value:null,label:'All history'}];
 const html=render(Segmented,{label:'History period',options,value:null,onChange:()=>{}});
 assert.equal(html,'<div class="segmented" role="group" aria-label="History period"><button type="button" aria-pressed="false">30 days</button><button type="button" aria-pressed="true">All history</button></div>');
 assert.match(render(Segmented,{label:'Cash flow',options,value:30,onChange:()=>{},as:'nav',className:'cashflow-tabs'}),/^<nav class="segmented cashflow-tabs" aria-label="Cash flow">/);
 const chosen=[];
 Segmented({label:'x',options,value:30,onChange:value=>chosen.push(value)}).props.children[1].props.onClick();
 assert.deepEqual(chosen,[null]);
});

test('panel title keeps the heading, count and description together and the aside on the right',()=>{
 const {PanelTitle}=load('panel-title.tsx');
 const {Count}=load('count.tsx');
 const html=render(PanelTitle,{title:'Recent transactions',count:React.createElement(Count,{value:1234}),description:'Recorded income and expenses'},React.createElement('a',null,'View all'));
 assert.equal(html,'<div class="panel-title"><div><h2>Recent transactions<span class="count">1,234</span></h2><p class="muted">Recorded income and expenses</p></div><a>View all</a></div>');
 assert.equal(render(PanelTitle,{title:'Asset allocation'},React.createElement('span',null,'Current balances')),'<div class="panel-title"><div><h2>Asset allocation</h2></div><span>Current balances</span></div>');
 assert.equal(render(Count,{value:12,loading:true}),'<span class="count">—</span>');
});

test('form footer cancels through its callback and honours the busy state',()=>{
 const {FormFooter}=load('form-footer.tsx');
 assert.equal(render(FormFooter,{onCancel:()=>{}},React.createElement('button',null,'Save')),'<div class="record-form-footer"><button type="button">Cancel</button><button>Save</button></div>');
 assert.match(render(FormFooter,{busy:true,onCancel:()=>{},cancelLabel:'Close'}),/<button type="button" disabled="">Close<\/button>/);
});

test('confirm dialog blocks closing while busy, never submits a form and styles destructive actions',()=>{
 const dialog={};
 for(const name of ['AlertDialog','AlertDialogContent','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'])dialog[name]=element('div');
 const shown=[];
 const {ConfirmDialog}=load('confirm-dialog.tsx',{'@/components/ui/alert-dialog':dialog,'@/lib/feedback':{showError:message=>shown.push(message)}});
 const confirmed=[];let closed=0;
 const props={open:true,onClose:()=>closed++,title:'Delete this record?',description:'It moves to Recently deleted.',confirmLabel:'Delete record',onConfirm:()=>confirmed.push(1)};
 const html=render(ConfirmDialog,{...props,destructive:true});
 assert.match(html,/Delete this record\?[\s\S]*It moves to Recently deleted\.[\s\S]*Cancel[\s\S]*bg-destructive[\s\S]*Delete record/);
 assert.doesNotMatch(render(ConfirmDialog,props),/bg-destructive|disabled=""/);
 assert.match(render(ConfirmDialog,{...props,busy:true,cancelLabel:'Keep record'}),/<div disabled="">Keep record<\/div>/);
 const tree=ConfirmDialog({...props,busy:true});
 tree.props.onOpenChange(false);assert.equal(closed,0);
 ConfirmDialog(props).props.onOpenChange(false);assert.equal(closed,1);
 let prevented=0;
 const action=ConfirmDialog(props).props.children.props.children[3].props.children[1];
 action.props.onClick({preventDefault:()=>prevented++});
 assert.deepEqual([prevented,confirmed],[1,[1]]);
});

test('sign tone colours losses, treats surpluses as positive unless told otherwise, and ignores unknowns',()=>{
 const {signTone}=load('tone.ts');
 assert.equal(signTone(-1),'negative');
 assert.equal(signTone(0),'positive');
 assert.equal(signTone(250),'positive');
 assert.equal(signTone(250,true),undefined);
 assert.equal(signTone(-250,true),'negative');
 assert.equal(signTone(null),undefined);
 assert.equal(signTone(NaN),undefined);
});

test('liability tone marks any amount owed as negative and leaves no debt and unknowns uncoloured',()=>{
 const {liabilityTone}=load('tone.ts');
 assert.equal(liabilityTone(92035),'negative');
 assert.equal(liabilityTone(0),undefined);
 assert.equal(liabilityTone(null),undefined);
 assert.equal(liabilityTone(undefined),undefined);
 assert.equal(liabilityTone(NaN),undefined);
});
