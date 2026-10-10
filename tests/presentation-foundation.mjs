import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
import {byType,createRenderer,hostModule} from './helpers/component-tree.mjs';

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

test('today button is off with its reason while the current period is shown',()=>{
 const {TodayButton}=load('today-button.tsx');
 assert.equal(render(TodayButton,{current:true,onClick(){}}),'<span title="Today is already shown."><button disabled="">Today</button></span>');
 assert.equal(render(TodayButton,{current:false,onClick(){}}),'<span><button>Today</button></span>');
});

test('empty state renders the icon, heading, guidance and actions in order',()=>{
 const {EmptyState}=load('empty-state.tsx');
 const html=render(EmptyState,{icon:React.createElement('svg'),title:'A fresh start',description:'Add a record to begin.'},React.createElement('button',null,'Add'));
 assert.equal(html,'<div class="empty"><svg></svg><h3>A fresh start</h3><p>Add a record to begin.</p><button>Add</button></div>');
 assert.equal(render(EmptyState,{icon:null,description:'Nothing due.',as:'section',className:'panel'}),'<section class="empty panel"><p>Nothing due.</p></section>');
 assert.equal(render(EmptyState,{icon:null,id:'why',description:'Sign in first.'}),'<div id="why" class="empty"><p>Sign in first.</p></div>');
});

test('inline error is announced and only offers Retry when a retry exists',()=>{
 const {InlineError}=load('inline-error.tsx');
 assert.equal(render(InlineError,{message:'Could not load.'}),'<p role="alert" class="error">Could not load. </p>');
 assert.match(render(InlineError,{message:'Could not load.',onRetry:()=>{}}),/^<p role="alert" class="error">Could not load\. <button type="button">Retry<\/button><\/p>$/);
 assert.match(render(InlineError,{message:'x',as:'div',className:'wide'}),/^<div role="alert" class="error wide">/);
});

test('resource state shows loading, then the error with retry, then the content',()=>{
 const {ResourceState}=load('resource-state.tsx',{'@/components/ui/skeleton':{Skeleton:element('span')}});
 const child=React.createElement('p',null,'ready');
 assert.match(render(ResourceState,{loading:true},child),/role="status" aria-busy="true".*Loading records…/);
 assert.match(render(ResourceState,{loading:false,error:'Planning failed.',onRetry:()=>{}},child),/^<p role="alert" class="error">Planning failed\. <button type="button">Retry<\/button><\/p>$/);
 assert.equal(render(ResourceState,{loading:false,error:null},child),'<p>ready</p>');
 assert.equal(render(ResourceState,{loading:true,error:'x'},child).includes('ready'),false);
});

test('loading skeletons keep the shape of the content they replace, so the page does not jump',()=>{
 const {StatTilesSkeleton,PanelSkeleton,CashflowPreviewSkeleton,WorkspaceSkeleton}=load('loading-placeholder.tsx',{'@/components/ui/skeleton':{Skeleton:element('span')}});
 const tiles=render(StatTilesSkeleton,{label:'Loading records…'});
 assert.match(tiles,/^<div role="status" aria-busy="true"><span class="sr-only">Loading records…<\/span><div aria-hidden="true" class="stat-tiles" data-columns="3">/);
 assert.equal(tiles.match(/class="stat-tile"/g).length,3);
 assert.equal(render(StatTilesSkeleton,{columns:4}).match(/class="stat-tile"/g).length,4);
 assert.match(render(PanelSkeleton,{label:'Loading records…',rows:2,className:'tools-panel'}),/^<section class="panel tools-panel">.*role="status" aria-busy="true".*Loading records…/);
 const preview=render(CashflowPreviewSkeleton,{label:'Loading records…'});
 assert.match(preview,/class="cashflow-preview-grid"/);
 assert.equal(preview.match(/class="panel"/g).length,2);
 const cashflow=render(WorkspaceSkeleton,{label:'Loading',section:'Income & expenses'});
 assert.ok(cashflow.indexOf('stat-tiles')<cashflow.indexOf('cashflow-preview-grid')&&cashflow.indexOf('cashflow-preview-grid')<cashflow.indexOf('panel records'));
 const {NetWorthBodySkeleton,ChartSkeleton}=load('loading-placeholder.tsx',{'@/components/ui/skeleton':{Skeleton:element('span')}});
 const body=render(NetWorthBodySkeleton,{label:'Loading history…'});
 assert.match(body,/^<div role="status" aria-busy="true"><span class="sr-only">Loading history…<\/span><div aria-hidden="true">/);
 const order=['overview-chart-heading','comparison-legend','chart-skeleton','portfolio-headline','overview-details'].map(name=>body.indexOf(name));
 assert.ok(order.every((at,i)=>at>0&&(i===0||at>order[i-1])),'heading, legend, chart, the three totals and the settings row, in the card\'s order');
 assert.equal(body.match(/role="status"/g).length,1,'one announcement for the whole card');
 assert.match(render(ChartSkeleton,{}),/^<div aria-hidden="true" class="chart-skeleton shimmer"/);
 const board=render(WorkspaceSkeleton,{label:'Loading',section:'Overview'});
 assert.match(board,/class="dashboard-grid"><div class="dashboard-column"><section class="panel overview-hero">.*portfolio-headline.*overview-details/,'Net worth leads the left column in its full shape');
 assert.equal(board.match(/class="dashboard-column"/g).length,2);assert.ok(!board.includes('stat-tiles'),'the dashboard has no tile row');
 const custom=render(WorkspaceSkeleton,{label:'Loading',section:'Overview',columns:{left:['goals'],right:['net_worth','a','b','c']}});
 const [left,right]=custom.split('class="dashboard-column"').slice(1);
 assert.ok(!left.includes('overview-hero')&&right.includes('overview-hero'),'follows the saved layout');
 assert.equal(right.match(/<section/g).length,3,'at most three cards a column');
 const {AccountsSkeleton}=load('loading-placeholder.tsx',{'@/components/ui/skeleton':{Skeleton:element('span')}});
 const accounts=render(AccountsSkeleton,{label:'Loading records…',currencies:2});
 assert.match(accounts,/^<div role="status" aria-busy="true" class="overview-content-loading"><span class="sr-only">Loading records…<\/span>/);
 assert.equal(accounts.match(/class="stat-tile"/g).length,2,'a balance tile per preferred currency');
 assert.ok(accounts.indexOf('account-group')<accounts.indexOf('account-selected-panel'),'the account list with the selected account beside it');
 assert.equal(accounts.match(/class="account-list-row"/g).length,5);
 assert.ok(!accounts.includes('transactions-tools'));assert.ok(render(AccountsSkeleton,{label:'L',filters:true}).includes('transactions-tools'),'filters only for a shared workspace');
});

test('row menu keeps rare actions behind one labelled ⋯ button and disappears when there are none',()=>{
 const passthrough=tag=>function Part({children,...props}){delete props.asChild;delete props.align;delete props.onSelect;delete props.variant;return React.createElement(tag,props,children);};
 const menu={DropdownMenu:({children})=>React.createElement(React.Fragment,null,children),DropdownMenuTrigger:passthrough('span'),DropdownMenuContent:passthrough('div'),DropdownMenuItem:passthrough('button')};
 const {RowMenu}=load('row-menu.tsx',{'@/components/ui/dropdown-menu':menu});
 const html=render(RowMenu,{label:'Actions for Rent',items:[false,{label:'Edit',onSelect:()=>{}},null,{label:'Delete',deletes:true,onSelect:()=>{}}]});
 assert.match(html,/aria-label="Actions for Rent"/);
 assert.deepEqual([...html.replace(/<svg[^>]*>.*?<\/svg>/g,'').matchAll(/<button[^>]*>(Edit|Delete)<\/button>/g)].map(match=>match[1]),['Edit','Delete']);
 assert.match(html,/<button[^>]*><svg[^>]*lucide-trash[^]*?<\/svg>Delete<\/button>/,'a delete carries the bin');
 assert.doesNotMatch(html,/<svg[^>]*lucide-trash[^]*?<\/svg>Edit/);
 assert.equal(render(RowMenu,{label:'Actions',items:[false,null]}),'');
});

test('every delete button is a labelled bin with no text',()=>{
 const {DeleteButton}=load('delete-button.tsx');
 const html=render(DeleteButton,{label:'Delete Insurance',onClick:()=>{}});
 assert.match(html,/aria-label="Delete Insurance"/);assert.match(html,/title="Delete Insurance"/);assert.match(html,/lucide-trash/);
 assert.doesNotMatch(html.replace(/<[^>]*>/g,''),/\S/,'no visible text');
 const fixed=render(DeleteButton,{label:'Delete Charity',reason:'Keep at least one category of this type.'});
 assert.match(fixed,/<span[^>]*title="Keep at least one category of this type."><button[^>]*disabled=""/,'an undeletable item keeps a disabled bin with its reason');
 assert.match(fixed,/aria-label="Delete Charity. Keep at least one category of this type."/);
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

test('series legend presses the visible series and toggles a key in or out of the hidden list',()=>{
 const {SeriesLegend,toggleKey}=load('series-legend.tsx');
 const items=[{key:'salary',label:'Salary',swatch:React.createElement('i')},{key:'estimate',label:'Estimate',swatch:React.createElement('i',{className:'chart-planned-key'})}];
 assert.equal(render(SeriesLegend,{items,hidden:['estimate'],onToggle:()=>{}}),'<div class="comparison-legend"><button type="button" aria-pressed="true"><i></i>Salary</button><button type="button" aria-pressed="false"><i class="chart-planned-key"></i>Estimate</button></div>');
 assert.match(render(SeriesLegend,{items,hidden:[],onToggle:()=>{},className:'goal-chart-legend'}),/^<div class="comparison-legend goal-chart-legend">/);
 const toggled=[];
 SeriesLegend({items,hidden:[],onToggle:key=>toggled.push(key)}).props.children[1].props.onClick();
 assert.deepEqual(toggled,['estimate']);
 const list=['a'];
 assert.deepEqual(toggleKey(list,'b'),['a','b']);assert.deepEqual(toggleKey(['a','b'],'a'),['b']);assert.deepEqual(list,['a'],'the list is never changed in place');
});

test('panel title keeps the heading, count and hint on one line and the aside on the right',()=>{
 const {PanelTitle}=load('panel-title.tsx',{'@/components/presentation-foundation/info-hint':{InfoHint:({children})=>React.createElement('i',null,children)}});
 const {Count}=load('count.tsx');
 const html=render(PanelTitle,{title:'Recent transactions',count:React.createElement(Count,{value:1234}),hint:'Recorded income and expenses'},React.createElement('a',null,'View all'));
 assert.equal(html,'<div class="panel-title"><h2>Recent transactions<span class="count">1,234</span><i>Recorded income and expenses</i></h2><a>View all</a></div>');
 assert.equal(render(PanelTitle,{title:'Asset allocation'}),'<div class="panel-title"><h2>Asset allocation</h2></div>');
 assert.equal(render(Count,{value:12,loading:true}),'<span class="count">—</span>');
});

test('animated money rolls each digit on its own 0–9 strip and keeps the amount whole for screen readers',()=>{
 const {AnimatedMoney}=load('animated-money.tsx',{'@/lib/format':{formatMoney:value=>(value<0?'-$':'$')+Math.abs(value).toLocaleString('en-US')}});
 const {rollingColumns}=load('rolling-text.tsx');
 const html=render(AnimatedMoney,{value:-20631,currency:'USD'});
 assert.match(html,/<span class="sr-only">-\$20,631<\/span><\/roll-text>$/,'the whole amount for screen readers');
 assert.match(html,/^<roll-text><roll-chars aria-hidden="true"><roll-char>-<\/roll-char><roll-char>\$<\/roll-char><roll-digit>/,'signs and separators stay put');
 assert.equal(html.match(/<roll-digit>/g).length,5,'one strip per digit');
 assert.equal(html.match(/<roll-strip /g).length,5);
 assert.ok(html.includes([...'0123456789'].map(digit=>`<roll-char>${digit}</roll-char>`).join('')),'each strip holds 0–9');
 assert.doesNotMatch(html.replace('<span class="sr-only">',''),/<span/,'no spans for page rules to restyle');
 assert.ok(html.includes('translateY(-0%)'),'digits start at 0 and roll up into place');
 // Keys count from the right, so units stay units when the amount gains a digit and roll instead of jumping.
 assert.deepEqual(rollingColumns('$9').map(item=>item.key),[2,1]);
 assert.deepEqual(rollingColumns('$10').map(item=>[item.key,item.digit]),[[3,null],[2,1],[1,0]]);
 assert.deepEqual(rollingColumns('€1,655').filter(item=>item.digit===null).map(item=>item.char),['€',',']);
});

test('a rolling digit moves only after its strip is drawn, then rests as plain text until it changes',()=>{
 const slots=[];let cursor=0,effects=[],frames=[];
 const react={useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value;}];},
  // The strip's element: it reports the end of its slide the way a browser does.
  useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial===null?node:initial});},
  useLayoutEffect:(effect,deps)=>{const i=cursor++;if(!slots[i]||deps.some((d,k)=>!Object.is(d,slots[i][k]))){slots[i]=deps;effects.push(effect);}}};
 const listeners={},node={addEventListener:(name,listener)=>{listeners[name]=listener;},removeEventListener:(name,listener)=>{if(listeners[name]===listener)delete listeners[name];}};
 const saved={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame};
 globalThis.requestAnimationFrame=cb=>frames.push(cb);globalThis.cancelAnimationFrame=()=>{frames=[];};
 try{
  const {RollingText}=load('rolling-text.tsx',{react});
  let text='7';
  const draw=()=>{cursor=0;const element=RollingText({text}).props.children[0].props.children[0];const tree=element.type(element.props);effects.splice(0).forEach(effect=>effect());return tree.props.children;};
  const frame=()=>frames.splice(0).forEach(cb=>cb());
  assert.equal(draw().props.style.transform,'translateY(-0%)');
  frame();assert.equal(draw().props.style.transform,'translateY(-0%)','not on the first frame');
  frame();const strip=draw();assert.equal(strip.props.style.transform,'translateY(-70%)','rolls to 7 on the second');
  listeners.transitionend();
  const rest=draw();assert.equal(rest.type,'roll-char','at rest the strip gives way to the plain digit');assert.equal(rest.props.children,7);
  // React re-renders after the layout effect and before painting; the second draw is that render.
  text='3';draw();assert.equal(draw().props.style.transform,'translateY(-70%)','a change rolls from where it rests');
  frame();frame();assert.equal(draw().props.style.transform,'translateY(-30%)');
 }finally{globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.caf;}
});

test('info hint keeps its explanation behind a labelled ⓘ button',()=>{
 const popover={Popover:element('span'),PopoverTrigger:element('button'),PopoverContent:({children,className})=>React.createElement('div',{className},children)};
 const {InfoHint}=load('info-hint.tsx',{'@/components/ui/popover':popover});
 const html=render(InfoHint,{},'Yearly records are divided by 12.');
 assert.match(html,/<button class="info-hint" aria-label="Details"><svg[^>]*aria-hidden="true"/);
 assert.match(html,/<div class="info-hint-content">Yearly records are divided by 12\.<\/div>/);
 assert.match(render(InfoHint,{label:'About totals'},'x'),/aria-label="About totals"/);
});

test('every category has its own emoji and colour, and badges never repeat an emoji the name already starts with',()=>{
 const {categoryEmoji,categoryEmojis}=loadTS('lib/category-icons.ts');
 const {categoryHues}=loadTS('lib/category-colors.ts');
 const {kinds}=loadTS('lib/finance.ts');
 assert.deepEqual(Object.keys(categoryEmojis).sort(),Object.keys(categoryHues).sort());
 // Asset kinds sit side by side in the allocation bar: their hues stay at least 30° apart on the colour wheel.
 const assetKinds=['Cash','Stock','Crypto','Deposit','Treasury bill','Property','Business','Valuables','Money lent'];
 for(const [i,a] of assetKinds.entries())for(const b of assetKinds.slice(i+1)){const gap=Math.abs(categoryHues[a]-categoryHues[b]);assert.ok(Math.min(gap,360-gap)>=30,`${a} and ${b} hues are too close`);}
 for(const kind of kinds)assert.ok(categoryEmoji(kind),kind);
 // Lending and borrowing stay visually distinct.
 assert.equal(new Set(['Money lent','Mortgage','Loan','Debt'].map(categoryEmoji)).size,4);
 assert.equal(categoryEmoji('🏋️ Gym'),'🏋️');
 assert.equal(categoryEmoji('Gym'),categoryEmojis.Other);
 const {CategoryBadge}=load('category-badge.tsx');
 assert.equal(render(CategoryBadge,{kind:'Salary',label:'Salary'}),'<span class="badge category-badge" style="--category-hue:120"><span aria-hidden="true">💰</span>Salary</span>');
 assert.doesNotMatch(render(CategoryBadge,{kind:'🏋️ Gym',label:'🏋️ Gym'}),/aria-hidden/);
 const {CategoryIcon}=load('category-icon.tsx');
 assert.equal(render(CategoryIcon,{kind:'Mortgage',size:'sm'}),'<span class="category-icon" data-size="sm" style="--category-hue:350" aria-hidden="true">🏡</span>');
});

test('record icons draw holdings and show the category emoji for income, spending and debts',()=>{
 const {RecordIcon}=load('record-icon.tsx');
 assert.match(render(RecordIcon,{record:{kind:'Stock',name:'AAPL'}}),/<svg class="asset-symbol"/);
 assert.match(render(RecordIcon,{record:{kind:'Living expense',name:'Groceries'}}),/^<span class="record-icon category-record-icon" data-emoji="" style="--category-hue:48" aria-hidden="true">🛒<\/span>$/);
 assert.match(render(RecordIcon,{record:{kind:'Money lent',name:'Loan to a friend'}}),/>🤝<\/span>$/);
});

test('goal covers follow the goal name, then its kind',()=>{
 const {goalEmoji}=loadTS('lib/goal-emoji.ts');
 assert.equal(goalEmoji({name:'Emergency fund',kind:'savings'}),'🧯');
 assert.equal(goalEmoji({name:'Отпуск в Турции',kind:'savings'}),'🏖️');
 assert.equal(goalEmoji({name:'Uy uchun',kind:'net_worth'}),'🏡');
 assert.equal(goalEmoji({name:'Freedom',kind:'net_worth'}),'🎯');
 assert.equal(goalEmoji({name:'Rainy',kind:'savings'}),'🧯');
 assert.equal(goalEmoji({name:'Stack',kind:'investment'},true),'🪙');
 assert.equal(goalEmoji({name:'Stack',kind:'investment'}),'📈');
 assert.equal(goalEmoji({name:'Something',kind:'savings'}),'🐷');
});

test('form footer cancels through its callback and honours the busy state',()=>{
 const {FormFooter}=load('form-footer.tsx');
 assert.equal(render(FormFooter,{onCancel:()=>{}},React.createElement('button',null,'Save')),'<div class="record-form-footer"><button type="button">Cancel</button><button>Save</button></div>');
 assert.match(render(FormFooter,{busy:true,onCancel:()=>{},cancelLabel:'Close'}),/<button type="button" disabled="">Close<\/button>/);
});

test('confirm dialog blocks closing while busy, never submits a form and styles destructive actions',()=>{
 const dialog={};
 for(const name of ['AlertDialog','AlertDialogContent','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'])dialog[name]=element('div');
 dialog.AlertDialogAction=function AlertDialogAction({variant,...props}){return React.createElement('div',{...props,'data-variant':variant});};
 const shown=[];
 const {ConfirmDialog}=load('confirm-dialog.tsx',{'@/components/ui/alert-dialog':dialog,'@/lib/feedback':{showError:message=>shown.push(message)}});
 const confirmed=[];let closed=0;
 const props={open:true,onClose:()=>closed++,title:'Delete this record?',description:'It moves to Recently deleted.',confirmLabel:'Delete record',onConfirm:()=>confirmed.push(1)};
 const html=render(ConfirmDialog,{...props,destructive:true});
 assert.match(html,/Delete this record\?[\s\S]*It moves to Recently deleted\.[\s\S]*Cancel[\s\S]*data-variant="destructive"[\s\S]*Delete record/);
 assert.doesNotMatch(render(ConfirmDialog,props),/data-variant="destructive"|disabled=""/);
 // The red comes from the Button variant; a bg-destructive class on the action loses to the default bg-primary (COMP-039).
 assert.doesNotMatch(fs.readFileSync('components/presentation-foundation/confirm-dialog.tsx','utf8'),/bg-destructive/);
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
 assert.equal(signTone(0),undefined);
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

test('sortable items carry a named six-dot handle, and sortable lists render their items in order',()=>{
 const {SortableList,SortableItem}=load('sortable.tsx');
 const html=render(SortableList,{id:'goals',items:['a','b'],nameOf:id=>id,onMove(){}},React.createElement(SortableItem,{id:'a',label:'Emergency fund',as:'li',className:'goal-row'},'A'),React.createElement(SortableItem,{id:'b',label:'Car'},'B'));
 assert.match(html,/^<li class="sortable-item goal-row"[^>]*><button type="button" class="drag-handle" aria-label="Move Emergency fund"[^>]*aria-roledescription="sortable"[^>]*><svg/);
 assert.ok(html.indexOf('Move Emergency fund')<html.indexOf('Move Car'));
 assert.match(html,/<div class="sortable-item"[^>]*><button[^>]*aria-label="Move Car"/);
 // Wrapping badges (categories) use the grid layout and render the same handles.
 const grid=render(SortableList,{id:'categories',layout:'grid',items:['a'],nameOf:id=>id,onMove(){}},React.createElement(SortableItem,{id:'a',label:'Charity',as:'li'},'A'));
 assert.match(grid,/^<li class="sortable-item"[^>]*><button type="button" class="drag-handle" aria-label="Move Charity"/);
});

test('number fields fill in the maximum and say so instead of ignoring an over-limit entry',()=>{
 globalThis.requestAnimationFrame??=()=>0;
 // A tiny hook store that keeps state between two renders, like React does.
 const state=[];let cursor=0;
 const fakeReact={...React,useState:initial=>{const slot=cursor++;if(slot>=state.length)state.push(typeof initial==='function'?initial():initial);return [state[slot],next=>{state[slot]=next;}];},useRef:current=>({current}),useEffect:()=>{}};
 const {FormattedNumberInput}=load('formatted-number-input.tsx',{react:fakeReact,'@/components/ui/input':{Input:'input'}});
 const calls=[];const props={value:0,max:2.5,maxMessage:'Only 2.5 units available',onValueChange:(value,blank)=>calls.push([value,blank])};
 const field=FormattedNumberInput(props).props.children[0];
 field.props.onChange({currentTarget:{value:'3',selectionStart:1,setSelectionRange(){}}});
 assert.deepEqual(calls,[[2.5,false]]);assert.deepEqual(state,['2.5',true]);
 // Re-render with the state the keystroke left behind: the clamped value and the message.
 cursor=0;
 const shown=FormattedNumberInput({...props,value:2.5});
 const [input,message]=shown.props.children;
 assert.equal(input.props.value,'2.5');
 assert.equal(renderToStaticMarkup(message),'<small role="alert" class="muted">Only 2.5 units available</small>');
 // A later entry within the limit clears the message.
 cursor=0;FormattedNumberInput({...props,value:2.5}).props.children[0].props.onChange({currentTarget:{value:'2',selectionStart:1,setSelectionRange(){}}});
 cursor=0;assert.equal(FormattedNumberInput({...props,value:2}).props.children[1],false);
 // Without a custom message the limit itself is shown.
 state.length=0;cursor=0;
 FormattedNumberInput({value:0,max:100,onValueChange(){}}).props.children[0].props.onChange({currentTarget:{value:'250',selectionStart:3,setSelectionRange(){}}});
 cursor=0;assert.equal(renderToStaticMarkup(FormattedNumberInput({value:100,max:100,onValueChange(){}}).props.children[1]),'<small role="alert" class="muted">Enter 100 or less</small>');
});

test('pagination numbers its pages, hides itself when there is no other page, and moves to the page clicked',()=>{
 const {Pagination,pageNumbers}=load('pagination.tsx');
 assert.deepEqual(pageNumbers(1,4),[1,2,3,4]);
 assert.deepEqual(pageNumbers(1,12),[1,2,3,4,5,'gap',12]);
 assert.deepEqual(pageNumbers(6,12),[1,'gap',5,6,7,'gap',12]);
 assert.deepEqual(pageNumbers(12,12),[1,'gap',8,9,10,11,12]);
 const pages=[];const props={label:'Record pages',summary:'Page 1',page:1,hasNext:false,onPage:page=>pages.push(page)};
 assert.equal(render(Pagination,props),'');
 const html=render(Pagination,{...props,pageCount:3,hasNext:true});
 assert.match(html,/^<nav class="records-pagination" aria-label="Record pages"><span>Page 1<\/span><div><button type="button" class="page-step" aria-label="Previous" disabled="">/);
 assert.match(html,/aria-label="Page 1" aria-current="page">1<\/button>.*aria-label="Page 2">2<\/button>.*aria-label="Page 3">3<\/button>/);
 // A list read a page at a time knows only whether one more page follows.
 assert.match(render(Pagination,{...props,page:2,hasNext:true}),/>1<\/button>.*aria-current="page">2<\/button>.*>3<\/button>/);
 // A later page stays reachable back even when it came up empty.
 assert.match(render(Pagination,{...props,page:2,summary:'Page 2'}),/aria-label="Next" disabled=""/);
 const tree=Pagination({...props,page:2,pageCount:4,hasNext:true});
 const [previous,numbers,next]=tree.props.children[1].props.children;previous.props.onClick();next.props.onClick();numbers[3].props.onClick();numbers[1].props.onClick();
 assert.deepEqual(pages,[1,3,4],'clicking the current page does nothing');
 assert.match(render(Pagination,{...props,page:2,hasNext:true,disabled:true}),/aria-label="Previous" disabled="".*aria-label="Next" disabled=""/);
});

test('the range picker applies a preset at once, takes a custom range from two clicks in either order, and closes',()=>{
 const r=createRenderer();
 const {DateRangePicker}=r.load(`${dir}/date-range-picker.tsx`,{...overrides,'@/components/ui/popover':hostModule(),'@/components/presentation-foundation/date-picker':hostModule(),'lucide-react':hostModule()});
 const chosen=[];let props={label:'Period',presets:['this_month','last_month'],presetLabels:{this_month:'This month',last_month:'Last month'},preset:'this_month',range:{from:'2026-10-01',to:'2026-10-09'},max:'2026-10-09',onPreset:preset=>chosen.push(preset),onRange:range=>chosen.push(range)};
 r.mount(React.createElement(DateRangePicker,props));
 const popover=()=>r.find(byType('Popover'));const calendar=()=>r.find(byType('MonthCalendar'));
 assert.match(r.html(),/aria-label="Period: This month"/);
 r.fire(popover(),'onOpenChange',true);
 assert.deepEqual([calendar().props.draft,calendar().props.rangeTo,calendar().props.max],['2026-10-01','2026-10-09','2026-10-09'],'the calendar marks the chosen days');
 r.fire(calendar(),'onSelect','2026-10-07');
 assert.deepEqual([calendar().props.draft,calendar().props.rangeTo,popover().props.open],['2026-10-07',undefined,true],'the first click waits for the last day');
 assert.match(r.html(),/7 October 2026 – pick the last day/);
 r.fire(calendar(),'onSelect','2026-10-02');
 assert.deepEqual(chosen.pop(),{from:'2026-10-02',to:'2026-10-07'});
 assert.equal(popover().props.open,false);
 r.fire(popover(),'onOpenChange',true);
 const lastMonth=r.find(node=>node.type===overrides['@/components/ui/button'].Button&&node.props['aria-pressed']===false);
 r.fire(lastMonth,'onClick');
 assert.deepEqual([chosen.pop(),popover().props.open],['last_month',false]);
 r.mount(React.createElement(DateRangePicker,{...props,preset:'custom',range:{from:'2026-10-02',to:'2026-10-07'}}));
 assert.match(r.html(),/<span>2 October 2026 – 7 October 2026<\/span>/,'a custom range shows its days through the date formatter');
});

test('the owner filter lists what is shared and each person; nothing selected shows everyone',()=>{
 const pass=({children})=>React.createElement(React.Fragment,null,children);
 const {OwnerFilter}=load('owner-filter.tsx',{'@/components/ui/popover':{Popover:pass,PopoverTrigger:pass,PopoverContent:({children})=>React.createElement('div',null,children)}});
 const owners=[{id:'shared',name:'Shared'},{id:'p1',name:'Alex'},{id:'p2',name:'Sam'}];
 let html=render(OwnerFilter,{owners,value:[],onChange:()=>{}});
 assert.match(html,/<button type="button" class="business-filter-trigger" aria-label="Filter by owner"><svg[^>]*>.*?<\/svg><span>All owners<\/span>/);
 assert.match(html,/<ul role="listbox" aria-multiselectable="true" aria-label="Filter by owner"><li role="option" aria-selected="true">/);
 assert.equal((html.match(/role="option"/g)??[]).length,4);
 html=render(OwnerFilter,{owners,value:['p2'],onChange:()=>{}});
 assert.match(html,/data-active="true"[^>]*>.*?<span>Sam<\/span>/);
 assert.match(render(OwnerFilter,{owners,value:['p1','shared'],onChange:()=>{}}),/<span>2 selected<\/span>/);
});

test('a person avatar shows initials, named on hover and for screen readers',()=>{
 const {PersonAvatar,OwnerAvatar}=load('person-avatar.tsx');
 // An owner is one person, or the household's shared mark.
 assert.equal(render(OwnerAvatar,{owner:{id:'p1',name:'Alex Morgan'},size:'sm'}),render(PersonAvatar,{name:'Alex Morgan',size:'sm'}));
 assert.match(render(OwnerAvatar,{owner:{id:'shared',name:'Shared'}}),/^<span class="person-avatar" data-shared="" data-size="md" role="img" aria-label="Shared" title="Shared"><svg/);
 assert.equal(render(PersonAvatar,{name:'Alex Morgan'}),'<span class="person-avatar" data-size="md" role="img" aria-label="Alex Morgan" title="Alex Morgan">AM</span>');
 assert.match(render(PersonAvatar,{name:'sam@example.com',size:'sm'}),/data-size="sm"[^>]*>S<\/span>$/);
});

test('progress line shows the share over a capped line; only spending past its plan is marked over',()=>{
 const {ProgressLine}=load('progress-line.tsx');
 assert.equal(render(ProgressLine,{value:100,target:400,tone:'expense'}),'<span class="progress-line" data-tone="expense"><small>25%</small><span class="progress-track"><span style="width:25%"></span></span></span>');
 assert.match(render(ProgressLine,{value:300,target:200,tone:'expense'}),/data-over="true"><small>150%<\/small>.*width:100%/);
 assert.equal(render(ProgressLine,{value:1600,target:1500,tone:'income',label:'Received'}),'<span class="progress-line" data-tone="income"><small>Received · 107%</small><span class="progress-track"><span style="width:100%"></span></span></span>');
 assert.match(render(ProgressLine,{value:0,target:0,tone:'income'}),/<small>0%<\/small>.*width:0%/);
});

test('done tick marks a settled row and keeps the same space on an open one',()=>{
 const {DoneTick}=load('done-tick.tsx');
 assert.match(render(DoneTick,{done:true}),/^<span class="done-tick" data-done="true" aria-hidden="true"><svg/);
 assert.equal(render(DoneTick,{done:false}),'<span class="done-tick" aria-hidden="true"></span>');
});

test('the scheduled payment field offers each schedule by id, with its amount and how often it repeats',()=>{
 const {ScheduledPaymentField}=load('scheduled-payment-field.tsx',{'@/components/ui/native-select':{NativeSelect:element('select')}});
 const rent={id:'r1',name:'Flat rent',kind:'Rent expense',currency:'USD',amount:700,frequency:'Monthly',date:'2026-01-10',quantity:1,cost:0,rate:0,notes:''};
 const html=render(ScheduledPaymentField,{schedules:[rent],value:'r1',onChange(){}});
 assert.equal(html,'<label>Scheduled payment<select><option value="">Not a scheduled payment</option><option value="r1" selected="">Flat rent · $700 · Every month</option></select></label>');
 // Nothing to offer: no field at all.
 assert.equal(render(ScheduledPaymentField,{schedules:[],value:null,onChange(){}}),'');
});

test('the day-of-month field offers the start month\'s days and moves the date within that month',()=>{
 const {MonthDayField}=load('month-day-field.tsx',{'@/components/ui/native-select':{NativeSelect:element('select')}});
 const html=render(MonthDayField,{date:'2026-09-05',onChange(){}});
 assert.match(html,/^<label>Day of the month<select><option value="1">1<\/option>/);
 assert.match(html,/<option value="5" selected="">5<\/option>/);
 assert.match(html,/<option value="30">30<\/option><\/select><\/label>$/,'September has 30 days');
 const moved=[];
 const tree=MonthDayField({date:'2026-09-05',onChange:date=>moved.push(date)});
 tree.props.children[1].props.onChange({target:{value:'20'}});
 assert.deepEqual(moved,['2026-09-20']);
 assert.equal(render(MonthDayField,{date:'',onChange(){}}),'','no date, no field');
});

test('every chart takes its look from the shared chart kit, never inline styles', () => {
 const charts = fs.globSync('components/**/*.tsx').filter(file => /from 'recharts'/.test(fs.readFileSync(file, 'utf8')));
 assert.ok(charts.length >= 10, 'finds the charts');
 for (const file of charts) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /from '@\/components\/presentation-foundation\/chart'/, file + ' imports the chart kit');
  assert.match(source, /<CartesianGrid \{\.\.\.chartGrid\}\/>|<Sankey|<PieChart/, file + ' uses the shared grid');
  // Styling the kit owns: grid dashes, axis lines, tooltip boxes, bar widths, animation and gradients.
  assert.doesNotMatch(source, /strokeDasharray="(2 6|3 3|3 5)"|contentStyle=|axisLine=\{false\}|tickLine=\{false\}|maxBarSize=|isAnimationActive=\{false\}|<linearGradient/, file + ' keeps chart styling in the kit');
 }
});

test('interval labels name a month, quarter or year through the shared formatters in every language', () => {
 const {intervalLabel}=load('chart.tsx');
 const {translate,locales}=loadTS('lib/i18n.ts');
 const labels=language=>{
  const t=(key,values)=>translate(language,key,values),locale=locales[language];
  return [intervalLabel('month',locale,t)('2026-07'),intervalLabel('month',locale,t,true)('2026-07'),intervalLabel('quarter',locale,t)('2026-Q3'),intervalLabel('year',locale,t)('2026')];
 };
 assert.deepEqual(labels('en'),['Jul','July 2026','Q3 2026','2026']);
 const [ruShort,ruLong,ruQuarter,ruYear]=labels('ru');
 assert.match(ruShort,/^июл/i);assert.match(ruLong,/^июль 2026$/i);assert.equal(ruQuarter,'3 кв. 2026');assert.equal(ruYear,'2026');
 const [,uzLong,uzQuarter,uzYear]=labels('uz');
 assert.match(uzLong,/^iyul 2026$/i);assert.equal(uzQuarter,'2026, 3-chorak');assert.equal(uzYear,'2026');
 assert.ok(labels('en').every(label=>!/^\d{4}-\d{2}$/.test(label)),'never the stored key');
});

test('the history chart draws what was recorded inside an outline named by its caller, and hides a series from its legend',()=>{
 const h=React.createElement,pass=name=>Object.assign(({children})=>h('div',{'data-part':name},children),{displayName:name});
 const Bar=Object.assign(({dataKey})=>h('span',{'data-bar':dataKey}),{displayName:'Bar'});
 const recharts={...Object.fromEntries(['ResponsiveContainer','BarChart','CartesianGrid','XAxis','YAxis','Tooltip'].map(name=>[name,pass(name)])),Bar};
 const r=createRenderer();
 const {HistoryChart}=r.load(`${dir}/history-chart.tsx`,{...overrides,recharts});
 const points=[{month:'2026-09',scheduled:700,recorded:70},{month:'2026-10',scheduled:700,recorded:630}];
 r.mount(h(HistoryChart,{points,currency:'USD',fill:'var(--foreground)',done:'Spent',outline:'Planned'}));
 assert.deepEqual(r.all(byType(Bar)).map(bar=>bar.props.dataKey),['scheduled','recorded']);
 const legend=r.find(node=>Array.isArray(node.props?.items)&&node.props.onToggle);
 assert.deepEqual(legend.props.items.map(item=>item.label),['Spent','Planned']);
 legend.props.onToggle('scheduled');r.update();
 assert.deepEqual(r.all(byType(Bar)).map(bar=>bar.props.dataKey),['recorded']);
 r.mount(h(HistoryChart,{points,currency:'USD',fill:'red',done:'Paid'}));
 assert.equal(r.find(node=>Array.isArray(node.props?.items)&&node.props.onToggle).props.items[1].label,'Scheduled payment','a schedule is the outline by default');
});
