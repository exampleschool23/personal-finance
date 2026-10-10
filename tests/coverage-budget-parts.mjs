import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

// A tiny renderer: expands every function component (so nested pieces run), keeps hook state per
// component path between renders, and leaves UI kit pieces as plain host elements whose handlers
// the tests call directly.
const hookState={store:new Map(),key:'',index:0};
const reactStub={...React,
 useState(initial){const id=hookState.key+'#'+hookState.index++;const store=hookState.store;if(!store.has(id))store.set(id,typeof initial==='function'?initial():initial);return [store.get(id),value=>store.set(id,typeof value==='function'?value(store.get(id)):value)];},
 useRef(initial){const id=hookState.key+'#'+hookState.index++;const store=hookState.store;if(!store.has(id))store.set(id,{current:initial});return store.get(id);},
 useMemo:factory=>factory(),
};
const errors=[];
const host=name=>'x-'+name;
const icons=new Proxy({},{get:(_,name)=>typeof name==='string'?'icon-'+name:undefined});
const interpolate=(key,vars={})=>key.replace(/\{(\w+)\}/g,(_,name)=>String(vars[name]));
const overrides={
 react:reactStub,
 'lucide-react':icons,
 '@/components/language-provider':{useLanguage:()=>({t:(key,vars)=>interpolate('T:'+key,vars),locale:'en-US'})},
 '@/components/presentation-foundation/category-icon':{CategoryIcon:host('category-icon')},
 '@/components/presentation-foundation/date-picker':{DatePicker:host('date-picker')},
 '@/components/presentation-foundation/drawer-link':{DrawerLink:host('drawer-link')},
 '@/components/presentation-foundation/form-footer':{FormFooter:host('form-footer')},
 '@/components/presentation-foundation/formatted-number-input':{FormattedNumberInput:host('number-input')},
 '@/components/presentation-foundation/info-hint':{InfoHint:host('info-hint')},
 '@/components/presentation-foundation/segmented':{Segmented:host('segmented')},
 // Rolling digits are covered in presentation-foundation; here a figure is its formatted text.
 '@/components/presentation-foundation/rolling-text':{RollingText:({text})=>text},
 '@/components/ui/button':{Button:host('button')},
 'next/link':{__esModule:true,default:host('link')},
 '@/components/ui/dialog':{Dialog:host('dialog'),DialogContent:host('dialog-content'),DialogTitle:host('dialog-title')},
 '@/components/ui/popover':{Popover:host('popover'),PopoverAnchor:host('popover-anchor'),PopoverContent:host('popover-content')},
 '@/lib/feedback':{showError:message=>errors.push(message)},
};
// The budget screen's parts, loaded together as one module would be.
const cache=new Map();
const page=Object.assign({},...['budget-rows','planned-input','left-to-budget-card','settings-dialogs'].map(name=>loadTS(`components/budget/${name}.tsx`,overrides,cache)));
const {formatMoney,formatSignedMoney,formatMonthShort,formatMonthYear}=loadTS('lib/format.ts');
const {goalEmoji}=loadTS('lib/goal-emoji.ts');
const money=value=>formatMoney(value,'USD','en-US');

function expand(node,path){
 if(node===null||node===undefined||typeof node==='boolean')return null;
 if(typeof node!=='object')return node;
 if(Array.isArray(node))return node.map((child,i)=>expand(child,path+'.'+(child?.key??i)));
 if(typeof node.type==='function'){
  const key=path+'/'+node.type.name;hookState.key=key;hookState.index=0;
  return expand(node.type(node.props),key);
 }
 const {children,...props}=node.props??{};
 return {type:node.type,props,children:expand(children,path+'/'+String(node.type?.toString?.()??node.type))};
}
/** Mounts an element; `render()` re-renders it with the kept hook state, `rerender(next)` with new props. */
function mount(element){
 hookState.store=new Map();const store=hookState.store;
 const view={tree:null,render(){hookState.store=store;view.tree=expand(element,'');return view;},rerender(next){element=next;return view.render();}};
 return view.render();
}
function nodes(tree,predicate,out=[]){
 if(Array.isArray(tree)){for(const child of tree)nodes(child,predicate,out);return out;}
 if(!tree||typeof tree!=='object')return out;
 if(predicate(tree))out.push(tree);
 nodes(tree.children,predicate,out);return out;
}
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.children):tree===null||tree===undefined?'':String(tree);
const all=(view,type,extra=()=>true)=>nodes(view.tree,node=>node.type===type&&extra(node));
const one=(view,type,extra)=>{const found=all(view,type,extra);assert.equal(found.length,1,`expected one ${type}`);return found[0];};
const byClass=(view,className)=>nodes(view.tree,node=>node.props.className===className);
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

const row=(overrides={})=>({key:'groceries',name:'Groceries',custom:false,direction:'expense',type:'flexible',group:'Everyday spending',excluded:false,rollover:false,rolloverStart:null,rolloverBalance:0,rolloverCurrency:null,rolloverNegative:false,budget:500,actual:200,rolloverIn:0,remaining:300,progress:.4,...overrides});

test('useCategoryName translates built-in names and keeps custom names as typed',()=>{
 const name=page.useCategoryName();
 assert.equal(name({name:'Groceries',custom:false}),'T:Groceries');
 assert.equal(name({name:'Dog walker',custom:true}),'Dog walker');
});

test('BudgetProgress clamps width and flags overspent expenses only',()=>{
 const width=view=>one(view,'div',node=>node.props.style).props.style.width;
 let view=mount(React.createElement(page.BudgetProgress,{row:{progress:1.7,direction:'expense',remaining:-20}}));
 assert.equal(width(view),'100%');assert.equal(view.tree.props['data-over'],true);assert.equal(view.tree.props['aria-hidden'],'true');
 view=mount(React.createElement(page.BudgetProgress,{row:{progress:-1,direction:'expense',remaining:null}}));
 assert.equal(width(view),'0%');assert.equal(view.tree.props['data-over'],undefined);
 view=mount(React.createElement(page.BudgetProgress,{row:{progress:.25,direction:'income',remaining:-5}}));
 assert.equal(width(view),'25%');assert.equal(view.tree.props['data-over'],undefined);
});

test('BudgetSectionHeader and BudgetTotalRow show columns and formatted totals',()=>{
 const header=mount(React.createElement(page.BudgetSectionHeader,{title:'Expenses'}));
 assert.equal(text(header.tree),'ExpensesT:PlannedT:ActualT:Remaining');
 const total=mount(React.createElement(page.BudgetTotalRow,{label:'Total',planned:1200.6,actual:1300,remaining:-99.4,direction:'expense',currency:'USD'}));
 assert.equal(text(total.tree),'Total'+money(1200.6)+money(1300)+money(-99.4));
 assert.equal(money(1200.6),'$1,201');
 const pill=byClass(total,'budget-pill')[0];assert.equal(pill.props['data-tone'],'negative');
});

test('BudgetGroupCard: collapsed card shows only totals and the toggle',()=>{
 const calls=[];
 const group={name:'Everyday spending',direction:'expense',type:'flexible',rows:[row()],budget:500,actual:200,remaining:300};
 const view=mount(React.createElement(page.BudgetGroupCard,{group,currency:'USD',open:false,onToggle:()=>calls.push('toggle'),showUnbudgeted:false,onShowUnbudgeted(){},renderPlanned:()=>'P',onOpen(){}}));
 assert.equal(view.tree.props['data-open'],undefined);
 const toggle=byClass(view,'budget-group-toggle')[0];
 assert.equal(toggle.props['aria-expanded'],false);
 assert.equal(all(view,'icon-ChevronRight').length,1);
 assert.equal(all(view,'x-button').length,0,'no settings button without onGroupSettings');
 assert.equal(byClass(view,'budget-rollover').length,0);
 assert.equal(byClass(view,'budget-row budget-category-row').length,0);
 assert.match(text(view.tree),new RegExp(`T:Everyday spending\\$500\\$200\\$300`));
 toggle.props.onClick();assert.deepEqual(calls,['toggle']);
});

test('BudgetGroupCard: each row ends with its menu, after Remaining; every row keeps that last column',()=>{
 const group={name:'Everyday spending',direction:'expense',type:'flexible',rows:[row(),row({key:'rent',name:'Rent',budget:900})],budget:1400,actual:200,remaining:1200};
 const view=mount(React.createElement(page.BudgetGroupCard,{group,currency:'USD',open:true,onToggle(){},showUnbudgeted:false,onShowUnbudgeted(){},renderPlanned:()=>'P',onOpen(){},rowMenu:item=>item.key==='rent'?'MENU:'+item.key:null}));
 const rows=byClass(view,'budget-row budget-category-row');
 assert.equal(rows.length,2);
 // The menu cell comes right after the Remaining cell (only the progress line follows it).
 const cells=rows.map(item=>item.children.flat(Infinity).filter(child=>child&&typeof child==='object'));
 assert.deepEqual(cells.map(list=>list.findIndex(child=>child.props?.className==='budget-row-end')),[4,4]);
 assert.deepEqual(byClass(view,'budget-row-end').map(text),['','','MENU:rent'],'the group row has an empty end cell; the menu shows only where there is one');
});

test('BudgetGroupCard: open card renders rows, rollover, settings and the unbudgeted toggle',()=>{
 const calls=[];
 const rows=[
  row(),
  row({key:'custom:1',name:'Dog walker',custom:true,rollover:true,rolloverIn:40,budget:100,actual:120,remaining:-20,progress:1.2}),
  row({key:'books',name:'Books',budget:null,actual:0,rolloverIn:0,remaining:null,progress:0}),
 ];
 const group={name:'Everyday spending',direction:'expense',type:'flexible',rows,budget:600,actual:320,remaining:280};
 const props={group,currency:'USD',open:true,onToggle(){},showUnbudgeted:false,onShowUnbudgeted:()=>calls.push('unbudgeted'),renderPlanned:item=>'planned:'+item.key,onOpen:item=>calls.push('open:'+item.key),header:'HEADER',footer:'FOOTER',rolloverIn:-15,onGroupSettings:()=>calls.push('group')};
 let view=mount(React.createElement(page.BudgetGroupCard,props));
 assert.equal(view.tree.props['data-open'],true);
 assert.equal(all(view,'icon-ChevronDown').length,1);
 // Header replaces the planned total; the group's own rollover is signed.
 assert.match(text(view.tree),/HEADER/);
 assert.equal(text(byClass(view,'budget-rollover')[0]),`T:${formatSignedMoney(-15,'USD','en-US')} rolled over`);
 const settings=one(view,'x-button');assert.equal(settings.props['aria-label'],'T:Category settings: T:Everyday spending');
 settings.props.onClick();
 const categoryRows=byClass(view,'budget-row budget-category-row');
 assert.equal(categoryRows.length,2,'unbudgeted Books is hidden');
 const names=byClass(view,'budget-category-name');
 assert.equal(names[0].props['aria-label'],'T:Open T:Groceries','tapping a category opens its details');
 assert.equal(names[1].props['aria-label'],'T:Open Dog walker');
 assert.equal(one(view,'x-category-icon',node=>node.props.kind==='Dog walker').props.size,'sm');
 assert.equal(all(view,'x-category-icon',node=>node.props.kind==='groceries').length,1);
 assert.equal(all(view,'icon-RefreshCw').length,1);
 assert.equal(all(view,'icon-RefreshCw')[0].props['aria-label'],'T:Rollover');
 assert.equal(text(categoryRows[1]),`Dog walkerT:${formatSignedMoney(40,'USD','en-US')} rolled overplanned:custom:1${money(120)}${money(-20)}`);
 assert.equal(formatSignedMoney(40,'USD','en-US'),'+$40');
 names[1].props.onClick();
 assert.equal(text(nodes(view.tree,node=>node.props.className==='budget-group')[0]).includes('FOOTER'),true);
 const unbudgeted=byClass(view,'budget-unbudgeted')[0];
 assert.equal(text(unbudgeted),'T:Show 1 unbudgeted');assert.equal(all(view,'icon-Eye').length,1);
 unbudgeted.props.onClick();
 assert.deepEqual(calls,['group','open:custom:1','unbudgeted']);
 const pills=byClass(view,'budget-pill');
 assert.deepEqual(pills.map(pill=>pill.props['data-tone']),['positive','positive','negative']);
 // Expanded: every row is visible and the toggle collapses them again.
 view=mount(React.createElement(page.BudgetGroupCard,{...props,showUnbudgeted:true}));
 assert.equal(byClass(view,'budget-row budget-category-row').length,3);
 assert.equal(text(byClass(view,'budget-unbudgeted')[0]),'T:Collapse 1 unbudgeted');
 assert.equal(all(view,'icon-EyeOff').length,1);
 assert.equal(text(byClass(view,'budget-row budget-category-row')[2]).includes('—'),true,'missing remaining shows a dash');
});

test('BudgetGroupCard: no unbudgeted toggle when every row has a budget',()=>{
 const group={name:'Income',direction:'income',type:null,rows:[row({direction:'income',budget:1000,actual:1200,remaining:-200})],budget:1000,actual:1200,remaining:-200};
 const view=mount(React.createElement(page.BudgetGroupCard,{group,currency:'USD',open:true,onToggle(){},showUnbudgeted:false,onShowUnbudgeted(){},renderPlanned:()=>null,onOpen(){}}));
 assert.equal(byClass(view,'budget-unbudgeted').length,0);
 assert.deepEqual(byClass(view,'budget-pill').map(pill=>pill.props['data-tone']),['positive','positive'],'income above plan is green');
});

test('BudgetGroupCard: a bare card lists only its categories, always open',()=>{
 const group={name:'Expenses',direction:'expense',type:null,rows:[row()],budget:500,actual:200,remaining:300};
 const view=mount(React.createElement(page.BudgetGroupCard,{group,currency:'USD',open:true,bare:true,onToggle(){},showUnbudgeted:false,onShowUnbudgeted(){},renderPlanned:()=>'P',onOpen(){}}));
 assert.equal(byClass(view,'budget-row budget-group-row').length,0,'no group heading');
 assert.equal(byClass(view,'budget-group-toggle').length,0);
 assert.equal(byClass(view,'budget-row budget-category-row').length,1);
 assert.equal(byClass(view,'drag-handle').length,0,'categories no longer move between groups');
});

test('ContributionRows lists goals with their monthly amount or a dash and links to Goals',()=>{
 const goals=[{id:'a',name:'Vacation',kind:'savings'},{id:'b',name:'Car',kind:'savings'}];
 const view=mount(React.createElement(page.ContributionRows,{goals,currency:'USD',amountOf:goal=>goal.id==='a'?250.4:null}));
 const rows=byClass(view,'budget-row budget-category-row');
 assert.equal(rows.length,2);
 assert.equal(text(rows[0]),goalEmoji(goals[0])+'Vacation$250——');
 assert.equal(text(rows[1]),goalEmoji(goals[1])+'Car———');
 const link=one(view,'x-drawer-link');assert.equal(link.props.href,'/goals');assert.equal(text(link),'T:Edit contributions in Goals');
});

const left={income:3000,expenses:2000,contributions:250,left:750,flexible:900};
const leftRows=[
 row({key:'salary',name:'Salary',direction:'income',type:'fixed',budget:3000,actual:1000,progress:.33}),
 row({key:'bonus',name:'Bonus',custom:true,direction:'income',type:'fixed',budget:null,actual:400,progress:1}),
 row({key:'gifts',name:'Gifts',direction:'income',type:'fixed',budget:null,actual:0}),
 row({key:'refund',name:'Refund',direction:'income',type:'fixed',budget:100,actual:0,excluded:true}),
 row({key:'rent',name:'Rent',type:'fixed',budget:1500,actual:1600,rolloverIn:0}),
 row({key:'groceries',type:'flexible',budget:400,actual:250}),
 row({key:'trip',name:'Trip',type:'non_monthly',budget:null,actual:0,rolloverIn:0}),
 row({key:'excluded',name:'Ignored',type:'non_monthly',budget:999,actual:999,excluded:true}),
];

test('LeftToBudgetCard summary tab shows planned figures with the left tone',()=>{
 const view=mount(React.createElement(page.LeftToBudgetCard,{left,rows:leftRows,mode:'category',currency:'USD'}));
 assert.equal(view.tree.props['aria-label'],'T:Left to budget');
 assert.equal(byClass(view,'budget-left-figure')[0].props['data-tone'],'positive');
 const summary=byClass(view,'budget-left-summary')[0];
 assert.equal(text(summary),`T:Planned income${money(3000)}T:Planned spending${money(2000)}T:Contributions${money(250)}T:Left to budget${money(750)}`);
 const segmented=one(view,'x-segmented');
 assert.deepEqual(segmented.props.options.map(option=>option.value),['summary','income','expenses']);
 assert.equal(segmented.props.value,'summary');
 const negative=mount(React.createElement(page.LeftToBudgetCard,{left:{...left,left:-50},rows:[],mode:'category',currency:'USD'}));
 assert.equal(byClass(negative,'budget-left-figure')[0].props['data-tone'],'negative');
});

test('LeftToBudgetCard income tab lists planned or earned income, skipping excluded and empty rows',()=>{
 const view=mount(React.createElement(page.LeftToBudgetCard,{left,rows:leftRows,mode:'category',currency:'USD'}));
 one(view,'x-segmented').props.onChange('income');view.render();
 assert.equal(byClass(view,'budget-left-summary').length,0);
 const items=all(view,'li');
 assert.equal(items.length,2);
 assert.equal(text(items[0]),`T:SalaryT:${money(3000)} plannedT:${money(1000)} earnedT:${money(2000)} remaining`);
 assert.equal(text(items[1]),`BonusT:${money(0)} plannedT:${money(400)} earnedT:${money(0)} remaining`,'remaining never goes negative');
 const empty=mount(React.createElement(page.LeftToBudgetCard,{left,rows:[],mode:'category',currency:'USD'}));
 one(empty,'x-segmented').props.onChange('income');empty.render();
 assert.equal(text(byClass(empty,'budget-left-empty')[0]),'T:Add planned income to see it here.');
});

test('LeftToBudgetCard expenses tab buckets spending by type; flex mode uses the flexible amount',()=>{
 const view=mount(React.createElement(page.LeftToBudgetCard,{left,rows:leftRows,mode:'category',currency:'USD'}));
 one(view,'x-segmented').props.onChange('expenses');view.render();
 let items=all(view,'li');
 assert.equal(items.length,2,'empty non-monthly bucket is dropped');
 assert.equal(text(items[0]),`T:FixedT:${money(1500)} plannedT:${money(1600)} spentT:${money(100)} over`);
 assert.equal(nodes(items[0],node=>node.props['data-tone'])[0].props['data-tone'],'negative');
 assert.equal(text(items[1]),`T:FlexibleT:${money(400)} plannedT:${money(250)} spentT:${money(150)} remaining`);
 const widths=nodes(view.tree,node=>node.props.style).map(node=>node.props.style.width);
 assert.deepEqual(widths,['100%','62.5%']);
 // Flex mode: the flexible bucket is planned from left.flexible.
 const flex=mount(React.createElement(page.LeftToBudgetCard,{left,rows:leftRows,mode:'flex',currency:'USD'}));
 one(flex,'x-segmented').props.onChange('expenses');flex.render();
 items=all(flex,'li');
 assert.equal(text(items[1]),`T:FlexibleT:${money(900)} plannedT:${money(250)} spentT:${money(650)} remaining`);
 // Flex mode with no flexible amount yet: spending alone fills the bar.
 const unplanned=mount(React.createElement(page.LeftToBudgetCard,{left:{...left,flexible:null},rows:[row({type:'flexible',budget:null,actual:80})],mode:'flex',currency:'USD'}));
 one(unplanned,'x-segmented').props.onChange('expenses');unplanned.render();
 assert.equal(text(all(unplanned,'li')[0]),`T:FlexibleT:${money(0)} plannedT:${money(80)} spentT:${money(80)} over`);
 assert.deepEqual(nodes(unplanned.tree,node=>node.props.style).map(node=>node.props.style.width),['100%']);
 const empty=mount(React.createElement(page.LeftToBudgetCard,{left,rows:[],mode:'category',currency:'USD'}));
 one(empty,'x-segmented').props.onChange('expenses');empty.render();
 assert.match(text(byClass(empty,'budget-left-empty')[0]),/haven’t added any expense budgets/);
});

const history={months:[{month:'2026-05',amount:100,planned:80},{month:'2026-06',amount:0,planned:null},{month:'2026-07',amount:50,planned:200}],lastMonth:50,average:50};

test('PlannedInput opens History on focus, edits the draft and saves on close',async()=>{
 const saves=[],repeats=[];
 const onRepeat=async(amount,forward)=>{repeats.push([amount,forward]);};
 const view=mount(React.createElement(page.PlannedInput,{label:'Planned: Groceries',value:500,history,direction:'expense',currency:'USD',defaultForward:false,appliesForward:false,onSave:async(amount,forward)=>{saves.push([amount,forward]);},onRepeat}));
 const popover=()=>one(view,'x-popover');
 assert.equal(popover().props.open,false);
 const input=one(view,'x-number-input');
 assert.equal(input.props.ariaLabel,'Planned: Groceries');assert.equal(input.props.value,500);assert.equal(input.props.displayFractionDigits,0);
 one(view,'span',node=>node.props.className==='budget-input').props.onFocus();view.render();
 assert.equal(popover().props.open,true);
 // History panel content.
 const panel=byClass(view,'budget-history')[0];
 assert.match(text(panel),new RegExp(`T:History\\${money(50)}T:Spent last month\\${money(50)}T:Monthly average`));
 const bars=all(view,'li');
 const months=['2026-05','2026-06','2026-07'].map(month=>formatMonthYear(month,'en-US'));
 assert.deepEqual(bars.map(bar=>bar.props.title),[`${months[0]} · T:Actual ${money(100)} · T:Planned ${money(80)}`,`${months[1]} · T:Actual ${money(0)}`,`${months[2]} · T:Actual ${money(50)} · T:Planned ${money(500)}`],'the edited month is planned at the amount being typed');
 assert.deepEqual(bars.map(bar=>bar.props['data-current']),[undefined,undefined,true]);
 assert.deepEqual(nodes(bars,node=>node.type==='span').map(span=>span.props.style.height),['20%','2%','10%']);
 assert.deepEqual(nodes(bars,node=>node.type==='i').map(mark=>mark.props.style.bottom),['16%','100%'],'a month without a plan has no mark');
 assert.deepEqual(nodes(bars,node=>node.type==='small').map(text),['2026-05','2026-06','2026-07'].map(month=>formatMonthShort(month,'en-US')));
 assert.equal(byClass(view,'budget-history-bars')[0].props['data-direction'],'expense');
 // Closing without changes does not save.
 popover().props.onOpenChange(true);popover().props.onOpenChange(false);await flush();
 assert.deepEqual(saves,[]);
 // Ticking "apply forward" saves at once, with the amount being typed; closing afterwards saves nothing more.
 one(view,'x-number-input').props.onValueChange(620);view.render();
 assert.match(text(byClass(view,'budget-history-forward')[0]),new RegExp(`Apply \\${money(620)} to all future months`));
 const checkbox=one(view,'input',node=>node.props.type==='checkbox');assert.equal(checkbox.props.checked,false);
 checkbox.props.onChange({currentTarget:{checked:true}});await flush();
 assert.deepEqual(repeats,[[620,true]],'the tick saves right away, through the repeat save');
 view.rerender(React.createElement(page.PlannedInput,{label:'Planned: Groceries',value:620,history,direction:'expense',currency:'USD',defaultForward:false,appliesForward:true,onSave:async(amount,forward)=>{saves.push([amount,forward]);},onRepeat}));
 assert.equal(one(view,'input',node=>node.props.type==='checkbox').props.checked,true,'the tick follows what is saved');
 one(view,'input',node=>node.props.type==='checkbox').props.onChange({currentTarget:{checked:false}});await flush();
 assert.deepEqual(repeats,[[620,true],[620,false]],'unticking saves this month only (BUD-027: later months then plan nothing)');
 assert.deepEqual(saves,[],'the tick never goes through the amount save');
});

test('PlannedInput: an amount edited while it applies forward keeps applying forward',async()=>{
 const saves=[];
 const view=mount(React.createElement(page.PlannedInput,{label:'Rent',value:500,history,direction:'expense',currency:'USD',defaultForward:false,appliesForward:true,onSave:async(amount,forward)=>{saves.push([amount,forward]);}}));
 assert.equal(one(view,'input',node=>node.props.type==='checkbox').props.checked,true);
 one(view,'x-number-input').props.onValueChange(550);view.render();
 one(view,'x-popover').props.onOpenChange(false);await flush();
 assert.deepEqual(saves,[[550,true]]);
});

test('PlannedInput: a saved amount no rate converts reads — and offers no input, so it is never saved as 0',async()=>{
 const saves=[];
 const view=mount(React.createElement(page.PlannedInput,{label:'Planned: Groceries',value:null,history,direction:'expense',currency:'USD',defaultForward:false,appliesForward:false,onSave:async(amount,forward)=>{saves.push([amount,forward]);}}));
 assert.equal(all(view,'x-number-input').length,0,'no input');
 assert.equal(all(view,'x-popover').length,0,'no History popover');
 const pill=one(view,'span',node=>node.props.className==='budget-pill');
 assert.equal(text(pill),'—');
 assert.match(pill.props['aria-label'],/^Planned: Groceries: T:Exchange rate unavailable\.$/);
 assert.equal(pill.props.title,'T:Exchange rate unavailable.');
 await flush();
 assert.deepEqual(saves,[],'onSave is never called');
});

test('PlannedInput: Enter commits and blurs; other keys do nothing; focus clicks inside the anchor are kept',async()=>{
 const saves=[];
 const view=mount(React.createElement(page.PlannedInput,{label:'Salary',value:1000,history,direction:'income',currency:'USD',defaultForward:true,appliesForward:false,onSave:async(amount,forward)=>{saves.push([amount,forward]);}}));
 assert.match(text(byClass(view,'budget-history')[0]),/T:Earned last month/);
 const anchorSpan=()=>one(view,'span',node=>node.props.className==='budget-input');
 let prevented=0,blurred=0;
 anchorSpan().props.onKeyDown({key:'a',preventDefault:()=>prevented++,target:{blur:()=>blurred++}});
 assert.equal(prevented+blurred,0);
 one(view,'x-number-input').props.onValueChange(1100);view.render();
 anchorSpan().props.onKeyDown({key:'Enter',preventDefault:()=>prevented++,target:{blur:()=>blurred++}});await flush();
 assert.deepEqual([prevented,blurred],[1,1]);
 assert.deepEqual(saves,[[1100,true]]);
 // Popover handlers: auto focus is suppressed, outside interaction inside the anchor is ignored.
 const content=one(view,'x-popover-content');
 let autoFocus=0;content.props.onOpenAutoFocus({preventDefault:()=>autoFocus++});assert.equal(autoFocus,1);
 const ref=anchorSpan().props.ref;
 let outside=0;
 content.props.onInteractOutside({target:'node',preventDefault:()=>outside++});assert.equal(outside,0,'no anchor mounted yet');
 ref.current={contains:target=>target==='inside'};
 content.props.onInteractOutside({target:'inside',preventDefault:()=>outside++});
 content.props.onInteractOutside({target:'elsewhere',preventDefault:()=>outside++});
 assert.equal(outside,1);
});

test('PlannedInput: a failed save restores the value and shows the translated error',async()=>{
 errors.length=0;
 let fail=new Error('Budget is locked');
 const view=mount(React.createElement(page.PlannedInput,{label:'Rent',value:1500,history,direction:'expense',currency:'USD',defaultForward:false,appliesForward:false,onSave:async()=>{throw fail;}}));
 one(view,'x-number-input').props.onValueChange(1700);view.render();
 one(view,'x-popover').props.onOpenChange(false);await flush();view.render();
 assert.deepEqual(errors,['T:Budget is locked']);
 assert.equal(one(view,'x-number-input').props.value,1500);
 fail=new Error('');
 one(view,'x-number-input').props.onValueChange(1800);view.render();
 one(view,'x-popover').props.onOpenChange(false);await flush();view.render();
 assert.deepEqual(errors,['T:Budget is locked','T:Could not save changes.']);
});

const category=(overrides={})=>({key:'groceries',name:'Groceries',custom:false,direction:'expense',type:'flexible',group:'Everyday spending',excluded:false,rollover:false,rolloverStart:null,rolloverBalance:0,rolloverCurrency:null,rolloverNegative:false,...overrides});

function settingsDialog(props){
 const saved=[],closed=[];
 const view=mount(React.createElement(page.CategorySettingsDialog,{month:'2026-10',currency:'USD',onSave:async setting=>{saved.push(setting);},onClose:()=>closed.push(true),...props}));
 const submit=async()=>{one(view,'form').props.onSubmit({preventDefault(){}});await flush();view.render();};
 return {view,saved,closed,submit};
}

test('CategorySettingsDialog: expense category shows figures and types, no group field, and saves defaults',async()=>{
 const {view,saved,closed,submit}=settingsDialog({category:category(),figures:{budget:400,rolloverIn:-25,actual:150,remaining:225}});
 assert.equal(text(one(view,'x-dialog-title')),'T:Groceries');
 assert.equal(one(view,'x-category-icon').props.kind,'groceries');
 assert.equal(text(byClass(view,'budget-left-summary')[0]),`T:Planned${money(400)}T:Rolled over${formatSignedMoney(-25,'USD','en-US')}T:Spent${money(150)}T:Available${money(225)}`);
 assert.equal(nodes(view.tree,node=>node.type==='dd'&&node.props['data-tone'])[0].props['data-tone'],'positive');
 const radios=all(view,'input',node=>node.props.type==='radio');
 assert.deepEqual(radios.map(radio=>radio.props.checked),[false,true,false]);
 assert.match(text(byClass(view,'budget-choice-list')[0]),/T:FixedT:The same every month/);
 assert.equal(all(view,'select').length,0,'categories have no group');
 assert.equal(nodes(view.tree,node=>node.type==='x-link').length,0,'no link to manage groups');
 assert.equal(byClass(view,'budget-rollover-fields').length,0);
 assert.equal(all(view,'input',node=>node.props.type==='checkbox').length,2);
 await submit();
 assert.deepEqual(saved,[{category_key:'groceries',budget_type:'flexible',rollover:false,rollover_start:null,excluded:false,rollover_balance:0,rollover_currency:null,rollover_negative:false}]);
 assert.equal(closed.length,1);
});

test('CategorySettingsDialog: changing type saves it, and no group is sent',async()=>{
 const {view,saved,submit}=settingsDialog({category:category()});
 all(view,'input',node=>node.props.type==='radio')[0].props.onChange();view.render();
 await submit();
 assert.equal(saved[0].budget_type,'fixed');assert.equal('group_name' in saved[0],false);
});

test('CategorySettingsDialog: rollover fund fields, starting balance currency and exclusion',async()=>{
 const {view,saved,submit}=settingsDialog({category:category({key:'custom:trip',name:'Trip',custom:true,type:'non_monthly',group:'Future spending',rollover:true,rolloverStart:'2026-03',rolloverBalance:200,rolloverCurrency:'EUR',rolloverNegative:true}),figures:{budget:null,rolloverIn:30,actual:0,remaining:null}});
 assert.equal(text(one(view,'x-dialog-title')),'Trip');
 assert.equal(one(view,'x-category-icon').props.kind,'Trip');
 assert.equal(text(byClass(view,'budget-left-summary')[0]),`T:Planned—T:Rolled over${formatSignedMoney(30,'USD','en-US')}T:Spent${money(0)}T:Available—`);
 const fields=byClass(view,'budget-rollover-fields')[0];
 assert.match(text(fields),/T:Starting balance \(EUR\)/);
 const picker=one(view,'x-date-picker');assert.equal(picker.props.value,'2026-03');assert.equal(picker.props.mode,'month');
 // Saved as is: balance keeps its EUR currency.
 await submit();
 assert.deepEqual(saved[0],{category_key:'custom:trip',budget_type:'non_monthly',rollover:true,rollover_start:'2026-03',excluded:false,rollover_balance:200,rollover_currency:'EUR',rollover_negative:true});
 // Change start, balance (now in the workspace currency), negative carry and exclusion.
 one(view,'x-date-picker').props.onChange('2026-06');
 one(view,'x-number-input').props.onValueChange(350);view.render();
 assert.match(text(byClass(view,'budget-rollover-fields')[0]),/T:Starting balance \(USD\)/);
 const checks=()=>all(view,'input',node=>node.props.type==='checkbox');
 assert.equal(checks().length,3);
 checks()[1].props.onChange({currentTarget:{checked:false}});
 checks()[2].props.onChange({currentTarget:{checked:true}});view.render();
 await submit();
 assert.deepEqual(saved[1],{category_key:'custom:trip',budget_type:'non_monthly',rollover:true,rollover_start:'2026-06',excluded:true,rollover_balance:350,rollover_currency:'USD',rollover_negative:false});
 // Turning rollover off drops the fund fields and stored values.
 checks()[0].props.onChange({currentTarget:{checked:false}});view.render();
 assert.equal(byClass(view,'budget-rollover-fields').length,0);
 await submit();
 assert.equal(saved[2].rollover,false);assert.equal(saved[2].rollover_start,null);assert.equal(saved[2].rollover_balance,0);assert.equal(saved[2].rollover_currency,null);
});

test('CategorySettingsDialog: a rollover no rate converts shows — like Available, never 0',()=>{
 const {view}=settingsDialog({category:category({rollover:true,rolloverStart:'2026-03',rolloverBalance:200,rolloverCurrency:'XYZ'}),figures:{budget:400,rolloverIn:0,rolloverMissing:true,actual:150,remaining:null}});
 assert.equal(text(byClass(view,'budget-left-summary')[0]),`T:Planned${money(400)}T:Rolled over—T:Spent${money(150)}T:Available—`);
});

test('CategorySettingsDialog: zero starting balance stores no currency; new fund starts this month',async()=>{
 const {view,saved,submit}=settingsDialog({category:category()});
 all(view,'input',node=>node.props.type==='checkbox')[0].props.onChange({currentTarget:{checked:true}});view.render();
 assert.equal(one(view,'x-date-picker').props.value,'2026-10');
 await submit();
 assert.equal(saved[0].rollover,true);assert.equal(saved[0].rollover_start,'2026-10');assert.equal(saved[0].rollover_currency,null);
});

test('CategorySettingsDialog: the Flexible bucket only offers its rollover',async()=>{
 const {view,saved,submit}=settingsDialog({category:category({key:'flex:flexible',name:'Flexible',excluded:true})});
 assert.equal(text(one(view,'x-dialog-title')),'T:Flexible');
 assert.equal(all(view,'icon-Settings2').length,1);assert.equal(all(view,'x-category-icon').length,0);
 assert.equal(all(view,'input',node=>node.props.type==='radio').length,0);
 assert.equal(all(view,'select').length,0);
 assert.equal(all(view,'input',node=>node.props.type==='checkbox').length,1,'no exclude option');
 assert.equal(byClass(view,'budget-left-summary').length,0,'no figures passed');
 await submit();
 assert.equal(saved[0].budget_type,'flexible');assert.equal(saved[0].excluded,false);assert.equal('group_name' in saved[0],false);
});

test('CategorySettingsDialog: income categories are fixed, without fund or figures',async()=>{
 const {view,saved,submit}=settingsDialog({category:category({key:'salary',name:'Salary',direction:'income',type:'fixed',group:'Income'}),figures:{budget:1,rolloverIn:0,actual:0,remaining:1}});
 assert.equal(byClass(view,'budget-left-summary').length,0);
 assert.equal(all(view,'input',node=>node.props.type==='radio').length,0);
 assert.equal(all(view,'input',node=>node.props.type==='checkbox').length,1);
 await submit();
 assert.deepEqual(saved[0],{category_key:'salary',budget_type:'fixed',rollover:false,rollover_start:null,excluded:false,rollover_balance:0,rollover_currency:null,rollover_negative:false});
});

test('CategorySettingsDialog: busy state, failed save and dialog close rules',async()=>{
 errors.length=0;
 let release;const closed=[];
 const view=mount(React.createElement(page.CategorySettingsDialog,{category:category(),month:'2026-10',currency:'USD',onSave:()=>new Promise((resolve,reject)=>{release={resolve,reject};}),onClose:()=>closed.push(true)}));
 one(view,'form').props.onSubmit({preventDefault(){}});view.render();
 assert.equal(one(view,'fieldset').props.disabled,true);
 assert.equal(text(one(view,'x-button')),'T:Saving…');assert.equal(one(view,'x-button').props.disabled,true);
 one(view,'x-dialog').props.onOpenChange(false);assert.equal(closed.length,0,'cannot close while saving');
 release.reject(new Error('Category not found'));await flush();view.render();
 assert.deepEqual(errors,['T:Category not found']);
 assert.equal(closed.length,0);
 assert.equal(one(view,'fieldset').props.disabled,false);
 one(view,'x-dialog').props.onOpenChange(true);assert.equal(closed.length,0);
 one(view,'x-dialog').props.onOpenChange(false);assert.equal(closed.length,1);
 one(view,'x-form-footer').props.onCancel();assert.equal(closed.length,2);
});

function budgetSettings(props={}){
 const calls=[],closed=[];
 const view=mount(React.createElement(page.BudgetSettingsDialog,{mode:'category',applyForward:false,onSave:async(mode,forward)=>{calls.push(['save',mode,forward]);},onRecalculate:async()=>{calls.push(['recalculate']);},onClose:()=>closed.push(true),...props}));
 return {view,calls,closed};
}

test('BudgetSettingsDialog saves the chosen style and default scope',async()=>{
 const {view,calls,closed}=budgetSettings();
 assert.match(text(one(view,'x-dialog-title')),/T:Budget settings/);
 const radios=()=>all(view,'input',node=>node.props.type==='radio');
 assert.deepEqual(radios().map(radio=>radio.props.checked),[false,true,true,false]);
 radios()[0].props.onChange();radios()[3].props.onChange();view.render();
 assert.deepEqual(radios().map(radio=>radio.props.checked),[true,false,false,true]);
 one(view,'form').props.onSubmit({preventDefault(){}});await flush();
 assert.deepEqual(calls,[['save','flex',true]]);assert.equal(closed.length,1);
 radios()[1].props.onChange();radios()[2].props.onChange();view.render();
 assert.deepEqual(radios().map(radio=>radio.props.checked),[false,true,true,false]);
});

test('BudgetSettingsDialog recalculates, reports failures and blocks closing while busy',async()=>{
 errors.length=0;
 const {view,calls,closed}=budgetSettings({mode:'flex',applyForward:true});
 one(view,'x-button',node=>node.props.variant==='outline').props.onClick();await flush();
 assert.deepEqual(calls,[['recalculate']]);assert.equal(closed.length,1);
 let release;
 const busy=budgetSettings({onRecalculate:()=>new Promise((resolve,reject)=>{release=reject;})});
 one(busy.view,'x-button',node=>node.props.variant==='outline').props.onClick();busy.view.render();
 assert.equal(one(busy.view,'fieldset').props.disabled,true);
 const save=one(busy.view,'x-button',node=>node.props.variant===undefined);
 assert.equal(save.props.disabled,true);assert.equal(text(save),'T:Saving…');
 one(busy.view,'x-dialog').props.onOpenChange(false);assert.equal(busy.closed.length,0);
 release(new Error('No history yet'));await flush();busy.view.render();
 assert.deepEqual(errors,['T:No history yet']);assert.equal(busy.closed.length,0);
 assert.equal(text(one(busy.view,'x-button',node=>node.props.variant===undefined)),'T:Save');
 one(busy.view,'x-dialog').props.onOpenChange(true);assert.equal(busy.closed.length,0);
 one(busy.view,'x-dialog').props.onOpenChange(false);assert.equal(busy.closed.length,1);
});

test('the Budget page drives the Left to budget tabs, so Income and Expenses narrow its list to that side (BUD-024)',()=>{
 const picked=[];
 const view=mount(React.createElement(page.LeftToBudgetCard,{left,rows:leftRows,mode:'category',currency:'USD',tab:'expenses',onTab:tab=>picked.push(tab)}));
 const segmented=one(view,'x-segmented');
 assert.equal(segmented.props.value,'expenses','the page decides the tab');
 assert.equal(byClass(view,'budget-left-summary').length,0);
 segmented.props.onChange('income');
 assert.deepEqual(picked,['income'],'a tap goes to the page');
 const screen=fs.readFileSync('components/workspace/screens/budget-screen.tsx','utf8');
 assert.match(screen,/<div className="budget-table" data-focus=\{focus\}>/);
 assert.match(screen,/data-section="income"[\s\S]*data-section="expenses"[\s\S]*Total contributions/,'contributions sit with expenses');
 assert.match(screen,/<LeftToBudgetCard [^>]*tab=\{focus\} onTab=\{setFocus\}\/>/);
 const css=stylesheet();
 assert.match(css,/\.budget-section\{display:contents\}/);
 assert.match(css,/\.budget-table\[data-focus=income\]>\[data-section=expenses\],\.budget-table\[data-focus=expenses\]>\[data-section=income\]\{display:none\}/);
});

test('LeftToBudgetCard reads — for plans no rate converts, never $0',()=>{
 const unknown=mount(React.createElement(page.LeftToBudgetCard,{left:{income:null,expenses:null,contributions:0,left:null,flexible:null,missing:1},rows:[],mode:'flex',currency:'USD'}));
 assert.equal(text(byClass(unknown,'budget-left-summary')[0]),`T:Planned income—T:Planned spending—T:Contributions${money(0)}T:Left to budget—`);
});

// TEST-004: the Budget page itself, with the workspace and the planning read stubbed, so the row menu's Make recurring
// is exercised rather than matched in the source.
test('Make recurring presets the bill from its row: a custom row with history starts at its first recent payment, one without starts today, a built-in kind starts today (TEST-004)',()=>{
 const {depositToday}=loadTS('lib/deposit-interest.ts');const {shiftMonth}=loadTS('lib/calendar-days.ts');const {emptyPlanning}=loadTS('lib/planning.ts');
 const today=depositToday(),month=today.slice(0,7);
 const payment=(id,date,amount,custom_category_id,kind='Other expense')=>({id,name:id,kind,currency:'USD',amount,quantity:1,cost:0,rate:0,date,frequency:'Once',notes:'',custom_category_id});
 // Gym: paid three months in a row; Books: planned nothing, one payment this month; Living expense: a built-in kind with a payment.
 const records=[payment('g1',shiftMonth(month,-2)+'-03',100,'c1'),payment('g2',shiftMonth(month,-1)+'-05',110,'c1'),payment('g3',today,120,'c1'),payment('b1',today,45,'c2'),payment('l1',today,80,null,'Living expense')];
 const categories=[{id:'c1',name:'Gym',direction:'expense'},{id:'c2',name:'Books',direction:'expense'}];
 const calls=[];
 const budget={state:{mode:'category',applyForward:false,categories:[],amounts:[{category_key:'c1',month,amount:120,currency:'USD',applies_forward:true}]},loading:false,error:'',retry(){},saveAmount:async()=>{},saveRepeat:async()=>{},saveAmounts:async()=>{},saveCategory:async()=>{},saveSettings:async()=>{}};
 const workspace={user:null,demo:true,reload:0,currency:'USD',market:null,planning:{data:{...emptyPlanning,records,categories,removedKinds:[]},loading:false,error:''},transactionTools:{data:{splits:[]}},workspaceLoading:false,budget,
  addCashFlow:(kind,frequency,preset)=>calls.push({kind,frequency,preset}),editRecord(){},archiveSchedule:async()=>{},readOnly:false};
 const screenOverrides={...overrides,
  '@/components/workspace/workspace-provider':{useWorkspace:()=>workspace},
  '@/hooks/use-owner-resource':{useOwnerResource:()=>({data:emptyPlanning,loading:false,initialLoading:false,error:'',retry(){}})},
  '@/components/display-money':{useDisplayMoney:()=>({show:value=>String(value)})},
  '@/components/presentation-foundation/tone':{signTone:()=>undefined},
  ...Object.fromEntries([['inline-error','InlineError'],['today-button','TodayButton'],['page-header','PageHeader'],['row-menu','RowMenu'],['stat-tile','StatTile'],['history-chart','HistoryChart'],['empty-state','EmptyState']].map(([file,name])=>[`@/components/presentation-foundation/${file}`,{[name]:host(file)}])),
  '@/components/presentation-foundation/loading-placeholder':{PanelSkeleton:host('panel-skeleton'),LoadingPlaceholder:host('loading-placeholder')},
  '@/components/presentation-foundation/stat-tile':{StatTile:host('stat-tile'),StatTiles:host('stat-tiles')},
 };
 const {BudgetScreen}=loadTS('components/workspace/screens/budget-screen.tsx',screenOverrides);
 const view=mount(React.createElement(BudgetScreen));
 const menus=all(view,'x-row-menu');
 const choose=(name,item)=>{const menu=menus.find(node=>node.props.label==='T:Actions for '+name);assert.ok(menu,name+' has a menu');const entry=menu.props.items.find(entry=>entry&&entry.label==='T:'+item);assert.ok(entry,name+' offers '+item);entry.onSelect();return calls.pop();};
 assert.deepEqual(choose('Gym','Make recurring'),{kind:'Other expense',frequency:'Monthly',preset:{name:'Gym',amount:120,custom_category_id:'c1',date:shiftMonth(month,-2)+'-03'}},'the planned amount, from the first payment of the unbroken run');
 assert.deepEqual(choose('Books','Make recurring'),{kind:'Other expense',frequency:'Monthly',preset:{name:'Books',amount:45,custom_category_id:'c2',date:today}},'nothing planned: what it spent, from today');
 assert.deepEqual(choose('T:Living expense','Make recurring'),{kind:'Living expense',frequency:'Monthly',preset:{name:'T:Living expense',amount:80,custom_category_id:null,date:today}},'a built-in kind is too broad to take a history');
 assert.equal(calls.length,0);
 // A row whose category already has a running bill offers Stop recurring instead; a paused bill is not running (DRY-006).
 const bill={...payment('gym-bill','2026-01-01',100,'c1'),frequency:'Monthly'};
 for(const [extra,expected] of [[{},'Stop recurring'],[{source_paused:true},'Make recurring'],[{archived:true},'Make recurring']]){
  workspace.planning={...workspace.planning,data:{...workspace.planning.data,records:[...records,{...bill,...extra}]}};
  const menu=all(mount(React.createElement(BudgetScreen)),'x-row-menu').find(node=>node.props.label==='T:Actions for Gym');
  assert.deepEqual(menu.props.items.filter(Boolean).map(entry=>entry.label).filter(label=>label!=='T:Edit'),['T:'+expected],JSON.stringify(extra));
 }
});
