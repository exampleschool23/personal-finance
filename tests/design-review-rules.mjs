import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

// Rules from the 5 October 2026 design review (.claude/skills/dr/references/cases.md).

const channel=value=>{value/=255;return value<=.03928?value/12.92:((value+.055)/1.055)**2.4};
const luminance=([r,g,b])=>.2126*channel(r)+.7152*channel(g)+.0722*channel(b);
const hslToRgb=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l);return [0,8,4].map(n=>255*(l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1))));};
const hex=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};

test('business marks keep their initial readable on every palette colour (COMP-019)',()=>{
 const {paletteColors,paletteColor,paletteInk}=loadTS('lib/business.ts');
 const css=fs.readFileSync('app/styles/foundation.css','utf8');
 const ink={light:hex(css.match(/--on-palette-light: (#[0-9a-f]{3,6})/)[1].replace(/^#(\w)(\w)(\w)$/,'#$1$1$2$2$3$3')),dark:hex(css.match(/--on-palette-dark: (#[0-9a-f]{6})/)[1])};
 for(const color of paletteColors){
  const [h,s,l]=paletteColor(color).match(/[\d.]+/g).map(Number);
  const ratio=contrast(hslToRgb(h,s,l),ink[paletteInk(color)]);
  assert.ok(ratio>=4.5,`${color}: ${ratio.toFixed(2)}`);
 }
 assert.equal(paletteInk('teal'),'dark');assert.equal(paletteInk('indigo'),'light');assert.equal(paletteInk('unknown'),paletteInk('slate'));
 const mark=renderToStaticMarkup(React.createElement(loadTS('components/presentation-foundation/business-mark.tsx').BusinessMark,{name:'amber co',color:'amber'}));
 assert.match(mark,/data-ink="dark"/);assert.match(mark,/>A</);
 assert.doesNotMatch(fs.readFileSync('app/styles/goal-setup-business.css','utf8'),/\.business-mark\{[^}]*color:#fff/);
});

test('a dialog opened from state returns focus to whatever opened it (DLG-018)',()=>{
 const focused=[];
 const opener={isConnected:true,focus:()=>focused.push('opener')};
 const previous=globalThis.document,previousElement=globalThis.HTMLElement;
 globalThis.HTMLElement=function HTMLElement(){};Object.setPrototypeOf(opener,globalThis.HTMLElement.prototype);
 globalThis.document={activeElement:opener,body:{}};
 try{
  const {useReturnFocus}=loadTS('components/ui/return-focus.ts',{react:{...React,useState:initial=>[typeof initial==='function'?initial():initial]}});
  const event=()=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
  const first=event();useReturnFocus()(first);
  assert.deepEqual(focused,['opener']);assert.ok(first.defaultPrevented,'Radix does not then move focus elsewhere');
  // A dialog that handles focus itself keeps that choice.
  useReturnFocus(event=>event.preventDefault())(event());
  assert.deepEqual(focused,['opener']);
  // An opener that has gone (a menu item) is skipped rather than focused.
  opener.isConnected=false;useReturnFocus()(event());
  assert.deepEqual(focused,['opener']);
 }finally{globalThis.document=previous;globalThis.HTMLElement=previousElement;}
 for(const file of ['components/ui/dialog.tsx','components/ui/alert-dialog.tsx'])assert.match(fs.readFileSync(file,'utf8'),/onCloseAutoFocus=\{returnFocus\}/,file);
});

test('a zero net carries no tone, so it is never green (FMT-014, COMP-018)',()=>{
 const {signTone}=loadTS('components/presentation-foundation/tone.ts');
 assert.equal(signTone(0),undefined);assert.equal(signTone(5),'positive');assert.equal(signTone(-5),'negative');
 const inline=fs.readdirSync('components',{recursive:true}).filter(file=>/\.tsx$/.test(file)).filter(file=>/<\s*0\s*\?\s*'negative'\s*:\s*'positive'/.test(fs.readFileSync('components/'+file,'utf8')));
 assert.deepEqual(inline,[]);
});

test('holdings say "1 unit" and transaction rows name their amount and category',()=>{
 const t=(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key);
 const {unitCount}=loadTS('lib/asset-movements.ts');
 assert.equal(unitCount(t,1,'en-US'),'1 unit');assert.equal(unitCount(t,0.55,'en-US'),'0.55 units');assert.equal(unitCount(t,1200,'en-US'),'1,200 units');
 for(const file of fs.readdirSync('lib/locales'))assert.ok(JSON.parse(fs.readFileSync('lib/locales/'+file,'utf8'))['1 unit'],file);
 const {transactionRowLabel}=loadTS('components/transactions/transaction-row.tsx');
 assert.equal(transactionRowLabel('View details for Coffee',{kind:'Living expense',amount:35,currency:'USD',frequency:'Once'},'Groceries','en-US'),'View details for Coffee · −$35 · Groceries');
});

test('right-to-left pages: the served root carries the request direction and styles use logical sides (RTL-004, RTL-010)',()=>{
 const layout=fs.readFileSync('app/layout.tsx','utf8');
 assert.match(layout,/<html lang=\{language\} dir=\{directionOf\(language\)\}/);
 assert.match(layout,/accept-language/);
 for(const folder of ['auth','connect']){
  const {default:PublicLayout}=loadTS(`app/${folder}/layout.tsx`,{'@/components/visitor-hint':{VisitorHint:({children})=>React.createElement('section',{'data-visitor':''},children)}});
  assert.equal(renderToStaticMarkup(React.createElement(PublicLayout,null,'page')),'<section data-visitor="">page</section>');
 }
 for(const file of ['app/terms/page.tsx','app/privacy/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<VisitorHint><LegalPage/);
 const css=stylesheet()+fs.readdirSync('components').filter(file=>file.endsWith('.module.css')).map(file=>fs.readFileSync('components/'+file,'utf8')).join('\n');
 assert.deepEqual(css.match(/(?<![\w-])(margin|padding|border)-(left|right)(?=[\s:-])|text-align:\s*(left|right)\b/g),null);
});

test('public card titles are one h1 at one size, and phone tab strips wrap (HEAD-012, TYPE-008, RESP-021)',()=>{
 for(const file of ['app/connect/telegram/page.tsx','app/auth/telegram/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<h1>\{t\(/,file);
 assert.match(fs.readFileSync('components/sign-in-screen.module.css','utf8'),/\.cardHeading h1\{font-size:var\(--type-display\)/);
 assert.match(fs.readFileSync('components/auth-showcase.tsx','utf8'),/<p className=\{styles\.showcaseTitle\}>/);
 const css=stylesheet();
 assert.match(css,/\.auth-page \.panel :is\(h1,h2\)\{font-family:var\(--font-display\);font-size:var\(--type-display\)/);
 assert.match(css,/@container content \(max-width:520px\)\{[^\n]*\.segmented\.page-tabs\{flex-wrap:wrap/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.user-link,\.info-hint,\.account-group>summary>svg,\.account-list-row,\.goal-setup-progress>span,\.goal-template\{transition:none\}/);
});
