import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
import {workspaceSource} from './helpers/workspace-source.mjs';

const household=loadTS('lib/household.ts');
const me='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const jar=(values={})=>{const store=new Map(Object.entries(values)),writes=[],deleted=[];return {store,writes,deleted,get:name=>store.has(name)?{value:store.get(name)}:undefined,set:(name,value,options)=>{writes.push({name,value,options});store.set(name,value);},delete:name=>{deleted.push(name);store.delete(name);}};};
const headerOf=init=>new Headers(init?.headers).get('x-workspace-owner');

test('household helpers: owners and their filter, initials and invite links',()=>{
 const {SHARED,ownerOf,holdingOwner,inOwnerFilter,ownedBy,ownerMember,ownerChoices,assignOwner,moveAccountToOwner,accountOwnerChange,demoHousehold,initials,inviteLink,inviteToken,workspaceId,workspaceOwner,sharedWorkspace,canEdit,personalRequest,knownHouseholdMessage}=household;
 const home={active:owner,people:[{id:owner,name:'Alex'},{id:me,name:null}]};
 // Records from before owners are shared; so are those of someone who has left. A person is named only with shared switched off.
 assert.equal(ownerOf({},home),SHARED);assert.equal(ownerOf({member_id:me},home),SHARED);assert.equal(ownerOf({shared:true,member_id:me},home),SHARED);
 assert.equal(ownerOf({shared:false,member_id:me},home),me);assert.equal(ownerOf({shared:false,member_id:null},home),owner,'without a name it is the workspace owner\'s');
 assert.equal(ownerOf({shared:false,member_id:other},home),SHARED);
 assert.equal(holdingOwner({},home),SHARED);assert.equal(holdingOwner({member_id:me},home),me);assert.equal(holdingOwner({member_id:other},home),SHARED);
 assert.equal(inOwnerFilter([],me),true);assert.equal(inOwnerFilter([SHARED,me],me),true);assert.equal(inOwnerFilter([SHARED],me),false);
 assert.deepEqual(ownedBy(SHARED),{shared:true});assert.deepEqual(ownedBy(me),{shared:false,member_id:me});
 assert.equal(ownerMember(SHARED),null);assert.equal(ownerMember(me),me);
 assert.deepEqual(ownerChoices(home,{shared:'Shared',unnamed:'Partner'}),[{id:SHARED,name:'Shared'},{id:owner,name:'Alex'},{id:me,name:'Partner'}]);
 // Giving records to an owner counts only those that change; a shared record keeps naming who added it.
 const records=[{id:'a',kind:'Cash'},{id:'b',kind:'Living expense',account_id:'a',member_id:me},{id:'c',kind:'Living expense',account_id:'a',...ownedBy(owner)},{id:'d',kind:'Other income'},{id:'p',kind:'Property'},{id:'r',kind:'Rent income',income_source_id:'p'},{id:'s',kind:'Stock',holding_account_id:'h'}];
 let given=assignOwner(records,['b','c','zz'],owner,home);
 assert.equal(given.changed,1);assert.deepEqual(given.records.map(record=>ownerOf(record,home)),[SHARED,owner,owner,SHARED,SHARED,SHARED,SHARED]);
 given=assignOwner(given.records,['b'],SHARED,home);
 assert.deepEqual(given.records[1],{id:'b',kind:'Living expense',account_id:'a',member_id:owner,shared:true});
 // An account takes along what followed it; a transaction given to someone by hand stays.
 const accounts=[{id:'h',name:'Brokerage'}];
 let moved=moveAccountToOwner(records,accounts,'a',me,home);
 assert.equal(moved.changed,1);assert.deepEqual(moved.records.map(record=>ownerOf(record,home)),[me,me,owner,SHARED,SHARED,SHARED,SHARED]);
 assert.equal(moveAccountToOwner(moved.records,accounts,'a',me,home).changed,0);
 moved=moveAccountToOwner(moved.records,accounts,'a',SHARED,home);
 assert.deepEqual(moved.records.slice(0,3).map(record=>ownerOf(record,home)),[SHARED,SHARED,owner]);
 moved=moveAccountToOwner(records,accounts,'p',owner,home);
 assert.equal(moved.changed,1,'a property\'s rent follows it');assert.equal(ownerOf(moved.records[5],home),owner);
 moved=moveAccountToOwner(records,accounts,'h',me,home);
 assert.equal(moved.changed,1);assert.deepEqual(moved.accounts,[{id:'h',name:'Brokerage',member_id:me}]);assert.equal(ownerOf(moved.records[6],home),me);
 assert.deepEqual(moveAccountToOwner(moved.records,moved.accounts,'h',SHARED,home).accounts,[{id:'h',name:'Brokerage',member_id:null}]);
 assert.equal(moveAccountToOwner(records,accounts,'missing',me,home).changed,0);
 // A transaction moved to another account takes its owner, unless its own was chosen by hand.
 const cash=[{id:'joint'},{id:'mine',...ownedBy(me)},{id:'theirs',...ownedBy(owner)}];
 assert.deepEqual(accountOwnerChange({account_id:null},'mine',cash,home),{shared:false,member_id:me});
 assert.deepEqual(accountOwnerChange({account_id:'mine',...ownedBy(me)},'theirs',cash,home),{shared:false,member_id:owner});
 assert.deepEqual(accountOwnerChange({account_id:'mine',...ownedBy(me)},'joint',cash,home),{shared:true});
 assert.deepEqual(accountOwnerChange({account_id:'mine',...ownedBy(owner)},'joint',cash,home),{},'chosen by hand');
 assert.deepEqual(accountOwnerChange({account_id:'joint'},null,cash,home),{});
 // The sample workspace has a household of two, so owners can be tried without an account.
 assert.equal(sharedWorkspace(demoHousehold),true);assert.equal(canEdit(demoHousehold),true);assert.deepEqual(demoHousehold.memberships,[]);
 assert.equal(initials('Alex Morgan'),'AM');assert.equal(initials('sam@example.com'),'S');assert.equal(initials('ali_valiyev'),'AV');assert.equal(initials(null),'?');
 const token='a'.repeat(64);
 assert.equal(inviteLink('https://app.example',token),`https://app.example/settings?invite=${token}#household`);
 assert.equal(inviteToken(`?invite=${token}`),token);
 for(const bad of ['?invite=short','?invite='+'g'.repeat(64),'?other='+token,''])assert.equal(inviteToken(bad),null);
 assert.equal(workspaceId(owner),owner);assert.equal(workspaceId('not-a-uuid'),null);assert.equal(workspaceId(undefined),null);
 assert.equal(workspaceOwner({user:{id:me}}),me);assert.equal(workspaceOwner({user:{id:me},owner}),owner);
 assert.equal(sharedWorkspace(null),false);assert.equal(sharedWorkspace({people:[{id:me}]}),false);assert.equal(sharedWorkspace({people:[{id:me},{id:owner}]}),true);
 assert.equal(canEdit(null),true,'the app works as before without migration 100');assert.equal(canEdit({role:'member'}),true);assert.equal(canEdit({role:'viewer'}),false);
 assert.deepEqual(personalRequest({method:'POST',headers:{Prefer:'x'}}),{method:'POST',headers:{Prefer:'x','x-workspace-owner':''}});
 assert.equal(knownHouseholdMessage('This shared workspace is view-only.'),'This shared workspace is view-only.');assert.equal(knownHouseholdMessage('relation does not exist'),null);
 assert.equal(household.householdSchemas.attribute.safeParse({ids:[],member:me}).success,false);
 assert.equal(household.householdSchemas.invite.safeParse({role:'admin'}).success,false);
});

test('database requests name the open workspace from its cookie; personal requests and visitors never do',async()=>{
 const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
 process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_PUBLISHABLE_KEY='publishable';
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({});};
 try{
  const cookies=jar({hf_workspace:owner,hf_access:'token'});
  const lib=loadTS('lib/supabase.ts',{'next/headers':{cookies:async()=>cookies},'./supabase-jwt':{tokenVerifier:()=>async()=>({id:me,email:'me@example.com'})}});
  await lib.supa('/rest/v1/finance_records',{},'token');
  await lib.supa('/rest/v1/rpc/export_finance_backup',household.personalRequest({method:'POST'}),'token');
  await lib.supa('/auth/v1/token',{method:'POST'});
  await lib.supa('/rest/v1/rpc/x',{headers:{Prefer:'return=minimal'}},'token');
  assert.deepEqual(calls.map(call=>call.init.headers['x-workspace-owner']),[owner,'',undefined,owner]);
  assert.equal(calls[3].init.headers.Prefer,'return=minimal');
  assert.deepEqual(await lib.session(),{token:'token',user:{id:me,email:'me@example.com'},owner});
  cookies.store.set('hf_workspace','../etc');calls.length=0;
  await lib.supa('/rest/v1/finance_records',{},'token');
  assert.equal(calls[0].init.headers['x-workspace-owner'],undefined,'a malformed cookie is ignored');
  assert.equal((await lib.session()).owner,me);
 }finally{process.env.SUPABASE_URL=previous.url;process.env.SUPABASE_PUBLISHABLE_KEY=previous.key;globalThis.fetch=previous.fetch;if(previous.url===undefined)delete process.env.SUPABASE_URL;if(previous.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;}
});

function householdApi({cookie,state,failures={}}={}){
 const cookies=jar(cookie?{hf_workspace:cookie}:{}),calls=[];
 const stored=state??{me,name:'Me',members:[],invites:[],memberships:[{owner_id:owner,name:'Alex',role:'viewer'}]};
 const supa=async(path,init,token)=>{
  const name=path.replace('/rest/v1/rpc/','');calls.push({name,body:JSON.parse(init.body),workspace:headerOf(init),token});
  if(failures[name])return Response.json({message:failures[name]},{status:400});
  if(name==='household_state')return Response.json(stored);
  if(name==='household_people')return Response.json([{id:headerOf(init)||me,name:'Owner',role:'owner'}]);
  if(name==='create_household_invite')return Response.json({id:other,token:'f'.repeat(64),role:'member',expires_at:'2026-10-10T00:00:00Z'});
  if(name==='accept_household_invite')return Response.json({owner_id:owner,role:'member'});
  if(name==='set_record_owner'||name==='set_account_owner')return Response.json(2);
  return Response.json(null);
 };
 const route=loadTS('app/api/household/route.ts',{'next/headers':{cookies:async()=>cookies},'@/lib/account-access':{accountOrigin:()=>'https://app.example'},
  '@/lib/supabase':{session:async()=>({token:'token',user:{id:me},owner:household.workspaceId(cookies.store.get('hf_workspace'))??me}),supa,sameOrigin:req=>req.headers.get('origin')==='https://app.example'}});
 const post=(action,data,origin='https://app.example')=>route.POST(new Request('https://app.example/api/household',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action,data})}));
 return {route,post,cookies,calls};
}

test('the household API checks the open workspace against the database and keeps personal calls personal',async()=>{
 // A household the person belongs to opens; household_state itself is always personal.
 let api=householdApi({cookie:owner});
 let body=await (await api.route.GET()).json();
 assert.equal(body.active,owner);assert.equal(body.role,'viewer');assert.equal(body.reset,undefined);
 assert.deepEqual(api.calls.map(call=>[call.name,call.workspace]),[['household_state',''],['household_people',owner]]);
 // A cookie for a household the database no longer lists is dropped at once.
 api=householdApi({cookie:other});
 body=await (await api.route.GET()).json();
 assert.equal(body.active,me);assert.equal(body.role,'owner');assert.deepEqual(api.cookies.deleted,['hf_workspace']);assert.equal(body.reset,true,'the app reads again from the person\'s own workspace');
 assert.equal(api.calls[1].workspace,'');
 // Switching is allowed only into a listed household; the client's word is never enough.
 api=householdApi();
 assert.equal((await api.post('switch',{owner:other})).status,403);assert.deepEqual(api.cookies.writes,[]);
 assert.equal((await api.post('switch',{owner})).status,200);
 assert.deepEqual(api.cookies.writes.map(write=>[write.name,write.value,write.options.httpOnly,write.options.sameSite]),[['hf_workspace',owner,true,'lax']]);
 assert.equal((await api.post('switch',{owner:null})).status,200);assert.ok(api.cookies.deleted.includes('hf_workspace'));
 // Invites come back as a link once; joining opens the household.
 api=householdApi();
 body=await (await api.post('invite',{role:'member'})).json();
 assert.equal(body.link,`https://app.example/settings?invite=${'f'.repeat(64)}#household`);assert.equal(body.invite.token,undefined);
 body=await (await api.post('accept',{token:'f'.repeat(64)})).json();
 assert.equal(body.owner_id,owner);assert.equal(api.cookies.store.get('hf_workspace'),owner);
 // Owners are set in the open workspace: a person, or nobody for shared.
 api=householdApi({cookie:owner});
 body=await (await api.post('attribute',{ids:[other],member:me})).json();
 assert.equal(body.changed,2);assert.deepEqual(api.calls.at(-1),{name:'set_record_owner',body:{p_ids:[other],p_member:me},workspace:owner,token:'token'});
 await api.post('attribute',{ids:[other],member:null});assert.deepEqual(api.calls.at(-1).body,{p_ids:[other],p_member:null});
 body=await (await api.post('account_owner',{account:other,member:null})).json();
 assert.equal(body.changed,2);assert.deepEqual(api.calls.at(-1),{name:'set_account_owner',body:{p_account:other,p_member:null},workspace:owner,token:'token'});
 assert.equal((await api.post('account_owner',{account:'nope',member:me})).status,400);assert.equal((await api.post('attribute',{ids:[],member:me})).status,400);
 // Leaving the open household closes it; the owner removes by member id only.
 assert.equal((await api.post('leave',{owner})).status,200);assert.ok(api.cookies.deleted.includes('hf_workspace'));
 assert.deepEqual(api.calls.at(-1).body,{p_owner:owner,p_member:me});
 await api.post('remove',{member:other});assert.deepEqual(api.calls.at(-1).body,{p_owner:me,p_member:other});
 // Database refusals people can act on are passed on; others are a generic failure.
 api=householdApi({failures:{accept_household_invite:'This invite link is no longer valid. Ask for a new one.',create_household_invite:'relation "household_invites" does not exist'}});
 let response=await api.post('accept',{token:'f'.repeat(64)});
 assert.equal(response.status,409);assert.equal((await response.json()).error,'This invite link is no longer valid. Ask for a new one.');
 response=await api.post('invite',{role:'viewer'});
 assert.equal(response.status,503);assert.match((await response.json()).error,/database update 100/);
 // Bad input and other origins never reach the database.
 api=householdApi();
 for(const [action,data] of [['invite',{role:'owner'}],['accept',{token:'x'}],['switch',{owner:'x'}],['drop',{}],['attribute',{ids:Array(501).fill(other),member:me}]])assert.equal((await api.post(action,data)).status,400,action);
 assert.equal((await api.post('switch',{owner},'https://evil.example')).status,403);
 assert.equal(api.calls.length,0);
});

test('backups, account deletion and sign-out stay personal whichever workspace is open',()=>{
 const backup=fs.readFileSync('app/api/backup/route.ts','utf8');
 assert.equal((backup.match(/supa\(/g)||[]).length-(backup.match(/personalRequest\(/g)||[]).length,1,'only the signed service-key registration is not marked personal');
 assert.match(fs.readFileSync('app/api/account-access/route.ts','utf8'),/supa\(path,personalRequest\(init\),auth\.token\)\),auth\.user\.id\)/);
 assert.match(fs.readFileSync('app/api/auth/route.ts','utf8'),/c\.delete\(workspaceCookie\)/);
 // Routes that write owner rows name the open workspace, never the signed-in id.
 for(const file of ['tags','subscriptions','budget','workspace-preferences','transaction-rules','record-attachments','holding-accounts','comparison-profile'])assert.doesNotMatch(fs.readFileSync(`app/api/${file}/route.ts`,'utf8'),/auth\.user\.id/,file);
});

test('the drawer offers the workspace switch only when there is a household to switch to',()=>{
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.isActive;return React.createElement(tag,props);};
 const {AppDrawer}=loadTS('components/workspace/app-drawer.tsx',{
  'next/navigation':{usePathname:()=>'/'},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})},
  '@/components/presentation-foundation/drawer-link':{DrawerLink:element('a')},
  '@/components/ui/button':{Button:element('button')},
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div'),SidebarTrigger:element('button'),useSidebar:()=>({setOpenMobile:()=>{}})},
 },new Map());
 const chosen=[];
 const props={account:{initial:'H',title:'Personal account',detail:'me@example.com'},overdueCount:0,signOutLabel:'Sign out',onSignOut:()=>{},onWorkspace:id=>chosen.push(id)};
 assert.ok(!renderToStaticMarkup(React.createElement(AppDrawer,{...props,workspaces:[{id:me,label:'My finances'}],workspace:me})).includes('workspace-switch'));
 const html=renderToStaticMarkup(React.createElement(AppDrawer,{...props,workspaces:[{id:me,label:'My finances'},{id:owner,label:'Household of Alex'}],workspace:owner}));
 assert.match(html,/<div class="segmented workspace-switch" role="group" aria-label="Workspace"><button type="button" aria-pressed="false">My finances<\/button><button type="button" aria-pressed="true">Household of Alex<\/button><\/div>/);
 // The switch sits with the account, above the person's own line.
 assert.match(html,/<footer[^>]*>.*workspace-switch.*class="user-line"/s);
});

test('the shell, top bar and screens show sharing only where it applies',()=>{
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8');
 assert.doesNotMatch(shell,/workspace-privacy-footer|Private records/,'no text under the pages');
 const top=fs.readFileSync('components/workspace/top-bar.tsx','utf8');
 assert.doesNotMatch(top,/topbar-household|Household of \{name\}/,'the open household shows in the drawer only');
 assert.match(top,/\{!readOnly && section === 'Income & expenses' && <Button size="sm" className="quick-expense"/);
 const transactions=fs.readFileSync('components/workspace/screens/transactions-screen.tsx','utf8');
 // Owner filters and pickers appear only in a shared household.
 assert.match(transactions,/const owners = homes && sharedWorkspace\(homes\) \? ownerChoices\(/);
 assert.match(transactions,/\{owners\.length > 0 && <OwnerFilter owners=\{owners\} value=\{ownerFilter\} onChange=\{setOwnerFilter\}\/>\}/);
 assert.match(transactions,/\{owners\.length > 0 && <OwnerPicker record=\{record\}/);
 const accountsPage=fs.readFileSync('components/planning/accounts-page.tsx','utf8');
 assert.match(accountsPage,/\{owners\.length>0&&<Button variant="outline" disabled=\{readOnly\} onClick=\{\(\)=>setEditingOwners\(true\)\}>/);
 assert.match(fs.readFileSync('components/planning/accounts/accounts-overview.tsx','utf8'),/\{owners\.length>0&&<OwnerFilter owners=\{owners\} value=\{ownerFilter\} onChange=\{setOwnerFilter\}\/>\}/);
 assert.match(fs.readFileSync('components/reports/report-filters.tsx','utf8'),/owners\.length > 0 && <OwnerFilter owners=\{owners\}/);
 const settings=fs.readFileSync('components/settings-layout.tsx','utf8');
 // "Household" alone reads as household spending in several languages (Russian "Домашние расходы"); the tab names the sharing.
 assert.match(settings,/\{id:'household',label:'Household sharing'\}/);
 const panel=fs.readFileSync('components/household-panel.tsx','utf8');
 // The sample household lists its people and offers no invites.
 assert.match(panel,/\{!demo && state && <Button disabled=\{people \+ state\.invites\.length >= householdLimit\}/);
 assert.match(panel,/demo \? <ul className="household-people">\{state\?\.people\.map\(/);
 // The provider refuses to open edit forms for a viewer and skips the daily snapshot write.
 const provider=workspaceSource();
 for(const action of ['addCashFlow','addRecord','addAccountRecord','quickExpense','requestDelete'])assert.match(provider,new RegExp(`const ${action} = [^\\n]*\\n?[^\\n]*editable\\(\\)`),action);
 assert.match(provider,/usePortfolioSnapshots\(demo \? null : user, market, summaryLoaded && !marketLoading && \(household\.state \? !readOnly : !household\.loading\), reload\)/);
});
