import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const household=loadTS('lib/household.ts');
const me='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const jar=(values={})=>{const store=new Map(Object.entries(values)),writes=[],deleted=[];return {store,writes,deleted,get:name=>store.has(name)?{value:store.get(name)}:undefined,set:(name,value,options)=>{writes.push({name,value,options});store.set(name,value);},delete:name=>{deleted.push(name);store.delete(name);}};};
const headerOf=init=>new Headers(init?.headers).get('x-workspace-owner');

test('household helpers: who paid, the Mine / Partner / Ours filter, initials and invite links',()=>{
 const {matchesMember,recordMember,initials,inviteLink,inviteToken,workspaceId,workspaceOwner,sharedWorkspace,canEdit,personalRequest,knownHouseholdMessage}=household;
 // Records from before households belong to the workspace owner.
 assert.equal(recordMember({},owner),owner);assert.equal(recordMember({member_id:me},owner),me);
 const records=[{id:'a',member_id:me},{id:'b',member_id:owner},{id:'c'},{id:'d',member_id:null}];
 assert.deepEqual(records.filter(record=>matchesMember(record,'mine',me,owner)).map(record=>record.id),['a']);
 assert.deepEqual(records.filter(record=>matchesMember(record,'partner',me,owner)).map(record=>record.id),['b','c','d']);
 assert.equal(records.filter(record=>matchesMember(record,'all',me,owner)).length,4);
 // In your own workspace, unattributed records are yours.
 assert.deepEqual(records.filter(record=>matchesMember(record,'mine',owner,owner)).map(record=>record.id),['b','c','d']);
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
  if(name==='set_transaction_member')return Response.json(2);
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
 // Who paid is set in the open workspace.
 api=householdApi({cookie:owner});
 body=await (await api.post('attribute',{ids:[other],member:me})).json();
 assert.equal(body.changed,2);assert.deepEqual(api.calls.at(-1),{name:'set_transaction_member',body:{p_ids:[other],p_member:me},workspace:owner,token:'token'});
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
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div'),useSidebar:()=>({setOpenMobile:()=>{}})},
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
 assert.match(shell,/shared \? t\("Shared records · Visible to your household\."\) : t\("Private records · Only visible to your account\."\)/);
 const top=fs.readFileSync('components/workspace/top-bar.tsx','utf8');
 assert.match(top,/\{!readOnly && <Button size="sm" className="quick-expense"/);
 const transactions=fs.readFileSync('components/workspace/screens/transactions-screen.tsx','utf8');
 assert.match(transactions,/\{shared && <Segmented label=\{t\('Who'\)\} options=\{\[\{ value: 'mine', label: t\('Mine'\) \}, \{ value: 'partner', label: t\('Partner'\) \}, \{ value: 'all', label: t\('Ours'\) \}\]/);
 const settings=fs.readFileSync('components/settings-layout.tsx','utf8');
 assert.match(settings,/\{id:'household',label:'Household sharing',icon:Users\}/);
 const panel=fs.readFileSync('components/household-panel.tsx','utf8');
 assert.match(panel,/demo \? <EmptyState icon=\{<Users\/>\} description=\{t\('Sharing is not available in the sample workspace\.'\)\}\/>/);
 // The provider refuses to open edit forms for a viewer and skips the daily snapshot write.
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 for(const action of ['addCashFlow','addRecord','addAccountRecord','quickExpense','requestDelete'])assert.match(provider,new RegExp(`const ${action} = [^\\n]*\\n?[^\\n]*editable\\(\\)`),action);
 assert.match(provider,/usePortfolioSnapshots\(demo \? null : user, market, summaryLoaded && !marketLoading && \(household\.state \? !readOnly : !household\.loading\), reload\)/);
});
