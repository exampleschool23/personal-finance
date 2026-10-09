import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';

// A tiny renderer: function components are called with per-instance hook state, everything else stays a plain tree
// whose handlers the tests call directly.
const states=new Map();let scope='',cursor=0;
// Outside a render a context reads its default, as it would with no provider above it.
const fakeReact={...React,useContext:context=>context._currentValue,useState(initial){const key=scope+'#'+cursor++;if(!states.has(key))states.set(key,typeof initial==='function'?initial():initial);return [states.get(key),value=>states.set(key,typeof value==='function'?value(states.get(key)):value)];}};
function expand(node,path){
 if(Array.isArray(node))return node.map((child,i)=>expand(child,path+'.'+(child?.key??i)));
 if(!node||typeof node!=='object')return node;
 if(typeof node.type==='function'){
  const saved=[scope,cursor];scope=path+'<'+node.type.name;cursor=0;
  const out=node.type(node.props);const inner=scope;[scope,cursor]=saved;
  return expand(out,inner);
 }
 const type=typeof node.type==='string'?node.type:'#fragment';
 return {type,props:{...node.props,children:expand(node.props.children,path+'/'+type)}};
}
const mount=element=>{states.clear();return ()=>expand(element,'root');};
const findAll=(node,pred,out=[])=>{if(Array.isArray(node))node.forEach(child=>findAll(child,pred,out));else if(node&&typeof node==='object'){if(pred(node))out.push(node);findAll(node.props.children,pred,out);}return out;};
const text=node=>Array.isArray(node)?node.map(text).join(''):node==null||typeof node==='boolean'?'':typeof node!=='object'?String(node):text(node.props.children);
const byLabel=(tree,label)=>{const found=findAll(tree,node=>node.props['aria-label']===label);assert.ok(found.length,'no element labelled '+label);return found[0];};
const buttonsWith=(tree,content)=>findAll(tree,node=>(node.type==='button'||node.type==='Button')&&text(node).includes(content));
const button=(tree,content)=>{const matches=buttonsWith(tree,content),clickable=matches.filter(node=>typeof node.props.onClick==='function'),found=clickable.length?clickable:matches;assert.ok(found.length,'no button with '+content);return found[0];};
const typed=value=>({currentTarget:{value}});

const host=name=>Object.defineProperty(props=>React.createElement(name,props),'name',{value:name});
const t=(key,vars={})=>key.replace(/\{(\w+)\}/g,(_,name)=>String(vars[name]));
const icons=Object.fromEntries(['Check','ChevronDown','Plus','Tag','Trash2'].map(name=>[name,()=>null]));
const Confirm=props=>React.createElement('ConfirmDialog',props,props.open?[props.title,'|',props.description,'|',props.error,'|',props.confirmLabel]:null);
const Panel=props=>React.createElement('PanelTitle',props,props.title,props.count,props.children);
const {formatDate,formatMoney,formatSignedMoney}=loadTS('lib/format.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const overrides={
 react:fakeReact,'lucide-react':icons,
 '@/components/language-provider':{useLanguage:()=>({t,locale:'en'})},
 '@/components/presentation-foundation/category-icon':{CategoryIcon:host('CategoryIcon')},
 '@/components/presentation-foundation/business-mark':{BusinessMark:host('BusinessMark')},
 '@/components/presentation-foundation/segmented':{Segmented:host('Segmented')},
 '@/components/presentation-foundation/tag-chip':{TagChip:props=>React.createElement('TagChip',props,props.name,props.children)},
 '@/components/presentation-foundation/person-avatar':{OwnerAvatar:host('OwnerAvatar')},
 '@/components/ui/sheet':{Sheet:host('Sheet'),SheetContent:host('SheetContent'),SheetHeader:host('SheetHeader'),SheetTitle:host('SheetTitle')},
 '@/components/presentation-foundation/confirm-dialog':{ConfirmDialog:Confirm},
 '@/components/presentation-foundation/count':{Count:props=>React.createElement('Count',props,String(props.value))},
 '@/components/presentation-foundation/panel-title':{PanelTitle:Panel},
 '@/components/presentation-foundation/form-footer':{FormFooter:host('FormFooter')},
 '@/components/ui/button':{Button:host('Button')},
 '@/components/ui/dialog':{Dialog:host('Dialog'),DialogContent:host('DialogContent'),DialogTitle:host('DialogTitle')},
 '@/components/presentation-foundation/formatted-number-input':{FormattedNumberInput:host('FormattedNumberInput')},
 '@/components/ui/input':{Input:host('input')},
 '@/components/ui/native-select':{NativeSelect:host('select')},
 '@/components/ui/popover':{Popover:host('Popover'),PopoverContent:host('PopoverContent'),PopoverTrigger:host('PopoverTrigger')},
};
// The transactions screen's parts, loaded together as one module would be.
const cache=new Map();
const page=Object.assign({},...['pickers','tags','bulk-edit','transaction-row','rule-dialog','rules-list'].map(name=>loadTS(`components/transactions/${name}.tsx`,overrides,cache)),loadTS('lib/transaction-rules.ts',overrides,cache));
const h=React.createElement;
const entry=(over={})=>({id:'r1',name:'Coffee Shop 123',kind:'Living expense',currency:'USD',amount:13,quantity:0,cost:0,rate:0,date:'2026-09-30',frequency:'Once',notes:'',...over});
const categories=[{id:'c-food',name:'Food',direction:'expense'},{id:'c-side',name:'Side gig',direction:'income'}];
const businesses=[{id:'b1',name:'Bakery',business_color:'teal',business_logo:null},{id:'b2',name:'Studio'}];
const owners=[{id:'o1',name:'Ann'},{id:'o2',name:'Bob'}];
const tags=[{id:'t1',name:'Trip',color:'teal'},{id:'t2',name:'Work',color:'blue'}];
const popover=tree=>findAll(tree,node=>node.type==='Popover');
const options=tree=>findAll(tree,node=>node.props.role==='option').map(text);

test('useChoiceName names custom categories, falls back when one is gone, and translates kinds',()=>{
 const name=page.useChoiceName(categories);
 assert.equal(name({kind:'Other expense',category_id:'c-food'}),'Food');
 assert.equal(name({kind:'Other expense',category_id:'missing'}),'Custom category');
 assert.equal(name({kind:'Salary',category_id:null}),'Salary');
});

test('CategoryPicker shows a plain pill when disabled and a searchable list otherwise',()=>{
 const changes=[];
 const disabled=expand(h(page.CategoryPicker,{record:entry({kind:'Other expense',custom_category_id:'c-food'}),categories,disabled:true,onChange:c=>changes.push(c)}),'x');
 assert.equal(text(disabled),'Food');
 assert.equal(findAll(disabled,n=>n.type==='CategoryIcon')[0].props.kind,'Food');
 assert.equal(popover(disabled).length,0);

 const render=mount(h(page.CategoryPicker,{record:entry(),categories,onChange:c=>changes.push(c)}));
 let tree=render();
 assert.equal(popover(tree)[0].props.open,false);
 assert.ok(byLabel(tree,'Change category for Coffee Shop 123'));
 popover(tree)[0].props.onOpenChange(true);tree=render();
 assert.equal(popover(tree)[0].props.open,true);
 assert.equal(text(findAll(tree,n=>n.props.className==='category-picker-heading')[0]),'Expenses');
 assert.deepEqual(options(tree),['Rent expense','Living expense','Charity','Other expense','Food']);
 assert.equal(findAll(tree,n=>n.props.role==='option'&&n.props['aria-selected']).map(text)[0],'Living expense');
 // Search narrows the list, case-insensitively and ignoring outer spaces.
 byLabel(tree,'Search categories').props.onChange(typed('  FOO '));tree=render();
 assert.deepEqual(options(tree),['Food']);
 byLabel(tree,'Search categories').props.onChange(typed('zzz'));tree=render();
 assert.deepEqual(options(tree),[]);
 assert.match(text(tree),/No categories match\./);
 byLabel(tree,'Search categories').props.onChange(typed(''));tree=render();
 // Choosing the current category only closes the list.
 button(tree,'Living expense').props.onClick();tree=render();
 assert.equal(popover(tree)[0].props.open,false);
 assert.deepEqual(changes,[]);
 button(tree,'Food').props.onClick();
 assert.deepEqual(changes,[{kind:'Other expense',category_id:'c-food',name:'Food',custom:true}]);
});

test('CategoryPicker lists income for income rows and treats non-transaction kinds as expenses',()=>{
 let tree=mount(h(page.CategoryPicker,{record:entry({kind:'Salary'}),categories,onChange(){}}))();
 assert.equal(text(findAll(tree,n=>n.props.className==='category-picker-heading')[0]),'Income');
 assert.deepEqual(options(tree),['Salary','Rent income','Business income','Other income','Side gig']);
 const changes=[];
 tree=mount(h(page.CategoryPicker,{record:entry({kind:'Cash'}),categories,onChange:c=>changes.push(c.kind)}))();
 assert.equal(text(findAll(tree,n=>n.props.className==='category-picker-heading')[0]),'Expenses');
 button(tree,'Charity').props.onClick();
 assert.deepEqual(changes,['Charity']);
});

test('BulkEditBar offers Select all until everything is selected, then Clear selection',()=>{
 const calls=[];
 const bar=(count,total)=>expand(h(page.BulkEditBar,{count,total,onAll:v=>calls.push(['all',v]),onEdit:()=>calls.push(['edit']),onCancel:()=>calls.push(['done'])}),'b');
 let tree=bar(0,0);
 assert.match(text(tree),/^0 selected/);
 assert.equal(button(tree,'Select all').props.disabled,true);
 assert.equal(button(tree,'Edit 0').props.disabled,true);
 tree=bar(2,5);
 button(tree,'Select all').props.onClick();
 button(tree,'Edit 2').props.onClick();
 button(tree,'Done').props.onClick();
 tree=bar(5,5);
 button(tree,'Clear selection').props.onClick();
 assert.deepEqual(calls,[['all',true],['edit'],['done'],['all',false]]);
 assert.equal(byLabel(tree,'Edit multiple').props.role,'region');
});

test('BusinessPicker is a pill without businesses or when disabled, and a list otherwise',()=>{
 const changes=[];
 let tree=expand(h(page.BusinessPicker,{record:entry(),businesses:[],onChange:b=>changes.push(b)}),'x');
 assert.equal(text(tree),'🏠Household');
 tree=expand(h(page.BusinessPicker,{record:entry({business_id:'b1'}),businesses,disabled:true,onChange(){}}),'x');
 assert.equal(text(tree),'Bakery');
 assert.equal(findAll(tree,n=>n.type==='BusinessMark')[0].props.color,'teal');

 const render=mount(h(page.BusinessPicker,{record:entry({business_id:'b1'}),businesses,onChange:b=>changes.push(b)}));
 tree=render();
 assert.ok(byLabel(tree,'Change business for Coffee Shop 123'));
 popover(tree)[0].props.onOpenChange(true);tree=render();
 assert.deepEqual(options(tree),['🏠Household','Bakery','Studio']);
 assert.equal(findAll(tree,n=>n.props.role==='option'&&n.props['aria-selected']).map(text)[0],'Bakery');
 button(tree,'Bakery').props.onClick();tree=render();
 assert.equal(popover(tree)[0].props.open,false);
 button(tree,'Household').props.onClick();
 button(tree,'Studio').props.onClick();
 assert.deepEqual(changes,[null,'b2']);

 // Business income always names a business, so the household is not offered; a row without one starts at null.
 tree=expand(h(page.BusinessPicker,{record:entry({kind:'Business income'}),businesses,onChange:b=>changes.push(b)}),'y');
 assert.deepEqual(options(tree),['Bakery','Studio']);
 tree=expand(h(page.BusinessPicker,{record:entry(),businesses,onChange:b=>changes.push(b)}),'z');
 button(tree,'Household').props.onClick();
 assert.deepEqual(changes,[null,'b2']);
});

test('OwnerPicker shows only the avatar when disabled and changes owner only to someone else',()=>{
 const changes=[];
 let tree=expand(h(page.OwnerPicker,{record:entry(),owner:owners[0],owners,disabled:true,onChange(){}}),'x');
 assert.equal(tree.type,'OwnerAvatar');
 assert.equal(tree.props.owner,owners[0]);
 const render=mount(h(page.OwnerPicker,{record:entry(),owner:owners[0],owners,onChange:o=>changes.push(o)}));
 tree=render();
 assert.ok(byLabel(tree,'Change owner of Coffee Shop 123'));
 popover(tree)[0].props.onOpenChange(true);tree=render();
 assert.deepEqual(options(tree),['Ann','Bob']);
 button(tree,'Ann').props.onClick();tree=render();
 assert.equal(popover(tree)[0].props.open,false);
 button(tree,'Bob').props.onClick();
 assert.deepEqual(changes,['o2']);
});

test('TagFilter labels its choice and toggles tags, the match mode and All tags',()=>{
 const calls=[];
 const filter=(value,match='any')=>mount(h(page.TagFilter,{tags,value,match,onChange:(v,m)=>calls.push([v,m])}))();
 let tree=filter([]);
 const trigger=byLabel(tree,'Filter by tag');
 assert.equal(text(trigger),'All tags');
 assert.equal(trigger.props['data-active'],undefined);
 assert.equal(findAll(tree,n=>n.type==='Segmented').length,0);
 button(tree,'Trip').props.onClick();
 popover(tree)[0].props.onOpenChange(true);
 tree=filter(['t2']);
 assert.equal(text(byLabel(tree,'Filter by tag')),'Work');
 assert.equal(byLabel(tree,'Filter by tag').props['data-active'],true);
 button(tree,'Work').props.onClick();
 tree=filter(['t1','t2']);
 assert.equal(text(byLabel(tree,'Filter by tag')),'Any of 2 tags');
 findAll(tree,n=>n.type==='Segmented')[0].props.onChange('all');
 button(tree,'All tags').props.onClick();
 tree=filter(['t1','t2'],'all');
 assert.equal(text(byLabel(tree,'Filter by tag')),'All of 2 tags');
 assert.deepEqual(calls,[[['t1'],'any'],[[],'any'],[['t1','t2'],'all'],[[],'any']]);
});

test('TagSelector toggles tags and creates new ones, reusing a tag that already has the name',async()=>{
 let tree=expand(h(page.TagSelector,{tags:[],selected:[],onToggle(){}}),'x');
 assert.equal(text(tree),'No tags yet.');
 assert.equal(findAll(tree,n=>n.type==='input').length,0);

 const toggled=[],created=[];let outcome=name=>Promise.resolve('new-'+name);
 const render=mount(h(page.TagSelector,{tags,selected:['t1'],onToggle:id=>toggled.push(id),onCreate:name=>{created.push(name);return outcome(name);}}));
 tree=render();
 assert.deepEqual(findAll(tree,n=>n.props['aria-pressed']!==undefined).map(n=>n.props['aria-pressed']),[true,false]);
 button(tree,'Work').props.onClick();
 const input=()=>byLabel(render(),'New tag');
 // Blank names do nothing.
 input().props.onChange(typed('   '));tree=render();
 assert.equal(button(tree,'Add').props.disabled,true);
 await button(tree,'Add').props.onClick();
 // An existing name (any case) toggles that tag instead of creating a duplicate, unless it is already selected.
 input().props.onChange(typed(' work '));await button(render(),'Add').props.onClick();
 assert.equal(input().props.value,'');
 input().props.onChange(typed('TRIP'));await button(render(),'Add').props.onClick();
 assert.deepEqual(toggled,['t2','t2']);
 // Enter creates; other keys do not.
 let prevented=0;
 input().props.onChange(typed('Gifts'));
 input().props.onKeyDown({key:'a',preventDefault:()=>prevented++});
 assert.deepEqual(created,[]);
 input().props.onKeyDown({key:'Enter',preventDefault:()=>prevented++});
 await flush();
 assert.equal(prevented,1);
 assert.deepEqual(created,['Gifts']);
 assert.deepEqual(toggled,['t2','t2','new-Gifts']);
 assert.equal(input().props.value,'');
 // A failure shows its translated message and keeps the name.
 outcome=()=>Promise.reject(Error('Tag limit reached.'));
 input().props.onChange(typed('Extra'));button(render(),'Add').props.onClick();await flush();
 tree=render();
 assert.equal(text(findAll(tree,n=>n.props.role==='alert')[0]),'Tag limit reached.');
 assert.equal(input().props.value,'Extra');
 // While a create is in flight the field is disabled and a second create is ignored.
 let finish;outcome=()=>new Promise(resolve=>{finish=resolve;});
 button(render(),'Add').props.onClick();
 tree=render();
 assert.equal(byLabel(tree,'New tag').props.disabled,true);
 button(tree,'Add').props.onClick();
 assert.equal(created.length,3);
 finish('t9');await flush();
 assert.equal(toggled.at(-1),'t9');
 assert.equal(findAll(render(),n=>n.props.role==='alert').length,0);
});

test('BulkEditSheet asks for one direction before changing categories together',async()=>{
 const tree=mount(h(page.BulkEditSheet,{records:[entry(),entry({id:'r2',kind:'Salary'})],categories,businesses:[],tags:[],tagsOf:()=>[],onSave(){},onClose(){}}))();
 assert.match(text(tree),/Edit 2 transactions/);
 assert.match(text(tree),/Select only income or only expenses to change their category together\./);
 assert.doesNotMatch(text(tree),/Business|Owner|Remove tags/);
 const empty=mount(h(page.BulkEditSheet,{records:[],categories,businesses:[],tags,tagsOf:()=>['t1'],onSave(){},onClose(){}}))();
 assert.match(text(empty),/Select only income/);
 assert.doesNotMatch(text(empty),/Remove tags/);
});

test('BulkEditSheet collects category, business, owner and tag changes and saves them together',async()=>{
 const saves=[];let closed=0;let fail=null;
 const records=[entry(),entry({id:'r2',name:'Lunch'})];
 const render=mount(h(page.BulkEditSheet,{records,categories,businesses,owners,tags,tagsOf:id=>id==='r1'?['t1','t2']:['t1'],onCreateTag:async name=>'id-'+name,onSave:async change=>{if(fail)throw fail;saves.push(change);},onClose:()=>closed++}));
 let tree=render();
 const footerButton=()=>findAll(render(),n=>n.type==='FormFooter')[0];
 const apply=()=>button(render(),'Apply changes');
 assert.equal(apply().props.disabled,true);
 // Nothing changed: submitting does nothing.
 await findAll(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.deepEqual(saves,[]);
 // Pickers start as Leave unchanged.
 assert.equal(findAll(tree,n=>n.props.className==='rule-category-button').map(text).join('|'),'Leave unchanged|Leave unchanged|Leave unchanged');
 const [catPop,busPop,ownPop]=popover(tree);
 catPop.props.onOpenChange(true);tree=render();
 assert.equal(popover(tree)[0].props.open,true);
 popover(tree)[0].props.onOpenChange(false);
 busPop.props.onOpenChange(true);ownPop.props.onOpenChange(true);tree=render();
 assert.equal(popover(tree)[2].props.open,true);
 // Category.
 button(findAll(tree,n=>n.type==='PopoverContent')[0],'Food').props.onClick();tree=render();
 assert.equal(popover(tree)[0].props.open,false);
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[0]),'Food');
 assert.equal(findAll(tree,n=>n.type==='CategoryIcon')[0].props.kind,'Food');
 button(findAll(tree,n=>n.type==='PopoverContent')[0],'Charity').props.onClick();tree=render();
 assert.equal(findAll(tree,n=>n.type==='CategoryIcon')[0].props.kind,'Charity');
 // Business: household, then a business.
 button(findAll(tree,n=>n.type==='PopoverContent')[1],'Household').props.onClick();tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[1]),'Household');
 button(findAll(tree,n=>n.type==='PopoverContent')[1],'Studio').props.onClick();tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[1]),'Studio');
 // Owner.
 button(findAll(tree,n=>n.type==='PopoverContent')[2],'Bob').props.onClick();tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[2]),'Bob');
 // Tags: only t1 is on every record, so only it can be removed; adding and removing exclude each other.
 const selectors=()=>findAll(render(),n=>n.props.className==='tag-selector');
 assert.equal(selectors().length,2);
 assert.deepEqual(findAll(selectors()[1],n=>n.type==='TagChip').map(text),['Trip']);
 button(selectors()[1],'Trip').props.onClick();
 assert.deepEqual(findAll(selectors()[1],n=>n.props['aria-pressed']).map(text),['Trip']);
 button(selectors()[0],'Trip').props.onClick();
 assert.deepEqual(findAll(selectors()[1],n=>n.props['aria-pressed']).map(text),[]);
 button(selectors()[0],'Work').props.onClick();
 button(selectors()[0],'Trip').props.onClick();
 button(selectors()[1],'Trip').props.onClick();
 button(selectors()[1],'Trip').props.onClick();
 button(selectors()[1],'Trip').props.onClick();
 assert.equal(apply().props.disabled,false);
 // A failure keeps the sheet open with the message; an empty message falls back to a generic one.
 fail=Error('Server said no.');
 await findAll(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(text(findAll(render(),n=>n.props.role==='alert')[0]),'Server said no.');
 assert.equal(closed,0);
 fail=Error('');
 await findAll(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(text(findAll(render(),n=>n.props.role==='alert')[0]),'Could not save changes.');
 assert.equal(footerButton().props.busy,false);
 fail=null;
 await findAll(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.deepEqual(saves,[{choice:{kind:'Charity',category_id:null,name:'Charity',custom:false},business:'b2',owner:'o2',add:['t2'],remove:['t1']}]);
 assert.equal(closed,1);
 // Closing by the overlay closes, but not while saving.
 findAll(render(),n=>n.type==='Sheet')[0].props.onOpenChange(true);
 findAll(render(),n=>n.type==='Sheet')[0].props.onOpenChange(false);
 assert.equal(closed,2);
 let finish;
 const slow=mount(h(page.BulkEditSheet,{records,categories,businesses:[],tags,tagsOf:()=>[],onSave:()=>new Promise(resolve=>{finish=resolve;}),onClose:()=>closed++}));
 button(findAll(slow(),n=>n.props.className==='tag-selector')[0],'Work').props.onClick();
 const pending=findAll(slow(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 tree=slow();
 assert.equal(button(tree,'Saving…').props.disabled,true);
 assert.equal(findAll(tree,n=>n.type==='fieldset')[0].props.disabled,true);
 findAll(tree,n=>n.type==='Sheet')[0].props.onOpenChange(false);
 assert.equal(closed,2);
 finish();await pending;
 assert.equal(closed,3);
});

test('DayGroup names today and yesterday, formats other dates, and signs the day total',()=>{
 const day=(date,total)=>expand(h(page.DayGroup,{date,total,currency:'USD',today:'2026-10-04'},h('li',null,'row')),'d');
 let tree=day('2026-10-04',1200);
 assert.equal(tree.props['aria-label'],'Today');
 assert.equal(text(tree),'Today+$1,200row');
 assert.equal(findAll(tree,n=>n.type==='span')[0].props.className,'positive');
 tree=day('2026-10-03',-13.4);
 assert.equal(text(findAll(tree,n=>n.type==='h3')[0]),'Yesterday');
 assert.equal(text(findAll(tree,n=>n.type==='span')[0]),formatSignedMoney(-13.4,'USD','en'));
 assert.equal(text(findAll(tree,n=>n.type==='span')[0]),'−$13');
 assert.equal(findAll(tree,n=>n.type==='span')[0].props.className,undefined);
 tree=day('2026-09-30',null);
 assert.equal(text(findAll(tree,n=>n.type==='h3')[0]),formatDate('2026-09-30','en'));
 assert.equal(text(findAll(tree,n=>n.type==='h3')[0]),'30 September 2026');
 assert.equal(text(findAll(tree,n=>n.type==='span')[0]),'—');
 tree=day('2026-09-29',0);
 assert.equal(findAll(tree,n=>n.type==='span')[0].props.className,undefined);
});

test('MortgageSplit shows principal and interest only for mortgage payments',()=>{
 assert.equal(expand(h(page.MortgageSplit,{record:entry()}),'m'),null);
 const tree=expand(h(page.MortgageSplit,{record:entry({amount:1500,mortgage_payment_id:'mp',payment_interest:400.6})}),'m');
 assert.equal(text(tree),`Mortgage payment · Principal: ${formatMoney(1099.4,'USD','en')} · Interest: ${formatMoney(400.6,'USD','en')}`);
 assert.equal(text(tree),'Mortgage payment · Principal: $1,099 · Interest: $401');
});

test('TransactionAmount signs income green and expenses in ink',()=>{
 let tree=expand(h(page.TransactionAmount,{record:entry({kind:'Salary',amount:1200,currency:'EUR'})}),'a');
 assert.equal(tree.props.className,'transaction-amount positive');
 assert.equal(text(tree),formatSignedMoney(1200,'EUR','en'));
 tree=expand(h(page.TransactionAmount,{record:entry({amount:13})}),'a');
 assert.equal(tree.props.className,'transaction-amount');
 assert.equal(text(tree),'−$13');
});

const rule=(over={})=>({...page.newRule(),...over});
const submit=tree=>findAll(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});

test('RuleDialog needs a criterion and an action, and counts the transactions it would change',async()=>{
 const saves=[];let closed=0;
 const records=[entry(),entry({id:'r2',name:'Coffee Shop 9',kind:'Charity'}),entry({id:'r3',name:'Salary',kind:'Salary'})];
 const render=mount(h(page.RuleDialog,{rule:page.newRule(),records,categories,businesses,accounts:[{id:'a1',name:'Wallet'}],tags,splits:[],tagsOf:()=>[],onSave:async(r,apply)=>{saves.push([r,apply]);return 1;},onClose:()=>closed++}));
 let tree=render();
 const save=()=>button(render(),'Save rule');
 assert.equal(save().props.disabled,true);
 assert.match(text(tree),/Apply to matching past transactions/);
 assert.equal(byLabel(tree,'Name').props.required,true);
 assert.equal(findAll(tree,n=>n.type==='details')[0].props.open,undefined);
 await submit(tree);
 assert.deepEqual(saves,[]);
 byLabel(tree,'Name').props.onChange(typed('  coffee shop '));
 byLabel(render(),'Name match').props.onChange(typed('contains'));
 // A name alone is not enough: the rule must also set something.
 assert.equal(save().props.disabled,true);
 tree=render();
 const setCategory=findAll(tree,n=>n.type==='Popover')[1];
 setCategory.props.onOpenChange(true);tree=render();
 assert.equal(findAll(tree,n=>n.type==='Popover')[1].props.open,true);
 button(findAll(tree,n=>n.type==='PopoverContent')[1],'Food').props.onClick();tree=render();
 assert.equal(findAll(tree,n=>n.type==='Popover')[1].props.open,false);
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[1]),'Food');
 assert.equal(save().props.disabled,false);
 assert.match(text(tree),/Apply to 2 matching transactions/);
 // Leave unchanged clears the category again.
 button(findAll(tree,n=>n.type==='PopoverContent')[1],'Leave unchanged').props.onClick();tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[1]),'Leave unchanged');
 assert.equal(buttonsWith(findAll(tree,n=>n.type==='PopoverContent')[1],'Leave unchanged').length,0);
 button(findAll(tree,n=>n.type==='PopoverContent')[1],'Charity').props.onClick();tree=render();
 assert.match(text(tree),/Apply to 1 matching transactions/);
 findAll(tree,n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({currentTarget:{checked:false}});
 await submit(render());
 assert.equal(closed,1);
 assert.equal(saves.length,1);
 const [saved,apply]=saves[0];
 assert.equal(apply,false);
 assert.equal(saved.pattern,'coffee shop');
 assert.equal(saved.kind,'Charity');
 assert.equal(saved.category_id,null);
 assert.equal(saved.direction,'expense');
 findAll(render(),n=>n.type==='Dialog')[0].props.onOpenChange(true);
 findAll(render(),n=>n.type==='Dialog')[0].props.onOpenChange(false);
 assert.equal(closed,2);
});

test('RuleDialog more conditions: account, required category, business and amount range',async()=>{
 const saves=[];
 const start=rule({pattern:'',account_id:'a1',amount_min:50,kind:'Living expense'});
 const render=mount(h(page.RuleDialog,{rule:start,categories,businesses,accounts:[{id:'a1',name:'Wallet'}],tags,splits:[],tagsOf:()=>[],onSave:async r=>{saves.push(r);return 0;},onClose(){}}));
 let tree=render();
 assert.equal(findAll(tree,n=>n.type==='details')[0].props.open,true);
 assert.equal(text(findAll(tree,n=>n.type==='Count')[0]),'2');
 assert.equal(byLabel(tree,'Name').props.required,false);
 assert.match(text(tree),/Apply to matching past transactions/);
 const selects=()=>findAll(render(),n=>n.type==='select');
 assert.equal(selects()[1].props.value,'a1');
 selects()[1].props.onChange(typed(''));
 assert.equal(selects()[1].props.value,'');
 selects()[1].props.onChange(typed('a1'));
 assert.equal(selects()[2].props.value,'');
 selects()[2].props.onChange(typed('b1'));
 assert.equal(selects()[2].props.value,'b1');
 selects()[2].props.onChange(typed(''));
 selects()[2].props.onChange(typed('b2'));
 // Required category: pick one, then clear it with Any category.
 tree=render();
 findAll(tree,n=>n.type==='Popover')[0].props.onOpenChange(true);
 assert.equal(findAll(render(),n=>n.type==='Popover')[0].props.open,true);
 findAll(render(),n=>n.type==='Popover')[0].props.onOpenChange(false);
 assert.equal(buttonsWith(findAll(render(),n=>n.type==='PopoverContent')[0],'Any category').length,0);
 button(findAll(render(),n=>n.type==='PopoverContent')[0],'Food').props.onClick();
 tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[0]),'Food');
 assert.equal(text(findAll(tree,n=>n.type==='Count')[0]),'4');
 button(findAll(tree,n=>n.type==='PopoverContent')[0],'Any category').props.onClick();
 assert.equal(text(findAll(render(),n=>n.props.className==='rule-category-button')[0]),'Any category');
 button(findAll(render(),n=>n.type==='PopoverContent')[0],'Rent expense').props.onClick();
 // Amounts: an upper bound below the lower one is refused with a formatted message.
 const amounts=()=>findAll(render(),n=>n.type==='FormattedNumberInput');
 assert.equal(amounts()[0].props.value,50);
 assert.equal(amounts()[1].props.value,0);
 amounts()[0].props.onValueChange(1000,false);
 amounts()[1].props.onValueChange(20,false);
 tree=render();
 assert.equal(text(findAll(tree,n=>n.props.role==='alert')[0]),'The upper amount must not be below 1,000.');
 assert.equal(button(tree,'Save rule').props.disabled,true);
 amounts()[0].props.onValueChange(0,true);
 tree=render();
 assert.equal(findAll(tree,n=>n.props.role==='alert').length,0);
 amounts()[1].props.onValueChange(0,true);
 // Set the business, then clear it.
 tree=render();
 const businessPop=findAll(tree,n=>n.type==='Popover')[2];
 businessPop.props.onOpenChange(true);
 assert.equal(findAll(render(),n=>n.type==='Popover')[2].props.open,true);
 assert.deepEqual(findAll(findAll(render(),n=>n.type==='PopoverContent')[2],n=>n.props.role==='option').map(text),['Bakery','Studio']);
 assert.equal(buttonsWith(findAll(render(),n=>n.type==='PopoverContent')[2],'Leave unchanged').length,0);
 button(findAll(render(),n=>n.type==='PopoverContent')[2],'Bakery').props.onClick();
 tree=render();
 assert.equal(text(findAll(tree,n=>n.props.className==='rule-category-button')[2]),'Bakery');
 assert.equal(findAll(findAll(tree,n=>n.props.className==='rule-category-button')[2],n=>n.type==='BusinessMark')[0].props.color,'teal');
 button(findAll(tree,n=>n.type==='PopoverContent')[2],'Leave unchanged').props.onClick();
 assert.equal(text(findAll(render(),n=>n.props.className==='rule-category-button')[2]),'Leave unchanged');
 button(findAll(render(),n=>n.type==='PopoverContent')[2],'Studio').props.onClick();
 await submit(render());
 assert.equal(saves.length,1);
 assert.deepEqual({account:saves[0].account_id,inBusiness:saves[0].match_business_id,kind:saves[0].match_kind,min:saves[0].amount_min,max:saves[0].amount_max,sets:saves[0].kind,business:saves[0].business_id},{account:'a1',inBusiness:'b2',kind:'Rent expense',min:null,max:null,sets:'Living expense',business:'b2'});
});

test('RuleDialog for both directions drops categories; tags are capped at ten; failures are shown',async()=>{
 const many=Array.from({length:12},(_,i)=>({id:'tag'+i,name:'Tag '+i,color:'teal'}));
 let fail=Error('Rule limit reached.');
 const render=mount(h(page.RuleDialog,{rule:rule({pattern:'Uber',match:'exact',kind:'Charity',match_kind:'Charity'}),records:[],categories,businesses:[],tags:many,splits:[],tagsOf:()=>[],onCreateTag:async name=>'id-'+name,onSave:async()=>{if(fail)throw fail;return 0;},onClose(){}}));
 let tree=render();
 assert.equal(findAll(tree,n=>n.type==='select').length,1);
 assert.match(text(tree),/Apply to 0 matching transactions/);
 findAll(tree,n=>n.type==='Segmented')[0].props.onChange('any');
 tree=render();
 assert.equal(findAll(tree,n=>n.props.className==='rule-category-button').length,0);
 // The category was the only action, and it no longer applies.
 assert.equal(button(tree,'Save rule').props.disabled,true);
 for(let i=0;i<12;i++)button(render(),'Tag '+i+'').props.onClick();
 assert.equal(findAll(render(),n=>n.props['aria-pressed']===true).length,10);
 button(render(),'Tag 0').props.onClick();
 assert.equal(findAll(render(),n=>n.props['aria-pressed']===true).length,9);
 tree=render();
 assert.equal(button(tree,'Save rule').props.disabled,false);
 await submit(tree);
 assert.equal(text(findAll(render(),n=>n.props.role==='alert')[0]),'Rule limit reached.');
 let finish,closed=0;fail=null;
 const slow=mount(h(page.RuleDialog,{rule:rule({pattern:'Uber',tag_ids:['t1']}),categories,businesses:[],tags,splits:[],tagsOf:()=>[],onSave:()=>new Promise(resolve=>{finish=resolve;}),onClose:()=>closed++}));
 const pending=submit(slow());
 tree=slow();
 assert.equal(button(tree,'Saving…').props.disabled,true);
 findAll(tree,n=>n.type==='Dialog')[0].props.onOpenChange(false);
 assert.equal(closed,0);
 finish(0);await pending;
 assert.equal(closed,1);
 assert.equal(button(slow(),'Save rule').props.disabled,false);
});

test('RulesDialog lists rules in words, edits, adds and deletes after confirmation',async()=>{
 const calls=[];let fail=null;
 const rules=[
  rule({id:'x1',pattern:'coffee',kind:'Other expense',category_id:'c-food'}),
  rule({id:'x2',pattern:'Uber',match:'exact',business_id:'b1',tag_ids:['t1','gone']}),
  rule({id:'x3',pattern:' ',account_id:'a1',amount_max:10,kind:null}),
 ];
 const props={rules,categories,businesses,tags,onEdit:r=>calls.push(['edit',r.id]),onAdd:()=>calls.push(['add']),onRemove:async r=>{if(fail)throw fail;calls.push(['remove',r.id]);},onClose:()=>calls.push(['close'])};
 const render=mount(h(page.RulesDialog,props));
 let tree=render();
 const rows=findAll(tree,n=>n.type==='li').map(text);
 assert.deepEqual(rows,['Name contains “coffee”→Food','Name is “Uber”→BakeryTrip','Any name · +2 conditions→No changes']);
 button(tree,'Name is “Uber”').props.onClick();
 button(tree,'Add rule').props.onClick();
 findAll(tree,n=>n.type==='Dialog')[0].props.onOpenChange(true);
 findAll(tree,n=>n.type==='Dialog')[0].props.onOpenChange(false);
 const confirm=()=>findAll(render(),n=>n.type==='ConfirmDialog')[0];
 assert.equal(confirm().props.open,false);
 assert.equal(confirm().props.title,'Delete ?');
 // Confirming with nothing chosen does nothing.
 await confirm().props.onConfirm();
 byLabel(tree,'Delete Name contains “coffee”').props.onClick();
 assert.equal(confirm().props.open,true);
 assert.equal(confirm().props.title,'Delete Name contains “coffee”?');
 assert.equal(confirm().props.confirmLabel,'Delete rule');
 confirm().props.onClose();
 assert.equal(confirm().props.open,false);
 byLabel(tree,'Delete Any name · +2 conditions').props.onClick();
 fail=Error('Network down');
 await confirm().props.onConfirm();
 assert.equal(confirm().props.error,'Network down');
 assert.equal(confirm().props.open,true);
 fail=null;
 // Asking again clears the old error.
 byLabel(tree,'Delete Any name · +2 conditions').props.onClick();
 assert.equal(confirm().props.error,'');
 await confirm().props.onConfirm();
 assert.equal(confirm().props.open,false);
 assert.deepEqual(calls,[['edit','x2'],['add'],['close'],['remove','x3']]);
 let finish;const slowRemove=()=>new Promise(resolve=>{finish=resolve;});
 props.onRemove=slowRemove;
 const slow=mount(h(page.RulesDialog,props));
 byLabel(slow(),'Delete Name contains “coffee”').props.onClick();
 const confirmSlow=()=>findAll(slow(),n=>n.type==='ConfirmDialog')[0];
 const pending=confirmSlow().props.onConfirm();
 assert.equal(confirmSlow().props.busy,true);
 assert.equal(confirmSlow().props.confirmLabel,'Deleting…');
 await confirmSlow().props.onConfirm();
 finish();await pending;
 assert.equal(confirmSlow().props.open,false);
 assert.equal(confirmSlow().props.busy,false);
});

test('RulesPanel shows the count, an empty message and the same list',()=>{
 const calls=[];
 let tree=mount(h(page.RulesPanel,{rules:[],categories,onEdit(){},onAdd:()=>calls.push('add'),onRemove:async()=>{}}))();
 assert.equal(text(findAll(tree,n=>n.type==='Count')[0]),'0');
 assert.match(text(tree),/No rules yet\. Change a transaction’s category or business and choose Create rule, or add one here\./);
 assert.match(findAll(tree,n=>n.type==='PanelTitle')[0].props.hint,/A rule sets the category/);
 button(tree,'Add rule').props.onClick();
 assert.deepEqual(calls,['add']);
 tree=mount(h(page.RulesPanel,{rules:[rule({id:'p',pattern:'Rent',kind:'Rent expense'})],categories,onEdit(){},onAdd(){},onRemove:async()=>{}}))();
 assert.equal(text(findAll(tree,n=>n.type==='Count')[0]),'1');
 assert.deepEqual(findAll(tree,n=>n.type==='li').map(text),['Name contains “Rent”→Rent expense']);
});

test('Rule suggestions start from the transaction name without its reference number',()=>{
 const blank=page.newRule();
 assert.equal(blank.pattern,'');
 assert.equal(blank.direction,'expense');
 assert.equal(blank.match,'contains');
 assert.deepEqual(blank.tag_ids,[]);
 assert.match(blank.id,/^[0-9a-f-]{36}$/);
 assert.notEqual(page.newRule().id,blank.id);
 const fromChange=page.ruleFromChange(entry(),{kind:'Other income',category_id:'c-side'});
 assert.deepEqual({pattern:fromChange.pattern,direction:fromChange.direction,kind:fromChange.kind,category:fromChange.category_id,business:fromChange.business_id},{pattern:'Coffee Shop',direction:'income',kind:'Other income',category:'c-side',business:null});
 assert.equal(page.ruleFromChange(entry(),{kind:'Cash',category_id:null}).direction,'expense');
 const fromBusiness=page.ruleFromBusiness(entry({name:'Uber #4411'}),'b1');
 assert.deepEqual({pattern:fromBusiness.pattern,direction:fromBusiness.direction,business:fromBusiness.business_id,kind:fromBusiness.kind},{pattern:'Uber',direction:'any',business:'b1',kind:null});
});
