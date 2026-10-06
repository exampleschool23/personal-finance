import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
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
 const props={categories:[category],saveCategory:async()=>{},icons:{icons:{},disabled:false,choose:async()=>{},emojiOf:kind=>kind==='food'?'🍕':'🏷️'},loading:true,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:null,demo:true};
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
 const props={categories:[category],saveCategory:async(name,direction,existing)=>{calls.push(['save',name,direction,existing]);return existing??id(5);},icons,loading:false,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:null,demo:true};
 let panel;const group=()=>{panel=h.render(props);const node=find(panel,item=>item.type?.name==='CategoryGroup'&&item.props.direction==='expense');return node.type(node.props);};
 let tree=group();
 const pills=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.props?.className==='category-edit-button')pills.push(node);for(const child of React.Children.toArray(node.props?.children))walk(child);})(tree);
 assert.equal(pills.length,5,'built-in and added categories alike');
 const leisure=pills.find(pill=>pill.props['aria-label']==='Edit Leisure');
 assert.equal(find(leisure,node=>node.type?.name==='CategoryBadge').props.icon.props.children,'🎬');
 leisure.props.onClick();tree=group();
 let dialog=find(tree,node=>node.type?.name==='EditCategoryDialog');
 assert.deepEqual([dialog.props.item.label,dialog.props.icon,dialog.props.chosen,dialog.props.color],['Leisure','🎬',true,'violet']);
 assert.equal(typeof dialog.props.onDelete,'function');
 await dialog.props.onSave({name:'Hobbies',icon:'🎨',color:'teal'});
 assert.deepEqual(calls.slice(-2),[['save','Hobbies','expense',id(1)],['look',id(1),{icon:'🎨',color:'teal'}]],'icon and colour are one save');
 await dialog.props.onSave({color:null});assert.deepEqual(calls.at(-1),['look',id(1),{color:null}],'a colour-only change does not rename');
 // A built-in category edits only its icon and cannot be deleted.
 pills.find(pill=>pill.props['aria-label']==='Edit Charity').props.onClick();tree=group();
 dialog=find(tree,node=>node.type?.name==='EditCategoryDialog');
 assert.equal(dialog.props.item.category,undefined);assert.equal(dialog.props.onDelete,undefined);assert.equal(dialog.props.color,null);
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
 assert.equal(find(builtIn,node=>node.props?.className==='category-edit-delete'),undefined);
});
