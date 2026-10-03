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
 const html=render(EmptyState,{icon:React.createElement('svg'),title:'A fresh start',description:'Add a record to begin.'},React.createElement('button',null,'Add'));
 assert.equal(html,'<div class="empty"><svg></svg><h3>A fresh start</h3><p>Add a record to begin.</p><button>Add</button></div>');
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
});

test('row menu keeps rare actions behind one labelled ⋯ button and disappears when there are none',()=>{
 const passthrough=tag=>function Part({children,...props}){delete props.asChild;delete props.align;delete props.onSelect;delete props.variant;return React.createElement(tag,props,children);};
 const menu={DropdownMenu:({children})=>React.createElement(React.Fragment,null,children),DropdownMenuTrigger:passthrough('span'),DropdownMenuContent:passthrough('div'),DropdownMenuItem:passthrough('button')};
 const {RowMenu}=load('row-menu.tsx',{'@/components/ui/dropdown-menu':menu});
 const html=render(RowMenu,{label:'Actions for Rent',items:[false,{label:'Edit',onSelect:()=>{}},null,{label:'Delete',destructive:true,onSelect:()=>{}}]});
 assert.match(html,/aria-label="Actions for Rent"/);
 assert.deepEqual([...html.matchAll(/<button[^>]*>(Edit|Delete)<\/button>/g)].map(match=>match[1]),['Edit','Delete']);
 assert.equal(render(RowMenu,{label:'Actions',items:[false,null]}),'');
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

test('panel title keeps the heading, count and hint on one line and the aside on the right',()=>{
 const {PanelTitle}=load('panel-title.tsx',{'@/components/presentation-foundation/info-hint':{InfoHint:({children})=>React.createElement('i',null,children)}});
 const {Count}=load('count.tsx');
 const html=render(PanelTitle,{title:'Recent transactions',count:React.createElement(Count,{value:1234}),hint:'Recorded income and expenses'},React.createElement('a',null,'View all'));
 assert.equal(html,'<div class="panel-title"><h2>Recent transactions<span class="count">1,234</span><i>Recorded income and expenses</i></h2><a>View all</a></div>');
 assert.equal(render(PanelTitle,{title:'Asset allocation'}),'<div class="panel-title"><h2>Asset allocation</h2></div>');
 assert.equal(render(Count,{value:12,loading:true}),'<span class="count">—</span>');
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

test('pagination hides itself when there is no other page, and otherwise moves one page at a time',()=>{
 const {Pagination}=load('pagination.tsx');
 const pages=[];const props={label:'Record pages',summary:'Page 1',page:1,hasNext:false,onPage:page=>pages.push(page)};
 assert.equal(render(Pagination,props),'');
 assert.equal(render(Pagination,{...props,hasNext:true}),'<nav class="records-pagination" aria-label="Record pages"><span>Page 1</span><div><button disabled="">Previous</button><button>Next</button></div></nav>');
 // A later page stays reachable back even when it came up empty.
 assert.match(render(Pagination,{...props,page:2,summary:'Page 2'}),/<button>Previous<\/button><button disabled="">Next<\/button>/);
 const tree=Pagination({...props,page:2,hasNext:true});
 const [previous,next]=tree.props.children[1].props.children;previous.props.onClick();next.props.onClick();
 assert.deepEqual(pages,[1,3]);
 assert.match(render(Pagination,{...props,page:2,hasNext:true,disabled:true}),/<button disabled="">Previous<\/button><button disabled="">Next<\/button>/);
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
