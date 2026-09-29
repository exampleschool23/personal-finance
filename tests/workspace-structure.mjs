import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const read=file=>fs.readFileSync(file,'utf8');
const imports=source=>[...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
const screens=fs.readdirSync('components/workspace/screens').map(file=>'components/workspace/screens/'+file);
const routes={'page.tsx':'OverviewScreen','assets/page.tsx':'AssetsScreen','income-expenses/page.tsx':'CashFlowScreen','loans-debts/page.tsx':'LoansDebtsScreen','accounts/page.tsx':'AccountsScreen','upcoming/page.tsx':'UpcomingScreen','goals/page.tsx':'GoalsScreen','recently-deleted/page.tsx':'RecentlyDeletedScreen','settings/page.tsx':'SettingsScreen'};

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
 for(const part of ['<AppDrawer ','<TopBar/>','<WorkspaceDialogs/>'])assert.equal(shell.split(part).length,2,part);
 assert.match(shell,/<TopBar\/>\s*\{children\}\s*<footer/);
 for(const name of imports(shell))assert.ok(!name.includes('/screens/'),name);
});

test('every destination has a unique path and unknown paths open Overview',()=>{
 const {sections,sectionFor,navigationGroups}=loadTS('components/workspace/navigation.ts');
 assert.equal(new Set(sections.map(section=>section.path)).size,sections.length);
 assert.equal(new Set(sections.map(section=>section.name)).size,sections.length);
 assert.deepEqual(navigationGroups,['WORKSPACE','Money','Planning','Manage']);
 assert.equal(sectionFor('/goals'),'Savings goals');
 assert.equal(sectionFor('/income-expenses'),'Income & expenses');
 assert.equal(sectionFor('/missing'),'Overview');
 for(const section of sections)assert.ok(fs.existsSync('app/(workspace)'+(section.path==='/'?'':section.path)+'/page.tsx'),section.path);
});

test('the drawer marks the current route, shows overdue payments and signs out through its prop',()=>{
 let path='/upcoming',signedOut=0;
 // Stand-ins for the sidebar kit: plain elements that drop the kit-only props.
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.isActive;return React.createElement(tag,props);};
 const {AppDrawer}=loadTS('components/workspace/app-drawer.tsx',{
  'next/navigation':{usePathname:()=>path},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})},
  '@/components/drawer-link':{DrawerLink:element('a')},
  '@/components/ui/button':{Button:element('button')},
  '@/components/ui/sidebar':{Sidebar:element('aside'),SidebarContent:element('div'),SidebarFooter:element('footer'),SidebarHeader:element('header'),SidebarMenu:element('ul'),SidebarMenuItem:element('li'),SidebarMenuButton:element('div')},
 });
 const props={account:{initial:'H',title:'Personal account',detail:'owner@example.com'},overdueCount:1234,signOutLabel:'Sign out',onSignOut:()=>{signedOut++;}};
 const html=renderToStaticMarkup(React.createElement(AppDrawer,props));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/href="\/upcoming" aria-current="page"[^>]*>.*?Upcoming payments<\/span><span class="count">1,234<\/span>/);
 assert.match(html,/owner@example\.com/);
 assert.match(html,/aria-label="Sign out"/);
 path='/';
 const calm=renderToStaticMarkup(React.createElement(AppDrawer,{...props,overdueCount:0}));
 assert.match(calm,/href="\/" aria-current="page"/);
 assert.ok(!calm.includes('class="count"'));
 assert.equal(signedOut,0);
});
