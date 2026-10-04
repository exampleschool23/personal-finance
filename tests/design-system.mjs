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
 // Views of the page sit right after the title.
 assert.equal(render(PageHeader,{title:'Goals',tabs:React.createElement('nav',{className:'segmented page-tabs'},'Overview')}),'<header class="page-heading"><div><h1>Goals</h1><nav class="segmented page-tabs">Overview</nav></div></header>');
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
 // An explanation sits behind the ⓘ in the heading, never as a sentence under the figure.
 const hinted=loadTS('components/presentation-foundation/stat-tile.tsx',{'@/components/presentation-foundation/info-hint':{InfoHint:({children})=>React.createElement('i',{className:'info-hint'},children)}});
 assert.equal(render(hinted.StatTile,{label:'Age of Money',value:'12 days',hint:'How long money waits.'},React.createElement('p',null,'+3 days vs 30 days ago')),'<article class="stat-tile"><h3>Age of Money<i class="info-hint">How long money waits.</i></h3><strong>12 days</strong><p>+3 days vs 30 days ago</p></article>');
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
 const files=['components/presentation-foundation/page-header.tsx','components/presentation-foundation/stat-tile.tsx','components/presentation-foundation/asset-card.tsx','components/presentation-foundation/brand.tsx','components/debt-summary.tsx','components/asset-dashboard.tsx','components/asset-accounts.tsx','components/recently-deleted.tsx','components/planning/upcoming-page.tsx','components/planning/accounts-page.tsx','components/planning/goals-page.tsx','components/settings-layout.tsx','components/telegram-panel.tsx','components/phone-sign-in.tsx','app/auth/telegram/page.tsx','components/telegram-nudge.tsx','components/onboarding-screen.tsx','components/settings-panel.tsx','components/income-sources-panel.tsx','components/workspace/app-drawer.tsx','components/workspace/top-bar.tsx','components/workspace/workspace-shell.tsx','components/workspace/workspace-dialogs.tsx','components/workspace/records-table.tsx','components/workspace/screen-notices.tsx','components/budget-page.tsx','components/transactions-page.tsx','components/dashboard-cards.tsx','components/cash-flow-report.tsx','components/planning/goal-detail.tsx','components/household-panel.tsx',...fs.readdirSync('components/workspace/screens').map(file=>'components/workspace/screens/'+file)];
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
 assert.match(render(Brand,{compact:true,badge:'Demo'}),/^<a href="\/" class="brand brand-compact" aria-label="Hoggish"><span class="mark">h\.<\/span><span class="brand-badge">Demo<\/span><\/a>$/,'the drawer shows the mark alone');
 assert.match(render(Brand,{badge:'Demo'}),/<\/span><span class="brand-badge">Demo<\/span><\/a>$/,'the sample workspace is labelled beside the logo');
 // The drawer, sign-in, loading, setup and account pages all render the same mark.
 for(const file of ['components/workspace/app-drawer.tsx','components/workspace/workspace-shell.tsx','app/auth/access/page.tsx','app/auth/confirm/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<Brand/,file);
 const css=fs.readFileSync('app/globals.css','utf8');
 assert.equal(css.split('\n').filter(line=>line.startsWith('.brand{')).length,1);
 assert.match(css,/\.brand\{[^}]*text-decoration:none/);
});

test('row lists keep their columns lined up from row to row',()=>{
 const css=fs.readFileSync('app/globals.css','utf8');
 const template=selector=>css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\>]/g,'\\$&')+'\\{[^}]*?grid-template-columns:([^;}]+)'))?.[1];
 // Each of these rows is its own grid, so a bare `auto` column would size to that row's own amount and shift its neighbours.
 for(const row of ['.report-transaction-list>li>*','.transaction-row','.account-holding-row','.share-bars>li','.business-card-list li','.tax-transactions li>button']){
  const columns=template(row);
  assert.ok(columns,`${row} has a column template`);
  assert.match(columns,/minmax\(max-content,[\d.]+fr\)/,`${row}: its amount column takes a share of the row, not just its own width (${columns})`);
 }
 assert.match(css,/\.recurring-row\{display:grid;grid-template-columns:subgrid/,'recurring and subscription rows share one set of columns per list');
 assert.match(css,/\.recurring-list>ul,\.subscription-list\{display:grid;grid-template-columns:/);
});

test('page titles and actions sit in the top bar, as in a desktop app',()=>{
 const bar=fs.readFileSync('components/workspace/top-bar.tsx','utf8'),shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8'),header=fs.readFileSync('components/presentation-foundation/page-header.tsx','utf8'),css=fs.readFileSync('app/globals.css','utf8');
 assert.match(shell,/<TopBarSlotProvider><main className="workspace">[\s\S]*<\/main><\/TopBarSlotProvider>/,'the bar and the routed screen share one slot');
 assert.match(bar,/<div className="topbar-page-title" ref=\{slot\?\.titleRef\}\/><span className="topbar-title">/,'the section name stands in until the page puts its title there');
 assert.match(bar,/\{roomy && !crowded && <div className="topbar-page-actions" ref=\{slot\?\.actionsRef\}\/>\}/,'actions join the bar only where it has room');
 assert.match(header,/createPortal\(<>\{heading\}/);
 assert.match(header,/slot\.actions \? actions && createPortal\(actions, slot\.actions\) : \(tabs \|\| actions\) && <header/,'actions stay on the page on phones');
 assert.match(css,/\.topbar-page-title:not\(:empty\)\+\.topbar-title\{display:none\}/);
 assert.match(fs.readFileSync('components/workspace/top-bar.tsx','utf8'),/\{!readOnly && section === 'Income & expenses' && <Button size="sm" className="quick-expense"/,'Add expense sits in the bar on Cash flow only');
 assert.doesNotMatch(fs.readFileSync('components/presentation-foundation/loading-placeholder.tsx','utf8'),/className="page-heading"/,'no heading placeholder under a bar that already names the page');
});

test('the top bar switches between the two display currencies in place, and the rates credit sits in the footer',()=>{
 const bar=fs.readFileSync('components/workspace/top-bar.tsx','utf8'),shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8'),css=fs.readFileSync('app/globals.css','utf8');
 assert.match(bar,/preferencesData\.currencies\.length > 1 && <Segmented className="header-currency-switch"/,'a one-tap switch, shown only when there is a second currency');
 assert.doesNotMatch(bar,/Popover/,'no pop-up for the display currency');
 assert.doesNotMatch(shell,/Rates By Exchange Rate API|fx-note|Updated \{date\}/,'no exchange-rate date or credit under the pages');
 assert.match(fs.readFileSync('components/settings-panel.tsx','utf8'),/\{!demo && ratesDate && <p className="preferences-rates-credit">[^\n]*formatDate\(ratesDate, locale\)[^\n]*Rates By Exchange Rate API/,'the rates credit sits with the currencies in Settings');
 assert.match(css,/\[data-slot=sidebar\]\[data-mobile=true\]::after\{[^}]*background:inherit/,'the phone drawer has no strip of backdrop under it');
});

test('Goals, Reports and Cash flow switch their views from tabs beside the title, which fall back to the page when the bar is full',()=>{
 for(const [file,label] of [['components/workspace/screens/reports-screen.tsx','Reports'],['components/workspace/screens/cash-flow-screen.tsx','Cash flow'],['components/planning/goals-page.tsx','Goals'],['components/planning/accounts-page.tsx','Accounts'],['components/workspace/screens/budget-screen.tsx','Budget'],['components/settings-layout.tsx','Settings']]){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,new RegExp(`<PageHeader title=\\{t\\('${label}'\\)\\} tabs=\\{<Segmented (as="nav" )?className="page-tabs"`),file);
  assert.doesNotMatch(source,/cashflow-tabs/,file);
 }
 // Settings groups its nine areas into five views; old anchors (#rules, #tags…) still open the right one.
 const {viewOf}=loadTS('components/settings-layout.tsx',{'@/components/language-provider':{useLanguage:()=>({t:text=>text})},'@/components/presentation-foundation/page-header':{PageHeader:()=>null},'@/components/presentation-foundation/segmented':{Segmented:()=>null}});
 for(const [hash,view] of [['','account'],['preferences','account'],['security','account'],['benchmarks','account'],['household','household'],['rules','categories'],['tags','categories'],['categories','categories'],['businesses','businesses'],['data-tools','data-tools'],['unknown','account']])assert.equal(viewOf(hash),view,hash);
 // Accounts keeps its operations behind a Recent activity tab; Cash flow adds expenses from the bar's own Add expense.
 assert.match(fs.readFileSync('components/planning/accounts-page.tsx','utf8'),/\{view==='activity'&&<>\n  <section className="panel account-activity">/);
 assert.doesNotMatch(fs.readFileSync('components/workspace/screens/cash-flow-screen.tsx','utf8'),/addCashFlow\('Other expense'\)/);
 const header=fs.readFileSync('components/presentation-foundation/page-header.tsx','utf8'),bar=fs.readFileSync('components/workspace/top-bar.tsx','utf8'),css=fs.readFileSync('app/globals.css','utf8');
 assert.match(header,/\{slot\.actions && tabs\}<\/>, slot\.title\)/,'tabs join the title only when the actions do');
 assert.match(header,/\(tabs \|\| actions\) && <header className=\{`\$\{classes\} page-heading-actions`\}>\{tabs\}\{actions\}<\/header>/,'otherwise they open the page');
 assert.match(bar,/\{roomy && !crowded && <div className="topbar-page-actions"/,'a bar that overflowed keeps only the title');
 assert.match(bar,/setCrowded\(previous => previous \? needed \+ 8 > room : needed > room\)/,'the same widths always give the same answer');
 assert.match(css,/\.segmented:not\(\.page-tabs\)\{display:flex;width:100%;flex-wrap:wrap/,'page tabs stay on one scrolling line on phones');
});
