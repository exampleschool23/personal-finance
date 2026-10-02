import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const read=file=>fs.readFileSync(file,'utf8');
const imports=source=>[...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
const screens=fs.readdirSync('components/workspace/screens').map(file=>'components/workspace/screens/'+file);
const routes={'page.tsx':'OverviewScreen','assets/page.tsx':'AssetsScreen','income-expenses/page.tsx':'CashFlowScreen','loans-debts/page.tsx':'LoansDebtsScreen','accounts/page.tsx':'AccountsScreen','upcoming/page.tsx':'UpcomingScreen','goals/page.tsx':'GoalsScreen','budget/page.tsx':'BudgetScreen','transactions/page.tsx':'TransactionsScreen','assistant/page.tsx':'AssistantScreen','recently-deleted/page.tsx':'RecentlyDeletedScreen','settings/page.tsx':'SettingsScreen'};

test('the drawer depends on routes and its own props, never on a screen or the workspace state',()=>{
 const drawer=imports(read('components/workspace/app-drawer.tsx'));
 assert.ok(drawer.includes('@/components/workspace/navigation'));
 for(const name of drawer)assert.ok(!/workspace-provider|\/screens\/|records-table|screen-notices/.test(name),name);
});

test('each route renders exactly its own screen inside the shared layout',()=>{
 assert.equal(screens.length,Object.keys(routes).length);
 for(const [route,screen] of Object.entries(routes)){
  const source=read('app/(workspace)/'+route);
  assert.match(source,new RegExp(`return <${screen} />;`),route);
  assert.equal(imports(source).length,1,route);
  assert.ok(!/Sidebar|AppDrawer|TopBar/.test(source),route);
 }
 const layout=read('app/(workspace)/layout.tsx');
 assert.match(layout,/<Workspace>\{children\}<\/Workspace>/);
});

test('screens contain only their own page and leave the drawer, top bar and dialogs to the shell',()=>{
 for(const file of screens){
  const source=read(file);
  assert.match(source,/<div data-page="[^"]+" className="content[^"]*">/,file);
  for(const name of imports(source))assert.ok(!/app-drawer|top-bar|workspace-shell|workspace-dialogs|ui\/sidebar|\/screens\//.test(name),`${file}: ${name}`);
  assert.ok(!/usePathname|useRouter/.test(source),file);
 }
 const shell=read('components/workspace/workspace-shell.tsx');
 for(const part of ['<AppDrawer ','<TopBar ','<WorkspaceDialogs/>'])assert.equal(shell.split(part).length,2,part);
 // Until a tapped destination's route arrives, its skeleton stands in for the routed screen.
 assert.match(shell,/<TopBar pendingSection=\{destination && sectionFor\(destination\)\}\/>\s*\{destination \? <PageSkeleton .*?\/> : children\}\s*<footer/);
 for(const name of imports(shell))assert.ok(!name.includes('/screens/'),name);
});

test('every destination has a unique path and unknown paths open Overview',()=>{
 const {sections,sectionFor,sectionLabel}=loadTS('components/workspace/navigation.ts');
 assert.equal(new Set(sections.map(section=>section.path)).size,sections.length);
 assert.equal(new Set(sections.map(section=>section.name)).size,sections.length);
 assert.deepEqual([...new Set(sections.map(section=>section.group))],['WORKSPACE','Manage','Account']);
 // Monarch's drawer: short words in its order; the section names stay as identifiers.
 assert.deepEqual(sections.map(section=>section.label),['Dashboard','Accounts','Transactions','Cash flow','Budget','Recurring','Investments','Loans & debts','Goals','Assistant','Recently deleted','Settings']);
 assert.equal(sectionLabel('Upcoming payments'),'Recurring');assert.equal(sectionLabel('Unknown'),'Unknown');
 assert.equal(sectionFor('/goals'),'Savings goals');
 assert.equal(sectionFor('/income-expenses'),'Income & expenses');
 assert.equal(sectionFor('/missing'),'Overview');
 for(const section of sections)assert.ok(fs.existsSync('app/(workspace)'+(section.path==='/'?'':section.path)+'/page.tsx'),section.path);
});

test('the drawer marks the current route, shows overdue payments and signs out through its prop',()=>{
 const sheet=[];
 let path='/upcoming',signedOut=0;
 // Stand-ins for the sidebar kit: plain elements that drop the kit-only props.
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.isActive;return React.createElement(tag,props);};
 const {AppDrawer}=loadTS('components/workspace/app-drawer.tsx',{
  'next/navigation':{usePathname:()=>path},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})},
  '@/components/presentation-foundation/drawer-link':{DrawerLink:element('a')},
  '@/components/ui/button':{Button:element('button')},
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div'),useSidebar:()=>({setOpenMobile:open=>sheet.push(open)})},
 });
 const props={account:{initial:'H',title:'Personal account',detail:'owner@example.com'},overdueCount:1234,signOutLabel:'Sign out',onSignOut:()=>{signedOut++;}};
 const html=renderToStaticMarkup(React.createElement(AppDrawer,props));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/href="\/upcoming" aria-current="page"[^>]*>.*?Recurring<\/span><span class="count">1,234<\/span>/);
 assert.match(html,/owner@example\.com/);
 assert.match(html,/aria-label="Sign out"/);
 // Recently deleted sits at the foot just above the account, and the account opens Settings.
 assert.match(html,/<footer[^>]*>.*href="\/recently-deleted".*href="\/settings"[^>]*>.*owner@example\.com.*aria-label="Sign out"/s);
 assert.ok(!/<span>Settings<\/span>/.test(html));
 path='/settings';
 assert.match(renderToStaticMarkup(React.createElement(AppDrawer,props)),/href="\/settings" class="user-link" data-active="true" aria-current="page"/);
 path='/';
 const calm=renderToStaticMarkup(React.createElement(AppDrawer,{...props,overdueCount:0}));
 assert.match(calm,/href="\/" aria-current="page"/);
 assert.ok(!calm.includes('class="count"'));
 assert.equal(signedOut,0);
});

test('a drawer tap highlights and shows its destination before the route arrives',()=>{
 const {pendingDestination}=loadTS('components/workspace/navigation.ts');
 assert.equal(pendingDestination(null,'/'),null);
 assert.equal(pendingDestination({from:'/',to:'/goals'},'/'),'/goals');
 // Arrived, or the route changed some other way (back button, another link): nothing is pending.
 assert.equal(pendingDestination({from:'/',to:'/goals'},'/goals'),null);
 assert.equal(pendingDestination({from:'/',to:'/goals'},'/assets'),null);

 const navigated=[],sheet=[];
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.isActive;return React.createElement(tag,props);};
 const {AppDrawer}=loadTS('components/workspace/app-drawer.tsx',{
  'next/navigation':{usePathname:()=>'/'},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})},
  '@/components/presentation-foundation/drawer-link':{DrawerLink:element('a')},
  '@/components/ui/button':{Button:element('button')},
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div'),useSidebar:()=>({setOpenMobile:open=>sheet.push(open)})},
 },new Map());
 const props={account:{initial:'H',title:'Personal account',detail:'owner@example.com'},overdueCount:0,signOutLabel:'Sign out',onSignOut:()=>{},onNavigate:path=>navigated.push(path)};
 const html=renderToStaticMarkup(React.createElement(AppDrawer,{...props,pendingPath:'/goals'}));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/href="\/goals" aria-current="page"/);

 const links=[];
 const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.forEach(walk);if(typeof node.type==='function'&&node.type.name!=='Element'){walk(node.type(node.props));return;}if(node.props?.href)links.push(node);walk(node.props?.children);};
 walk(AppDrawer(props));
 const link=path=>links.find(item=>item.props.href===path);
 const click=(path,extra={})=>link(path).props.onClick({button:0,shiftKey:false,metaKey:false,ctrlKey:false,altKey:false,defaultPrevented:false,...extra});
 click('/goals');
 for(const modifier of [{shiftKey:true},{metaKey:true},{ctrlKey:true},{altKey:true},{button:1},{defaultPrevented:true}])click('/assets',modifier);
 click('/');
 assert.deepEqual(navigated,['/goals']);
 // Every plain tap closes the phone drawer, including one on the current page; modified clicks leave it.
 assert.deepEqual(sheet,[false,false]);
});

test('the logo in the drawer goes to the main page, closing the phone drawer and showing Overview at once',()=>{
 const navigated=[],sheet=[];
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.isActive;return React.createElement(tag,props);};
 const {AppDrawer}=loadTS('components/workspace/app-drawer.tsx',{
  'next/navigation':{usePathname:()=>'/goals'},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})},
  '@/components/presentation-foundation/drawer-link':{DrawerLink:element('a')},
  '@/components/ui/button':{Button:element('button')},
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div'),useSidebar:()=>({setOpenMobile:open=>sheet.push(open)})},
 },new Map());
 const props={account:{initial:'H',title:'Personal account',detail:'owner@example.com'},overdueCount:0,signOutLabel:'Sign out',onSignOut:()=>{},onNavigate:path=>navigated.push(path)};
 const html=renderToStaticMarkup(React.createElement(AppDrawer,props));
 assert.match(html,/<a href="\/" class="brand">/);
 const logos=[];
 const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.forEach(walk);if(typeof node.type==='function'&&node.type.name!=='Element'){walk(node.type(node.props));return;}if(node.props?.className==='brand')logos.push(node);walk(node.props?.children);};
 walk(AppDrawer(props));
 assert.equal(logos.length,1);
 const tap=(extra={})=>logos[0].props.onClick({button:0,shiftKey:false,metaKey:false,ctrlKey:false,altKey:false,defaultPrevented:false,...extra});
 tap();tap({metaKey:true});
 assert.deepEqual(navigated,['/']);
 assert.deepEqual(sheet,[false]);
});

test('no screen offers a language selector: language is chosen in onboarding or Settings',()=>{
 for(const file of ['app/auth/access/page.tsx','app/auth/confirm/page.tsx','components/workspace/top-bar.tsx','components/workspace/workspace-shell.tsx'])assert.ok(!read(file).includes('LanguageSelector'),file);
 assert.ok(!read('components/language-provider.tsx').includes('LanguageSelector'));
 assert.match(read('components/workspace/top-bar.tsx'),/<DisplayPreferences\/>/);
 const {DisplayPreferences}=loadTS('components/workspace/top-bar.tsx',{
  '@/components/language-provider':{useLanguage:()=>({t:text=>text,locale:'en-US'})},
  '@/components/workspace/workspace-provider':{useWorkspace:()=>({})},
  '@/components/theme-provider':{ThemeToggle:()=>React.createElement('button',{className:'theme'})},
  'lucide-react':{ChevronDown:()=>null,Plus:()=>null,RefreshCw:()=>null},
  '@/components/presentation-foundation/segmented':{Segmented:()=>null},
  '@/components/ui/button':{Button:()=>null},
  '@/components/ui/popover':{Popover:()=>null,PopoverContent:()=>null,PopoverTrigger:()=>null},
  '@/components/ui/sidebar':{SidebarTrigger:()=>null},
 });
 assert.match(renderToStaticMarkup(React.createElement(DisplayPreferences,{})),/^<div class="preferences"><button class="theme"><\/button><\/div>$/);
});

test('watchlist and goal forms let the user pick any preferred currency',()=>{
 for(const file of ['components/spending-watchlists.tsx','components/planning/goals-page.tsx']){
  const source=read(file);
  assert.match(source,/<CurrencySelect /,file);
  assert.ok(!source.includes('<CurrencyValue'),file);
 }
 assert.match(read('components/workspace/screens/cash-flow-screen.tsx'),/<SpendingWatchlists [^>]*currencies=\{preferencesData\.currencies\}/);
});
