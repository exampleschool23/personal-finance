import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,text,host} from './helpers/component-tree.mjs';

const {formatMoney,formatDate,formatNumber}=loadTS('lib/format.ts');
const t=(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]));
const options=[
 {id:'job',name:'Acme payroll',kind:'Salary',currency:'USD',estimate:4200.4,frequency:'Monthly',payment:{due:'2026-10-25',paid:false}},
 {id:'flat',name:'Flat on Elm St',kind:'Rent income',currency:'EUR',estimate:900,frequency:null,payment:{due:'2026-10-01',paid:true}},
 {id:'shop',name:'Corner shop',kind:'Business income',currency:'USD',estimate:null},
 {id:'tips',name:'Tips',kind:'custom-tips',categoryLabel:'Tips & gifts'},
 {id:'more',name:'More tips',kind:'custom-tips',categoryLabel:'Tips & gifts',disabled:true},
 {id:'side',name:'Side gig',kind:'Other income',currency:'USD',estimate:150,frequency:'Weekly'},
];
// Result buttons as the DOM would hold them: enabled ones, each focusable.
function fakeResults(log){
 const buttons=['job','flat','shop','tips'].map(id=>({id,focus(){log.push(id);globalThis.document.activeElement=this;}}));
 return {buttons,querySelector:()=>buttons[0],querySelectorAll:selector=>{assert.equal(selector,'button:not(:disabled)');return buttons;}};
}
function setup(props={}){
 const focused=[];const results=fakeResults(focused);
 globalThis.document={activeElement:null};
 const renderer=createRenderer({attach:element=>element.props.className==='income-source-results'?results:null});
 const {IncomeSourcePicker}=renderer.load('components/income-source-picker.tsx',{
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t})},
  '@/components/ui/popover':{Popover:host('popover'),PopoverTrigger:host('popover-trigger'),PopoverContent:host('popover-content')},
  '@/components/ui/button':{Button:host('button')},'@/components/ui/input':{Input:host('input')},
 });
 const chosen=[];
 const all={options,value:'',onChange:id=>chosen.push(id),...props};
 const view={chosen,focused,results,find:renderer.find,all:renderer.all,render:()=>(view.tree=renderer.render(renderer.react.createElement(IncomeSourcePicker,all)))};
 view.render();
 view.popover=()=>view.find(node=>node.type==='popover');
 view.categories=()=>view.all(node=>node.type==='button',view.find(node=>node.props.className==='income-source-categories')).map(node=>[text(node.children[0]),text(node.children[1]),node.props['aria-pressed']]);
 view.items=()=>view.all(node=>node.type==='button',view.find(node=>node.props.className==='income-source-results'));
 view.search=value=>{view.find(node=>node.type==='input').props.onChange({target:{value}});return view.render();};
 return view;
}
const key=(name)=>{const event={key:name,prevented:false,preventDefault(){event.prevented=true;}};return event;};

test('the trigger names the chosen source, or asks for one, and can be disabled',()=>{
 let view=setup();
 const trigger=view.find(node=>node.props.className==='income-source-trigger');
 assert.match(text(trigger),/Choose an income source/);
 const label=view.find(node=>node.type==='span'&&text(node)==='Income source');
 assert.equal(trigger.props['aria-labelledby'],label.props.id);
 view=setup({value:'flat',disabled:true});
 assert.match(text(view.find(node=>node.props.className==='income-source-trigger')),/Flat on Elm St/);
 assert.equal(view.find(node=>node.props.className==='income-source-trigger').props.disabled,true);
 assert.equal(view.items().find(item=>item.key==='flat').props['aria-pressed'],true);
});

test('categories list income kinds in order, then custom ones once, with counts from formatNumber',()=>{
 const view=setup();
 assert.deepEqual(view.categories(),[
  ['All income sources',formatNumber(6,'en-US',0),true],['Salary','1',false],['Rent income','1',false],['Business income','1',false],['Other income','1',false],['Tips & gifts','2',false],
 ]);
 const results=view.find(node=>node.props.className==='income-source-results');
 const category=view.find(node=>node.props.className==='income-source-categories');
 assert.equal(category.children[0].props['aria-controls'],results.props.id);
 assert.equal(text(view.find(node=>node.type==='p',results)),'All income sources');
 assert.equal(view.items().length,6);
 assert.equal(view.items().find(item=>item.key==='more').props.disabled,true);
});

test('each source shows its estimate, frequency and payment through the shared formatters',()=>{
 const view=setup();
 const item=id=>text(view.items().find(entry=>entry.key===id));
 assert.ok(item('job').includes(`Estimated: ${formatMoney(4200.4,'USD','en-US')} · Every month`));
 assert.match(item('job'),/Estimated: \$4,200 · Every month/,'whole amounts');
 assert.ok(item('job').includes(`Scheduled · ${formatDate('2026-10-25','en-US')}`));
 assert.match(item('job'),/Scheduled · 25 October 2026/);
 assert.match(item('flat'),/Estimated: €900 · Every month/,'a missing frequency reads as monthly');
 assert.match(item('flat'),/Paid · 1 October 2026/);
 assert.equal(view.all(node=>node.props.className==='income-source-payment is-paid',view.items().find(entry=>entry.key==='flat')).length,1);
 assert.match(item('shop'),/Variable income/);
 assert.match(item('side'),/Every week/);
 assert.doesNotMatch(item('tips'),/Estimated|Variable/,'no currency, no estimate line');
 assert.match(item('tips'),/Tips & gifts/);
});

test('searching filters by name or category label and keeps the chosen category only while it matches',()=>{
 const view=setup();
 view.search('  TIPS ');
 assert.deepEqual(view.categories().map(row=>row.slice(0,2)),[['All income sources','2'],['Tips & gifts','2']]);
 view.search('rent');
 assert.deepEqual(view.items().map(item=>item.key),['flat']);
 view.search('');
 const salary=view.find(node=>node.type==='button'&&node.props['aria-controls']&&text(node).startsWith('Salary'));
 salary.props.onMouseEnter();view.render();
 assert.deepEqual(view.items().map(item=>item.key),['job']);
 assert.equal(text(view.find(node=>node.type==='p',view.find(node=>node.props.className==='income-source-results'))),'Salary');
 view.search('tips');
 assert.equal(view.categories()[0][2],true,'a category with no matches falls back to all');
 assert.deepEqual(view.items().map(item=>item.key),['tips','more']);
 const tips=view.find(node=>node.type==='button'&&node.props['aria-controls']&&text(node).startsWith('Tips'));
 tips.props.onFocus();view.render();
 assert.equal(text(view.find(node=>node.type==='p',view.find(node=>node.props.className==='income-source-results'))),'Tips & gifts');
 view.find(node=>node.type==='button'&&node.props['aria-controls']&&text(node).startsWith('All')).props.onClick();view.render();
 assert.equal(view.categories()[0][2],true);
 view.search('nothing like this');
 assert.equal(text(view.find(node=>node.props.role==='status')),'No income sources found.');
 assert.deepEqual(view.categories(),[['All income sources','0',true]]);
});

test('opening resets the search and category; choosing a source reports it and closes',()=>{
 const view=setup();
 view.search('tips');
 view.find(node=>node.type==='button'&&node.props['aria-controls']&&text(node).startsWith('Tips')).props.onClick();
 view.popover().props.onOpenChange(true);view.render();
 assert.equal(view.popover().props.open,true);
 assert.equal(view.find(node=>node.type==='input').props.value,'');
 assert.equal(view.categories()[0][2],true);
 view.items().find(item=>item.key==='shop').props.onClick();view.render();
 assert.deepEqual(view.chosen,['shop']);
 assert.equal(view.popover().props.open,false);
 view.search('job');view.popover().props.onOpenChange(false);view.render();
 assert.equal(view.find(node=>node.type==='input').props.value,'job','closing keeps the search');
});

test('the arrow keys move from the search and categories into the results and around them',()=>{
 const view=setup();
 const input=view.find(node=>node.type==='input');
 let event=key('a');input.props.onKeyDown(event);
 assert.equal(event.prevented,false);assert.deepEqual(view.focused,[]);
 event=key('ArrowDown');input.props.onKeyDown(event);
 assert.equal(event.prevented,true);assert.deepEqual(view.focused,['job']);
 const category=view.find(node=>node.type==='button'&&node.props['aria-controls']);
 event=key('ArrowLeft');category.props.onKeyDown(event);assert.equal(event.prevented,false);
 event=key('ArrowRight');category.props.onKeyDown(event);assert.equal(event.prevented,true);
 assert.deepEqual(view.focused,['job','job']);
 const results=view.find(node=>node.props.className==='income-source-results');
 const press=name=>{const pressed=key(name);results.props.onKeyDown(pressed);return pressed.prevented;};
 assert.equal(press('Enter'),false,'other keys are left alone');
 view.focused.length=0;
 assert.equal(press('ArrowUp'),true);
 assert.equal(press('ArrowDown'),true);
 assert.equal(press('End'),true);
 assert.equal(press('Home'),true);
 assert.deepEqual(view.focused,['tips','job','tips','job'],'up from the first wraps to the last, and down wraps back');
 globalThis.document.activeElement={};
 assert.equal(press('ArrowDown'),false,'nothing happens when focus is outside the results');
});

test('without enabled results the keys move focus nowhere',()=>{
 const view=setup();
 view.results.querySelector=()=>null;view.results.querySelectorAll=()=>undefined;
 const input=view.find(node=>node.type==='input');
 const event=key('ArrowDown');input.props.onKeyDown(event);
 assert.equal(event.prevented,true);
 const results=view.find(node=>node.props.className==='income-source-results');
 const inside=key('ArrowDown');results.props.onKeyDown(inside);
 assert.equal(inside.prevented,false);
 assert.deepEqual(view.focused,[]);
});
