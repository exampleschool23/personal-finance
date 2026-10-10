import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
const {chosenCategoryHue}=loadTS('lib/category-colors.ts');
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request=(body,method='DELETE')=>new Request('https://local/api/categories?id='+id(1),{method,...(method==='GET'?{}:{body:JSON.stringify(body)})});
function api({auth=true,origin=true,failure=null}={}){
 const calls=[];
 return {...loadTS('app/api/categories/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:id(9)},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return failure?Response.json(failure,{status:400}):Response.json({ok:true});}}}),calls};
}
test('category deletion API validates ownership, origin, replacement and failures',async()=>{
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.DELETE(request({id:id(1)}))).status,status);assert.equal(app.calls.length,0);}
 for(const body of [{id:'bad'},{id:id(1),new_name:' '},{id:id(1),new_name:'New',replacement_id:id(2)}]){const app=api();assert.equal((await app.DELETE(request(body))).status,400);assert.equal(app.calls.length,0);}
 const app=api();assert.equal((await app.GET(request(null,'GET'))).status,200);assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/category_usage',body:{p_category:id(1)},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:id(1),new_name:' Leisure ',user_id:id(99)}))).status,200);assert.deepEqual(app.calls[1].body,{p_category:id(1),p_replacement:null,p_new_name:'Leisure'});
 const failed=api({failure:{code:'P0001',message:'This category is in use. Choose a replacement category.'}});const response=await failed.DELETE(request({id:id(1)}));assert.equal(response.status,409);assert.match((await response.json()).error,/replacement/);
 const anonymous=api({auth:false});assert.equal((await anonymous.GET(request(null,'GET'))).status,401);assert.equal(anonymous.calls.length,0);
});
function find(node,predicate){
 if(!node||typeof node!=='object')return;
 if(predicate(node))return node;
 for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}
}
function harness(file,name){
 const values=[],effects=[];let cursor=0;const refs=[];let refCursor=0;
 const loaded=loadTS(file,{
  react:{...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useEffect(effect){effects.push(effect);},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});}},
  '@/components/language-provider':{useLanguage:()=>({t:(key,params={})=>key.replace(/\{(\w+)\}/g,(_,name)=>params[name]??name),locale:'en-US'})},
  '@/components/discard-changes':{useUnsavedNavigation:()=>null,useDiscardChanges:(dirty,onClose)=>({close:onClose,request:action=>action(),confirmation:null})},
 });
 return {render:props=>{cursor=0;refCursor=0;return loaded[name](props);},effects};
}
test('delete dialog requires a loaded preview and explicit same-type replacement; failures retain the dialog',async()=>{
 const h=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');let closed=0,deleted=0;
 const category={id:id(1),name:'Leisure',direction:'expense'},target={id:id(2),name:'Travel',direction:'expense'};
 const props={category,categories:[category,target,{id:id(3),name:'Salary bonus',direction:'income'}],onClose:()=>closed++,onDeleted:()=>deleted++};
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return options?.method==='DELETE'?Response.json({error:'Unavailable'},{status:503}):Response.json({records:2,deleted:1,watchlists:0});};
 try{
  let tree=h.render(props);let submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,true);
  const cleanup=h.effects[0]();await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
  const select=find(tree,node=>node.type?.name==='NativeSelect');assert.ok(select);assert.equal(find(tree,node=>node.props?.value===id(3)),undefined);
  assert.equal(find(tree,node=>node.props?.variant==='destructive').props.disabled,true);
  select.props.onChange({target:{value:target.id}});tree=h.render(props);submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,false);
  submit.props.onClick();await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
  assert.equal(closed,0);assert.equal(deleted,0);assert.equal(find(tree,node=>node.type?.name==='ErrorPopup').props.message,'Unavailable');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:category.id,replacement_id:target.id});
  globalThis.fetch=async()=>Response.json({ok:true});find(tree,node=>node.props?.variant==='destructive').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);assert.equal(deleted,1);cleanup();
 }finally{globalThis.fetch=original;}
});
test('category pills are named edit buttons, disabled while loading; text fields stay editable',()=>{
 const h=harness('components/transaction-tools-panel.tsx','TransactionToolsPanel');const category={id:id(1),name:'Leisure',direction:'expense'};
 const props={categories:[category],saveCategory:async()=>{},icons:{icons:{},disabled:false,choose:async()=>{},emojiOf:kind=>kind==='food'?'🍕':'🏷️'},removed:{kinds:[],restore:async()=>{},hideForVisit(){},deleted(){},disabled:false},loading:true,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:null,demo:true};
 const panel=h.render(props);const group=find(panel,node=>node.type?.name==='CategoryGroup'&&node.props.direction==='expense');
 // The group uses hooks from the same mocked React module.
 const tree=group.type(group.props);
 assert.equal(find(tree,node=>node.type?.name==='Input').props.disabled,false);
 const edit=find(tree,node=>node.props?.className==='category-edit-button'&&node.props['aria-label']==='Edit Leisure');assert.equal(edit.props.disabled,true);
 assert.ok(find(edit,node=>node.props?.className==='category-edit-icon'),'a pencil shows the pill can be edited');
});
test('tapping a category pill edits its name and icon together; built-in names stay fixed and delete moves into the dialog',async()=>{
 const h=harness('components/transaction-tools-panel.tsx','TransactionToolsPanel');const category={id:id(1),name:'Leisure',direction:'expense'};
 const calls=[];
 const icons={icons:{[id(1)]:'🎬'},colors:{[id(1)]:'violet'},disabled:false,choose:async(key,icon)=>{calls.push(['icon',key,icon]);},update:async(key,look)=>{calls.push(['look',key,look]);},emojiOf:kind=>kind==='Leisure'?'🎬':'🏷️'};
 const hidden=[];const props={categories:[category],saveCategory:async(name,direction,existing)=>{calls.push(['save',name,direction,existing]);return existing??id(5);},icons,removed:{kinds:[],restore:async()=>{},hideForVisit:kind=>hidden.push(kind),deleted(){},disabled:false},loading:false,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:null,demo:true};
 let panel;const group=()=>{panel=h.render(props);const node=find(panel,item=>item.type?.name==='CategoryGroup'&&item.props.direction==='expense');return node.type(node.props);};
 let tree=group();
 const pills=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.props?.className==='category-edit-button')pills.push(node);for(const child of React.Children.toArray(node.props?.children))walk(child);})(tree);
 assert.equal(pills.length,5,'built-in and added categories alike');
 const leisure=pills.find(pill=>pill.props['aria-label']==='Edit Leisure');
 assert.equal(find(leisure,node=>node.props?.className==='category-icon').props.children,'🎬');
 assert.equal(find(leisure,node=>node.props?.className==='category-icon').props.style['--category-hue'],chosenCategoryHue(id(1),icons.colors),'the chosen colour tints the row icon');
 leisure.props.onClick();tree=group();
 let dialog=find(tree,node=>node.type?.name==='EditCategoryDialog');
 assert.deepEqual([dialog.props.item.label,dialog.props.icon,dialog.props.chosen,dialog.props.color],['Leisure','🎬',true,'violet']);
 assert.equal(typeof dialog.props.onDelete,'function');
 await dialog.props.onSave({name:'Hobbies',icon:'🎨',color:'teal'});
 assert.deepEqual(calls.slice(-2),[['save','Hobbies','expense',id(1)],['look',id(1),{icon:'🎨',color:'teal'}]],'icon and colour are one save');
 await dialog.props.onSave({color:null});assert.deepEqual(calls.at(-1),['look',id(1),{color:null}],'a colour-only change does not rename');
 // A built-in category keeps its name and can be deleted too; the sample workspace hides it for the visit.
 pills.find(pill=>pill.props['aria-label']==='Edit Charity').props.onClick();tree=group();
 dialog=find(tree,node=>node.type?.name==='EditCategoryDialog');
 assert.equal(dialog.props.item.category,undefined);assert.equal(dialog.props.color,null);
 dialog.props.onDelete();assert.deepEqual(hidden,['Charity']);tree=group();
 // A new category: the name, then its icon.
 find(tree,node=>node.type?.name==='Input').props.onChange({target:{value:'Travel'}});tree=group();
 const start=find(tree,node=>node.props?.label==='Choose an icon');assert.deepEqual([start.props.icon,start.props.chosen],['🏷️',false]);
 start.props.onChoose('✈️');tree=group();
 assert.equal(find(tree,node=>node.props?.label==='Choose an icon').props.icon,'✈️');
 await find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(calls.slice(-2),[['save','Travel','expense',undefined],['icon',id(5),'✈️']]);
});
test('the category edit dialog saves only what changed (name, icon and colour), refuses a taken name and offers delete for added categories',async()=>{
 const h=harness('components/edit-category-dialog.tsx','EditCategoryDialog');const saved=[];let closed=0,deleted=0;
 const props={item:{id:id(1),label:'Leisure',direction:'expense',category:{id:id(1),name:'Leisure',direction:'expense'}},icon:'🎬',chosen:true,color:null,defaultHue:290,iconsDisabled:false,categories:[{id:id(1),name:'Leisure',direction:'expense'},{id:id(2),name:'Travel',direction:'expense'}],builtInNames:['Charity'],onSave:async change=>{saved.push(change);},onDelete:()=>{deleted++;},onClose:()=>{closed++;}};
 let tree=h.render(props);
 const save=()=>find(tree,node=>node.type?.name==='Button'&&!node.props.type);
 assert.equal(save().props.disabled,true,'nothing changed yet');
 find(tree,node=>node.type?.name==='Input').props.onChange({target:{value:'travel'}});tree=h.render(props);
 assert.equal(save().props.disabled,true,'a name in use is refused');assert.ok(find(tree,node=>node.props?.role==='alert'));
 find(tree,node=>node.type?.name==='Input').props.onChange({target:{value:' Hobbies '}});tree=h.render(props);
 find(tree,node=>node.type?.name==='CategoryIconPicker').props.onChoose('🎨');tree=h.render(props);
 assert.equal(find(tree,node=>node.type?.name==='CategoryIconPicker').props.icon,'🎨');
 const swatch=label=>find(tree,node=>node.props?.role==='radio'&&node.props['aria-label']===label);
 assert.equal(swatch('Automatic').props['aria-checked'],true,'no colour chosen yet');assert.equal(swatch('Grey'),undefined);
 swatch('Green').props.onClick();tree=h.render(props);assert.equal(swatch('Green').props['aria-checked'],true);
 await find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(saved,[{name:'Hobbies',icon:'🎨',color:'green'}]);assert.equal(closed,1);
 find(tree,node=>node.props?.className==='category-edit-delete').props.onClick();assert.equal(deleted,1);
 const builtIn=harness('components/edit-category-dialog.tsx','EditCategoryDialog').render({...props,item:{id:'Charity',label:'Charity',direction:'expense'},onDelete:undefined});
 assert.equal(find(builtIn,node=>node.type?.name==='Input').props.disabled,true,'built-in names are translated and stay fixed');
 assert.equal(find(builtIn,node=>node.props?.className==='category-edit-delete').props.reason,'Keep at least one category of this type.','the last category of a direction shows the bin, disabled, with the reason');
});

test('deleted built-in categories leave the list, are never shown again, and the last category of a direction stays',async()=>{
 const h=harness('components/transaction-tools-panel.tsx','TransactionToolsPanel');
 const removed={kinds:['Rent expense','Salary','Rent income','Business income'],hideForVisit(){},deleted(){}};
 const props={categories:[],saveCategory:async()=>id(5),icons:{icons:{},colors:{},disabled:false,choose:async()=>{},update:async()=>{},emojiOf:()=>'🏷️'},removed,loading:false,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:id(9),demo:false};
 const panel=h.render(props);
 const groupOf=direction=>{const node=find(panel,item=>item.type?.name==='CategoryGroup'&&item.props.direction===direction);return node;};
 assert.deepEqual(groupOf('expense').props.items.map(item=>item.id),['Living expense','Charity','Other expense']);
 assert.deepEqual(groupOf('income').props.items.map(item=>item.id),['Other income']);
 // Nothing lists what was deleted.
 assert.equal(find(panel,node=>typeof node.props?.['aria-label']==='string'&&node.props['aria-label'].startsWith('Restore')),undefined);
 // Other income is the only income category left: its bin stays disabled.
 const render=direction=>{const node=find(h.render(props),item=>item.type?.name==='CategoryGroup'&&item.props.direction===direction);return node.type(node.props);};
 const pill=(node,label)=>find(node,item=>item.props?.className==='category-edit-button'&&item.props['aria-label']===label);
 pill(render('income'),'Edit Other income').props.onClick();
 assert.equal(find(render('income'),node=>node.type?.name==='EditCategoryDialog').props.onDelete,undefined);
 // A built-in category with a database opens the delete dialog, named by its kind.
 const h2=harness('components/transaction-tools-panel.tsx','TransactionToolsPanel');
 const expense=()=>{const root=h2.render(props);const node=find(root,item=>item.type?.name==='CategoryGroup'&&item.props.direction==='expense');return {root,tree:node.type(node.props)};};
 pill(expense().tree,'Edit Charity').props.onClick();
 find(expense().tree,node=>node.type?.name==='EditCategoryDialog').props.onDelete();
 const dialog=find(expense().root,node=>node.type?.name==='DeleteCategoryDialog');
 assert.deepEqual(dialog.props.category,{id:'Charity',name:'Charity',direction:'expense'});
});
test('the category API reads and deletes a built-in category by its kind',async()=>{
 const app=api();
 assert.equal((await app.GET(new Request('https://local/api/categories?id=Rent%20expense'))).status,200);
 assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/built_in_category_usage',body:{p_kind:'Rent expense'},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Rent expense',replacement_id:id(2)}))).status,200);
 assert.deepEqual(app.calls[1],{path:'/rest/v1/rpc/delete_built_in_category',body:{p_kind:'Rent expense',p_replacement:id(2),p_new_name:null},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Groceries'}))).status,400);
});
test('records of a deleted category can move to a built-in category by its kind, and only one destination is accepted',async()=>{
 const app=api();
 assert.equal((await app.DELETE(request({id:id(1),replacement_kind:'Charity'}))).status,200);
 assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/delete_category_into_kind',body:{p_from:id(1),p_kind:'Charity'},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Rent expense',replacement_kind:'Charity'}))).status,200,'a built-in category moves into another built-in one the same way');
 assert.deepEqual(app.calls[1],{path:'/rest/v1/rpc/delete_category_into_kind',body:{p_from:'Rent expense',p_kind:'Charity'},token:'owner-token'});
 for(const body of [{id:id(1),replacement_id:id(2),replacement_kind:'Charity'},{id:id(1),new_name:'New',replacement_kind:'Charity'},{id:id(1),replacement_kind:'Groceries'}]){const refused=api();assert.equal((await refused.DELETE(request(body))).status,400,JSON.stringify(body));assert.equal(refused.calls.length,0);}
});
test('the delete dialog offers the other built-in kinds of the same type, minus the deleted ones and its own, and sends the chosen kind',async()=>{
 const h=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');let closed=0,deleted=0;
 const category={id:id(1),name:'Leisure',direction:'expense'};
 const props={category,categories:[category,{id:id(2),name:'Travel',direction:'expense'}],removed:['Rent expense'],onClose:()=>closed++,onDeleted:()=>deleted++};
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return options?.method==='DELETE'?Response.json({ok:true}):Response.json({records:2,deleted:0,watchlists:0});};
 try{
  h.render(props);const cleanup=h.effects[0]();await new Promise(resolve=>setImmediate(resolve));let tree=h.render(props);
  const options=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.type==='option')options.push(node.props.value);for(const child of React.Children.toArray(node.props?.children))walk(child);})(find(tree,node=>node.type?.name==='NativeSelect'));
  assert.deepEqual(options,['','Living expense','Charity','Other expense',id(2),'new'],'built-in kinds first, without the deleted Rent expense, then added categories');
  find(tree,node=>node.type?.name==='NativeSelect').props.onChange({target:{value:'Charity'}});tree=h.render(props);
  const submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,false);
  submit.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:category.id,replacement_kind:'Charity'});assert.equal(closed,1);assert.equal(deleted,1);cleanup();
  // A built-in category being deleted never offers itself.
  const own=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');const charity={id:'Charity',name:'Charity',direction:'expense'};
  own.render({...props,category:charity});const stop=own.effects[0]();await new Promise(resolve=>setImmediate(resolve));
  const kinds=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.type==='option')kinds.push(node.props.value);for(const child of React.Children.toArray(node.props?.children))walk(child);})(find(own.render({...props,category:charity}),node=>node.type?.name==='NativeSelect'));
  assert.ok(!kinds.includes('Charity'));assert.ok(kinds.includes('Living expense'));stop();
 }finally{globalThis.fetch=original;}
});
