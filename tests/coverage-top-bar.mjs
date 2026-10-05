import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,text,host} from './helpers/component-tree.mjs';

// A minimal DOM: elements with classes, a measured width and children, matched by class and descendant selectors.
function el(selector,{width=0,scrollWidth=0,children=[]}={}){
 const [tag,...classes]=selector.split('.');
 const node={tag:tag||'div',classes,children,getBoundingClientRect:()=>({width}),scrollWidth};
 for(const child of children)child.parent=node;
 const one=part=>part.startsWith('.')?part.slice(1).split('.').every(name=>node.classes.includes(name)):node.tag===part;
 node.matchesPart=one;
 node.matches=list=>list.split(',').some(part=>one(part.trim()));
 node.querySelector=query=>{
  const parts=query.trim().split(/\s+/);
  const within=(root,index)=>{for(const child of root.children){if(child.matchesPart(parts[index])){if(index===parts.length-1)return child;const deeper=within(child,index+1);if(deeper)return deeper;}const found=within(child,index);if(found)return found;}return null;};
  return within(node,0);
 };
 return node;
}

function setup({roomy=true,workspace={},sidebar={state:'expanded',isMobile:false},slot={titleRef:{current:null},actionsRef:{current:null}},bar=null,page=null}={}){
 const listeners=[],observers=[];
 const documentRoot=el('html',{children:page?[el('.workspace',{children:[page]})]:[]});
 globalThis.window={matchMedia:query=>({matches:roomy,media:query,addEventListener:(type,callback)=>listeners.push({type,callback}),removeEventListener:(type,callback)=>{const index=listeners.findIndex(item=>item.callback===callback);if(index>=0)listeners.splice(index,1);}})};
 globalThis.document={title:'',querySelector:query=>documentRoot.querySelector(query)};
 globalThis.getComputedStyle=node=>({paddingInlineStart:String(node.padding??0)+'px',paddingInlineEnd:String(node.padding??0)+'px'});
 const observer=kind=>class{constructor(callback){this.callback=callback;this.kind=kind;this.observed=[];this.connected=true;observers.push(this);}observe(node,options){this.observed.push({node,options});}disconnect(){this.connected=false;}};
 globalThis.ResizeObserver=observer('resize');globalThis.MutationObserver=observer('mutation');
 const renderer=createRenderer({attach:element=>element.type==='header'?bar:null});
 const changes=[],quick=[];
 const state={section:'Overview',currency:'USD',setCurrency:code=>changes.push(code),preferencesData:{currencies:['USD']},quickExpense:()=>quick.push(1),readOnly:false,...workspace};
 const loaded=renderer.load('components/workspace/top-bar.tsx',{
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:message=>message})},
  '@/components/theme-provider':{ThemeToggle:host('theme-toggle')},
  '@/components/presentation-foundation/segmented':{Segmented:host('segmented')},
  '@/components/presentation-foundation/top-bar-slot':{useTopBarSlot:()=>slot},
  '@/components/ui/button':{Button:host('button')},
  '@/components/ui/sidebar':{SidebarTrigger:host('sidebar-trigger'),useSidebar:()=>sidebar},
  '@/components/workspace/workspace-provider':{useWorkspace:()=>state},
 });
 let props={};
 const view={loaded,listeners,observers,changes,quick,renderer,find:renderer.find,all:renderer.all,
  render:(next=props)=>(props=next,view.tree=renderer.render(renderer.react.createElement(loaded.TopBar,props))),
  pageActions:()=>view.all(node=>node.props.className==='topbar-page-actions'),
  fire:kind=>{for(const item of observers.filter(entry=>entry.kind===kind&&entry.connected))item.callback();return view.render();},
 };
 view.render();
 return view;
}

/** A bar whose measured needs are the drawer toggle, the page title and the bar's own controls (fixed widths). */
function measuredBar({clientWidth=1000,padding=16,title=200,tabs=null,actions=null}={}){
 const pageActions=el('div.topbar-page-actions',{children:actions?[el('.entry-actions',{children:actions.map(width=>el('button',{width}))})]:[]});
 const location=el('div.topbar-location',{children:[el('button.drawer-toggle',{width:36}),el('div.topbar-page-title',{children:[el('h1',{scrollWidth:title}),...(tabs?[el('.page-tabs',{children:tabs.map(width=>el('button',{width}))})]:[])]}),el('span.topbar-title',{width:80})]});
 const own=el('div.topbar-actions',{children:[pageActions,el('div.segmented',{width:100}),el('div.preferences',{width:40})]});
 const node=el('header.topbar',{children:[location,own]});
 node.clientWidth=clientWidth;node.padding=padding;
 return node;
}

test('the bar names the section, sets the browser tab title and shows only the controls that apply',()=>{
 const view=setup({roomy:false});
 assert.equal(document.title,'Dashboard · Hoggish Finance');
 assert.equal(text(view.find(node=>node.props.className==='topbar-title')),'Dashboard');
 assert.equal(view.all(node=>node.type==='sidebar-trigger').length,0,'the open drawer has its own button');
 assert.equal(view.all(node=>node.type==='segmented').length,0,'one currency has nothing to switch');
 assert.equal(view.all(node=>node.type==='button').length,0,'no quick expense outside Cash flow');
 assert.equal(view.pageActions().length,0,'narrow windows keep page actions on the page');
 assert.equal(view.observers.length,0,'nothing is measured on narrow windows');
 assert.equal(view.all(node=>node.type==='theme-toggle').length,1);
 assert.equal(view.listeners.length,1,'the media query is watched');
 view.renderer.unmount();
 assert.equal(view.listeners.length,0);
});

test('the drawer button, currency switch and quick expense follow the workspace state',()=>{
 for(const sidebar of [{state:'collapsed',isMobile:false},{state:'expanded',isMobile:true}]){
  const view=setup({sidebar,roomy:false});
  const trigger=view.find(node=>node.type==='sidebar-trigger');
  assert.equal(trigger.props['aria-label'],'Toggle Sidebar');
 }
 const view=setup({roomy:false,workspace:{section:'Income & expenses',preferencesData:{currencies:['EUR','USD']},currency:'EUR'}});
 assert.equal(document.title,'Cash flow · Hoggish Finance');
 const currency=view.find(node=>node.type==='segmented');
 assert.deepEqual(currency.props.options,[{value:'EUR',label:'EUR'},{value:'USD',label:'USD'}]);
 assert.equal(currency.props.value,'EUR');assert.equal(currency.props.label,'Display currency');
 currency.props.onChange('USD');assert.deepEqual(view.changes,['USD']);
 const add=view.find(node=>node.type==='button');
 assert.equal(add.props['aria-label'],'Add expense');assert.match(text(add),/Add expense/);
 add.props.onClick();assert.equal(view.quick.length,1);
 // A pending destination names the bar while its route loads; the tab title keeps the open page.
 view.render({pendingSection:'Budget'});
 assert.equal(text(view.find(node=>node.props.className==='topbar-title')),'Budget');
 assert.equal(view.all(node=>node.type==='button').length,0);
 assert.equal(document.title,'Cash flow · Hoggish Finance');
 const viewer=setup({roomy:false,workspace:{section:'Income & expenses',readOnly:true}});
 assert.equal(viewer.all(node=>node.type==='button').length,0,'viewers cannot add');
});

test('without a slot the bar still renders, and a wide window without a measured node does not observe',()=>{
 const view=setup({slot:null,bar:null});
 assert.equal(view.pageActions().length,1,'wide windows offer page actions room');
 assert.equal(view.pageActions()[0].props.ref,undefined);
 assert.equal(view.observers.length,0);
});

test('page tabs and actions join the bar while they fit and leave it, with slack, when crowded',()=>{
 // Needs: toggle 36 + 12 + title 200 + tabs 22 + (100+100+8) + 12 + actions (120 + 21) + own (100+40+8) = 779.
 const node=measuredBar({clientWidth:900,padding:16,tabs:[100,100],actions:[120]});
 const slot={titleRef:{current:null},actionsRef:{current:null}};
 const view=setup({bar:node,slot});
 assert.equal(view.pageActions().length,1);
 assert.equal(view.pageActions()[0].props.ref,slot.actionsRef);
 assert.equal(view.find(node=>node.props.className==='topbar-page-title').props.ref,slot.titleRef);
 const resize=view.observers.find(item=>item.kind==='resize'),mutation=view.observers.find(item=>item.kind==='mutation');
 assert.equal(resize.observed[0].node,node);
 assert.deepEqual(mutation.observed[0],{node,options:{childList:true,subtree:true}});
 // Room is 868: crowded once the bar needs more.
 node.clientWidth=800;view.fire('resize');
 assert.equal(view.pageActions().length,0,'779 needed with 768 room');
 // Once crowded it needs 8px of slack before coming back.
 node.clientWidth=815;view.fire('resize');
 assert.equal(view.pageActions().length,0,'779 + 8 > 783');
 node.clientWidth=820;view.fire('mutation');
 assert.equal(view.pageActions().length,1,'779 + 8 <= 788');
 view.renderer.unmount();
 assert.ok(view.observers.every(item=>!item.connected),'observers stop on unmount');
});

test('tabs and actions still opening the page count toward the width the bar needs',()=>{
 // Page heading holds tabs (2 x 150) and actions (2 x 60): 36 + 12 + 300 + 22 + 308 + 12 + 149 + 148 = 987.
 const page=el('div.page-heading-actions',{children:[el('.page-tabs',{children:[el('button',{width:150}),el('button',{width:150})]}),el('.entry-actions',{children:[el('button',{width:60}),el('button',{width:60})]})]});
 const node=measuredBar({clientWidth:1020,padding:16,title:300});
 let view=setup({bar:node,page});
 assert.equal(view.pageActions().length,1,'987 fits 988');
 const tight=measuredBar({clientWidth:1010,padding:16,title:300});
 view=setup({bar:tight,page});
 assert.equal(view.pageActions().length,0,'987 does not fit 978');
});

test('a bare bar with no title, tabs, actions or extras only needs its own controls',()=>{
 const own=el('div.topbar-actions',{children:[el('div.preferences',{width:40})]});
 const node=el('header.topbar',{children:[el('div.topbar-location',{children:[]}),own]});
 node.clientWidth=52;node.padding=0;
 // 12 for the gap before actions + 40 = 52.
 let view=setup({bar:node});
 assert.equal(view.pageActions().length,1);
 node.clientWidth=51;view.fire('resize');
 assert.equal(view.pageActions().length,0);
 const empty=el('header.topbar',{children:[]});empty.clientWidth=12;
 view=setup({bar:empty});
 assert.equal(view.pageActions().length,1,'a bar without location or own controls needs only the 12px gap');
});

test('DisplayPreferences offers only the theme switch',()=>{
 const view=setup({roomy:false});
 const [component]=view.renderer.render(view.renderer.react.createElement(view.loaded.DisplayPreferences,{}));
 assert.equal(component.type,view.loaded.DisplayPreferences);
 assert.equal(component.children.length,1);
 const [preferences]=component.children;
 assert.equal(preferences.props.className,'preferences');
 assert.equal(preferences.children[0].type,'theme-toggle');
});

test('the server render assumes a narrow window, so page actions wait for the browser',async()=>{
 const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
 const {TopBar}=loadTS('components/workspace/top-bar.tsx',{
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:message=>message})},
  '@/components/theme-provider':{ThemeToggle:host('theme-toggle')},
  '@/components/presentation-foundation/segmented':{Segmented:host('segmented')},
  '@/components/presentation-foundation/top-bar-slot':{useTopBarSlot:()=>null},
  '@/components/ui/button':{Button:host('button')},
  '@/components/ui/sidebar':{SidebarTrigger:host('sidebar-trigger'),useSidebar:()=>({state:'collapsed',isMobile:false})},
  '@/components/workspace/workspace-provider':{useWorkspace:()=>({section:'Accounts',currency:'USD',setCurrency:()=>{},preferencesData:{currencies:['USD']},quickExpense:()=>{},readOnly:false})},
 });
 const html=renderToStaticMarkup(React.createElement(TopBar,{}));
 assert.doesNotMatch(html,/topbar-page-actions/);
 assert.match(html,/<span class="topbar-title">Accounts<\/span>/);
 assert.match(html,/<sidebar-trigger class="drawer-toggle" aria-label="Toggle Sidebar"><svg/);
});
