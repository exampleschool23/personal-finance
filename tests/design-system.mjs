import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const render=(component,props,...children)=>renderToStaticMarkup(React.createElement(component,props,...children));

test('page header shows its eyebrow, hint and actions only when they are provided',()=>{
 const hint={InfoHint:({children})=>React.createElement('i',null,children)};
 const {PageHeader}=loadTS('components/presentation-foundation/page-header.tsx',{'@/components/presentation-foundation/info-hint':hint});
 // No subtitle line: explanations sit behind the ⓘ next to the title.
 assert.equal(render(PageHeader,{title:'Accounts'}),'<header class="page-heading"><div><h1>Accounts</h1></div></header>');
 assert.equal(render(PageHeader,{title:'Upcoming payments',hint:'Reminders never move money.'}),'<header class="page-heading"><div><h1>Upcoming payments<i>Reminders never move money.</i></h1></div></header>');
 const full=render(PageHeader,{title:'Hi there!',eyebrow:'29 September 2026'},React.createElement('button',null,'Add'));
 assert.match(full,/<p class="page-eyebrow">29 September 2026<\/p><h1>Hi there!<\/h1>/);
 assert.match(full,/<div class="entry-actions"><button>Add<\/button><\/div>/);
});

test('stat tiles keep the value text intact and colour it only for a stated tone',()=>{
 const {StatTile,StatTiles}=loadTS('components/presentation-foundation/stat-tile.tsx');
 const html=render(StatTiles,{columns:3,label:'Debts'},
  React.createElement(StatTile,{label:'Money you owe',value:'$92,726'}),
  React.createElement(StatTile,{label:'Net lending position',value:'-$80,507',tone:'negative'},React.createElement('p',null,'Shortfall')));
 assert.match(html,/^<div class="stat-tiles" data-columns="3" role="group" aria-label="Debts">/);
 assert.match(html,/<h3>Money you owe<\/h3><strong>\$92,726<\/strong><\/article>/);
 assert.match(html,/<strong class="negative">-\$80,507<\/strong><p>Shortfall<\/p>/);
 assert.doesNotMatch(render(StatTiles,{},null),/role=|aria-label=/);
});

test('debt summary totals stay whole amounts, money you owe and a net shortfall are marked negative',()=>{
 const {DebtSummary}=loadTS('components/debt-summary.tsx',{'@/components/language-provider':language});
 const entry=(id,kind,amount)=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-09-01'});
 const owing=render(DebtSummary,{currency:'USD',entries:[entry('lent','Money lent',1200.75),entry('loan','Loan',5000.4)]});
 assert.match(owing,/<strong>\$1,201<\/strong>/);
 assert.match(owing,/<strong class="negative">\$5,000<\/strong>/);
 assert.match(owing,/<strong class="negative">\u2212\$3,800<\/strong>/);
 assert.doesNotMatch(owing,/\.\d/);
 const ahead=render(DebtSummary,{currency:'USD',entries:[entry('lent','Money lent',900)]});
 assert.doesNotMatch(ahead,/class="(?:positive|negative)"/);
});

test('asset card names its share on the bar with one decimal, a dash without a total, and clamps the bar',()=>{
 const {AssetCard}=loadTS('components/presentation-foundation/asset-card.tsx',{'@/components/language-provider':language});
 const base={record:{kind:'Stock',name:'ACME'},label:'Stock',worth:'$1,500',detailsLabel:'Asset details',details:null};
 const html=render(AssetCard,{...base,share:12.345,fact:{label:'Gain/loss',value:'-$20',tone:'negative'}},'actions');
 assert.match(html,/<h3>ACME<\/h3>/);
 assert.match(html,/<dt>Gain\/loss<\/dt><dd class="negative">-\$20<\/dd>/);
 assert.match(html,/role="img" aria-label="Share of holdings: 12\.3%"/);
 assert.match(html,/style="width:12\.345%"/);
 const unknown=render(AssetCard,{...base,share:null},'actions');
 assert.match(unknown,/aria-label="Share of holdings: —"/);
 assert.doesNotMatch(unknown,/<dl/);
 assert.match(unknown,/style="width:0%"/);
 assert.doesNotMatch(unknown,/Gain\/loss/);
 assert.match(render(AssetCard,{...base,share:140},'actions'),/style="width:100%"/);
});

test('redesigned pages translate every label and use the shared formatters',()=>{
 const files=['components/presentation-foundation/page-header.tsx','components/presentation-foundation/stat-tile.tsx','components/presentation-foundation/asset-card.tsx','components/presentation-foundation/brand.tsx','components/debt-summary.tsx','components/asset-dashboard.tsx','components/asset-accounts.tsx','components/recently-deleted.tsx','components/planning/upcoming-page.tsx','components/planning/accounts-page.tsx','components/planning/goals-page.tsx','components/settings-layout.tsx','components/telegram-panel.tsx','components/phone-sign-in.tsx','app/auth/telegram/page.tsx','components/telegram-nudge.tsx','components/onboarding-screen.tsx','components/settings-panel.tsx','components/income-sources-panel.tsx','components/workspace/app-drawer.tsx','components/workspace/top-bar.tsx','components/workspace/workspace-shell.tsx','components/workspace/workspace-dialogs.tsx','components/workspace/records-table.tsx','components/workspace/screen-notices.tsx','components/budget-page.tsx','components/transactions-page.tsx','components/dashboard-cards.tsx','components/cash-flow-report.tsx','components/planning/goal-detail.tsx',...fs.readdirSync('components/workspace/screens').map(file=>'components/workspace/screens/'+file)];
 const sources=files.map(file=>[file,fs.readFileSync(file,'utf8')]);
 for(const language of ['en','ru','uz']){
  const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
  for(const [file,source] of sources)for(const [,,message] of source.matchAll(/\bt\((["'])((?:(?!\1).)+)\1[,)]/g))assert.ok(labels[message],`${language}: ${file}: ${message}`);
 }
 for(const [file,source] of sources.slice(0,9)){
  assert.ok(!/new Intl\.|toLocaleString|toFixed\(/.test(source),file);
  assert.ok(!source.includes('type="date"'),file);
 }
});

test('shared surfaces are defined once and the stylesheet has no unterminated comments',()=>{
 const css=fs.readFileSync('app/globals.css','utf8');
 for(const selector of ['.panel{','.stat-tile{','.page-heading{','.segmented{','.topbar{'])assert.equal(css.split('\n').filter(line=>line.startsWith(selector)).length,1,selector);
 const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.ok(!stripped.includes('/*'));
 assert.equal((stripped.match(/\{/g)||[]).length,(stripped.match(/\}/g)||[]).length);
});

test('the logo links to the main page from every screen that shows it',()=>{
 const element=tag=>function Element(all){const props={...all};return React.createElement(tag,props);};
 const {Brand}=loadTS('components/presentation-foundation/brand.tsx',{...{'@/components/language-provider':language},'@/components/presentation-foundation/drawer-link':{DrawerLink:element('a')}});
 const html=render(Brand,{});
 assert.match(html,/^<a href="\/" class="brand"><span class="mark">h\.<\/span><span>HOGGISH<small class="block">PERSONAL FINANCE<\/small><\/span><\/a>$/);
 assert.match(render(Brand,{badge:'Demo'}),/<\/span><span class="brand-badge">Demo<\/span><\/a>$/,'the sample workspace is labelled beside the logo');
 // The drawer, sign-in, loading, setup and account pages all render the same mark.
 for(const file of ['components/workspace/app-drawer.tsx','components/workspace/workspace-shell.tsx','app/auth/access/page.tsx','app/auth/confirm/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<Brand/,file);
 const css=fs.readFileSync('app/globals.css','utf8');
 assert.equal(css.split('\n').filter(line=>line.startsWith('.brand{')).length,1);
 assert.match(css,/\.brand\{[^}]*text-decoration:none/);
});
