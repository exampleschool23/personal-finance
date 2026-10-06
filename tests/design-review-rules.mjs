import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

// Rules from the 5 October 2026 design review (.claude/skills/dr/references/cases.md).

const channel=value=>{value/=255;return value<=.03928?value/12.92:((value+.055)/1.055)**2.4};
const luminance=([r,g,b])=>.2126*channel(r)+.7152*channel(g)+.0722*channel(b);
const hslToRgb=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l);return [0,8,4].map(n=>255*(l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1))));};
const hex=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};

test('business marks keep their initial readable on every palette colour (COMP-019)',()=>{
 const {paletteColors,paletteColor,paletteInk}=loadTS('lib/business.ts');
 const css=fs.readFileSync('app/styles/foundation.css','utf8');
 const ink={light:hex(css.match(/--on-palette-light: (#[0-9a-f]{3,6})/)[1].replace(/^#(\w)(\w)(\w)$/,'#$1$1$2$2$3$3')),dark:hex(css.match(/--on-palette-dark: (#[0-9a-f]{6})/)[1])};
 for(const color of paletteColors){
  const [h,s,l]=paletteColor(color).match(/[\d.]+/g).map(Number);
  const ratio=contrast(hslToRgb(h,s,l),ink[paletteInk(color)]);
  assert.ok(ratio>=4.5,`${color}: ${ratio.toFixed(2)}`);
 }
 assert.equal(paletteInk('teal'),'dark');assert.equal(paletteInk('indigo'),'light');assert.equal(paletteInk('unknown'),paletteInk('slate'));
 const mark=renderToStaticMarkup(React.createElement(loadTS('components/presentation-foundation/business-mark.tsx').BusinessMark,{name:'amber co',color:'amber'}));
 assert.match(mark,/data-ink="dark"/);assert.match(mark,/>A</);
 assert.doesNotMatch(fs.readFileSync('app/styles/goal-setup-business.css','utf8'),/\.business-mark\{[^}]*color:#fff/);
});

test('a dialog opened from state returns focus to whatever opened it (DLG-018, DLG-020)',()=>{
 const focused=[];
 const element=(name,extra={})=>Object.assign(Object.create(globalThis.HTMLElement.prototype),{isConnected:true,focus:()=>focused.push(name),closest:()=>null},extra);
 const previous=globalThis.document,previousElement=globalThis.HTMLElement;
 globalThis.HTMLElement=function HTMLElement(){};
 const opener=element('opener');
 globalThis.document={activeElement:opener,body:{},getElementById:()=>null};
 try{
  const {useReturnFocus}=loadTS('components/ui/return-focus.ts',{react:{...React,useState:initial=>[typeof initial==='function'?initial():initial],useRef:current=>({current})}});
  const event=()=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
  const first=event();useReturnFocus().onCloseAutoFocus(first);
  assert.deepEqual(focused,['opener']);assert.ok(first.defaultPrevented,'Radix does not then move focus elsewhere');
  // A dialog that handles focus itself keeps that choice.
  useReturnFocus(event=>event.preventDefault()).onCloseAutoFocus(event());
  assert.deepEqual(focused,['opener']);
  // An opener that has gone is skipped rather than focused.
  opener.isConnected=false;useReturnFocus().onCloseAutoFocus(event());
  assert.deepEqual(focused,['opener']);
  // A dialog that stays mounted while closed (ConfirmDialog) first renders with nothing focused; it reads the opener each time it opens.
  globalThis.document.activeElement=globalThis.document.body;
  const mounted=useReturnFocus();
  // Opened from a menu item (Add transaction › Add expense, a row's ⋯ › Delete): focus goes back to the menu's button.
  const trigger=element('menu button');
  globalThis.document.activeElement=element('menu item',{isConnected:false,closest:selector=>selector==='[role=menu]'?{getAttribute:()=>'radix-trigger'}:null});
  globalThis.document.getElementById=id=>id==='radix-trigger'?trigger:null;
  const opened=[];useReturnFocus(undefined,()=>opened.push(true)).onOpenAutoFocus(event());
  assert.deepEqual(opened,[true],'the dialog\'s own onOpenAutoFocus still runs');
  mounted.onOpenAutoFocus(event());mounted.onCloseAutoFocus(event());
  assert.deepEqual(focused,['opener','menu button']);
 }finally{globalThis.document=previous;globalThis.HTMLElement=previousElement;}
 for(const file of ['components/ui/dialog.tsx','components/ui/alert-dialog.tsx']){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/onOpenAutoFocus=\{returnFocus\.onOpenAutoFocus\}\s+onCloseAutoFocus=\{returnFocus\.onCloseAutoFocus\}/,file);
  assert.match(source,/useReturnFocus\(onCloseAutoFocus, onOpenAutoFocus\)/,file);
 }
});

test('a zero net carries no tone, so it is never green (FMT-014, COMP-018)',()=>{
 const {signTone}=loadTS('components/presentation-foundation/tone.ts');
 assert.equal(signTone(0),undefined);assert.equal(signTone(5),'positive');assert.equal(signTone(-5),'negative');
 const inline=fs.readdirSync('components',{recursive:true}).filter(file=>/\.tsx$/.test(file)).filter(file=>/<\s*0\s*\?\s*'negative'\s*:\s*'positive'/.test(fs.readFileSync('components/'+file,'utf8')));
 assert.deepEqual(inline,[]);
});

test('holdings say "1 unit" and transaction rows name their amount and category',()=>{
 const t=(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key);
 const {unitCount}=loadTS('lib/asset-movements.ts');
 assert.equal(unitCount(t,1,'en-US'),'1 unit');assert.equal(unitCount(t,0.55,'en-US'),'0.55 units');assert.equal(unitCount(t,1200,'en-US'),'1,200 units');
 for(const file of fs.readdirSync('lib/locales')){const locale=JSON.parse(fs.readFileSync('lib/locales/'+file,'utf8'));assert.ok(locale['1 unit'],file);assert.match(locale['1 unit · Gain/loss {amount}'],/\{amount\}/,file);}
 assert.match(fs.readFileSync('components/workspace/records-table.tsx','utf8'),/r\.quantity === 1 \? '1 unit · Gain\/loss \{amount\}'/);
 const {transactionRowLabel}=loadTS('components/transactions/transaction-row.tsx');
 assert.equal(transactionRowLabel('View details for Coffee',{kind:'Living expense',amount:35,currency:'USD',frequency:'Once'},'Groceries','en-US'),'View details for Coffee · −$35 · Groceries');
});

test('right-to-left pages: the served root carries the request direction and styles use logical sides (RTL-004, RTL-010)',()=>{
 const layout=fs.readFileSync('app/layout.tsx','utf8');
 assert.match(layout,/<html lang=\{language\} dir=\{directionOf\(language\)\}/);
 assert.match(layout,/accept-language/);
 for(const folder of ['auth','connect']){
  const {default:PublicLayout}=loadTS(`app/${folder}/layout.tsx`,{'@/components/visitor-hint':{VisitorHint:({children})=>React.createElement('section',{'data-visitor':''},children)}});
  assert.equal(renderToStaticMarkup(React.createElement(PublicLayout,null,'page')),'<section data-visitor="">page</section>');
 }
 for(const file of ['app/terms/page.tsx','app/privacy/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<VisitorHint><LegalPage/);
 const css=stylesheet()+fs.readdirSync('components').filter(file=>file.endsWith('.module.css')).map(file=>fs.readFileSync('components/'+file,'utf8')).join('\n');
 assert.deepEqual(css.match(/(?<![\w-])(margin|padding|border)-(left|right)(?=[\s:-])|text-align:\s*(left|right)\b/g),null);
});

test('public card titles are one h1 at one size, and phone tab strips wrap (HEAD-012, TYPE-008, RESP-021)',()=>{
 for(const file of ['app/connect/telegram/page.tsx','app/auth/telegram/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<h1>\{t\(/,file);
 assert.match(fs.readFileSync('components/sign-in-screen.module.css','utf8'),/\.cardHeading h1\{font-size:var\(--type-display\)/);
 assert.match(fs.readFileSync('components/auth-showcase.tsx','utf8'),/<p className=\{styles\.showcaseTitle\}>/);
 const css=stylesheet();
 assert.match(css,/\.auth-page \.panel :is\(h1,h2\)\{font-family:var\(--font-display\);font-size:var\(--type-display\)/);
 assert.match(css,/@container content \(max-width:520px\)\{[^\n]*\.segmented\.page-tabs\{flex-wrap:wrap/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.user-link,\.info-hint,\.account-group>summary>svg,\.account-list-row,\.goal-setup-progress>span,\.goal-template\{transition:none\}/);
});

test('every transition and animation is switched off under reduced motion, by the same selector (MOT-001, MOT-005, MOT-008)',()=>{
 // A broader reduce rule (summary::before) loses to a more specific moving rule (summary:not(:has(svg))::before), so selectors must match exactly.
 const moving=new Map(),still=new Set();
 for(const file of fs.readdirSync('app/styles').filter(name=>name.endsWith('.css'))){
  const css=fs.readFileSync('app/styles/'+file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const stack=[];let buffer='';
  for(const ch of css){
   if(ch==='{'){stack.push(buffer.trim());buffer='';continue;}
   if(ch==='}'){const selector=stack.pop(),body=buffer,media=stack.join(' ');buffer='';
    if(selector&&!selector.startsWith('@'))for(const one of selector.split(',').map(part=>part.trim().replace(/\s+/g,' '))){
     if(/reduced-motion:\s*reduce/.test(media)&&/(?:transition|animation)\s*:\s*none/.test(body))still.add(one);
     else if(/(?:^|;)\s*(?:transition|animation)\s*:\s*(?!none)[^;]+/.test(body)&&!/reduced-motion/.test(media))moving.set(one,file);
    }
    continue;}
   if(ch===';'&&!stack.length)buffer='';else buffer+=ch;
  }
 }
 assert.ok(moving.size>20,'the parser finds the moving rules');
 assert.deepEqual([...moving].filter(([selector])=>!still.has(selector)),[]);
 // The catch-all block sits last in the cascade so it wins over rules in earlier files.
 const order=fs.readFileSync('app/globals.css','utf8').match(/styles\/[\w-]+\.css/g);
 assert.equal(order.at(-1),'styles/dialogs-household.css');
 assert.match(fs.readFileSync('app/styles/dialogs-household.css','utf8'),/@media\(prefers-reduced-motion:reduce\)\{\.sankey-link,\.switch,\.switch-thumb/);
});

test('panel links and business card links keep a 44px touch target (RESP-004, RESP-024)',()=>{
 const css=stylesheet();
 const coarse=css.slice(css.indexOf('@media(pointer:coarse){\n /* One floor'));
 assert.match(coarse,/\.panel-title :is\(a,\[data-variant=link\]\),\.panel-link\{display:inline-flex;align-items:center;min-height:44px\}/,'the same selector as the 24px rule in shell.css, so it wins');
 assert.match(coarse,/\.business-card-list li>a\{min-height:44px/);
});

test('names, chips and filters show their text instead of an ellipsis (LIST-018, LIST-019, RESP-023)',()=>{
 const css=stylesheet();
 // Transactions: the summary moves above the list before the list gets too narrow for owner, category and business chips.
 assert.match(css,/@container content \(max-width:1100px\)\{\.transactions-layout\{grid-template-columns:minmax\(0,1fr\)\}\.transactions-summary\{position:static;order:-1\}\.transactions-summary \.budget-left-summary\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(8rem,1fr\)\)/);
 // Record names and their detail line wrap.
 assert.match(css,/\.record-name strong\{[^}]*white-space:normal;overflow-wrap:break-word\}/);
 assert.match(css,/\.record-name small\{[^}]*white-space:normal;overflow-wrap:break-word\}/);
 // `anywhere` lets a table shrink the name column to one letter wide ("Mortg / age"); a minimum width keeps it readable.
 assert.doesNotMatch(css,/\.record-name[^{]*\{[^}]*overflow-wrap:anywhere/);
 // Record tables keep their columns and scroll sideways when they do not fit, with the name column frozen and at least 13rem wide;
 // no script measures them (that flickered). A phone shows each record as a two-line card.
 assert.doesNotMatch(fs.readFileSync('components/workspace/records-table.tsx','utf8'),/useColumnsFit/);
 assert.match(css,/\.records :is\(th,td\):first-child\{position:sticky;inset-inline-start:0;z-index:1;min-width:13rem;/);
 assert.match(css,/@container content \(max-width:560px\)\{\n \.records table thead/);
 assert.match(css,/\.records table td:first-child\{position:static;flex:1 1 calc\(100% - 10rem\)/,'name and value share the card\'s first line');
 assert.match(css,/\.records table tbody tr::after\{content:"";order:1;flex-basis:100%;height:0\}/,'the category always starts the second line');
 assert.doesNotMatch(css,/\.record-name (?:strong|small)\{[^}]*text-overflow:ellipsis/);
 // Record filters wrap by themselves rather than shrink in four fixed columns.
 assert.match(css,/\.record-filter-options\{min-width:0;display:flex;flex-wrap:wrap/);
 assert.match(css,/\.record-filter-options>label\{flex:1 1 9\.5rem;max-width:16rem\}/);
 assert.doesNotMatch(css,/@media\(max-width:1200px\)\{\.workspace \.content \.records \.record-filters/,'a window-width guess, not the page width');
 // A loan, debt or mortgage leads with Record payment; its tracker waits in the ⋯ menu.
 const table=fs.readFileSync('components/workspace/records-table.tsx','utf8');
 assert.match(table,/trackedKinds\.includes\(r\.kind\) && !paidByPayment\(r\) && <Button/);
 assert.match(table,/trackedKinds\.includes\(r\.kind\) && paidByPayment\(r\) && \{ label: t\('Tracker'\)/);
});

test('budget rows never hide Actual: it moves under the name with its label when the row is narrow (LIST-020)',()=>{
 const css=stylesheet();
 assert.doesNotMatch(css,/\.budget-row>\.budget-cell:nth-child\(3\)\{display:none\}/);
 assert.match(css,/\.budget-row\{display:grid;grid-template-columns:minmax\(9rem,1fr\) repeat\(3,minmax\(92px,128px\)\)/,'the name keeps 9rem before the figures grow');
 assert.doesNotMatch(css,/budget-category-name[^{]*\{[^}]*(?:overflow-wrap:anywhere|text-overflow:ellipsis)/,'names wrap at spaces');
 assert.match(css,/@container content \(max-width:540px\)\{[^\n]*\.budget-row>\.budget-actual\{grid-column:1;grid-row:2;[^}]*text-align:start;white-space:nowrap\}\.budget-row>\.budget-actual::before\{content:attr\(data-label\) " "\}/);
 const rows=fs.readFileSync('components/budget/budget-rows.tsx','utf8');
 assert.equal((rows.match(/className="budget-cell budget-actual" data-label=\{t\('Actual'\)\}/g)||[]).length,3,'group, category and total rows label their Actual');
 // On a phone a record card keeps its actions whole: a table cell width of 1% must not squeeze them into a sliver.
 assert.match(css,/\.records table td:last-child\{order:4;flex:1 0 100%;width:auto;padding:0\}/,'actions on their own line on every card (LIST-022)');
});

test('cards line up on one edge, and summary tables keep their figures together (LIST-021, LIST-023)',()=>{
 const css=stylesheet();
 // The table's 24px first and last cell padding stays out of a record card; the second line starts under the name text.
 assert.match(css,/\.records table td:first-child\{position:static;flex:1 1 calc\(100% - 10rem\);min-width:0;padding:0;/);
 assert.match(css,/\.records table td:nth-child\(2\)\{order:2;display:flex;flex-wrap:wrap;gap:6px;margin-inline-start:56px\}/);
 assert.match(css,/\.records table td:nth-child\(3\)\{order:3;flex:1 1 0;min-width:0;/,'dates wrap beside the category, not back at the card edge');
 // Summary tables (Income this month, Spending plans): name across two lines, figures side by side on the right.
 assert.match(css,/\.stack-table tbody tr\{display:grid;grid-template-columns:minmax\(0,1fr\) auto auto;/);
 assert.match(css,/\.stack-table tbody td:first-child\{grid-row:1\/3;/);
 assert.match(css,/\.stack-table tbody td:nth-child\(n\+3\)\{grid-row:2;/);
 assert.doesNotMatch(css,/\.stack-table tbody td:nth-child\(n\+3\)\{grid-column:1\/-1/,'no figure on a line of its own beside empty space');
});

// Rules from the 6 October 2026 review in 100 viewports (280 to 3840 px, light and dark, English, Arabic and German).
test('pages and dialogs never grow wider than the screen, and fit short screens (RESP-025, DLG-021, DLG-022, RESP-026, RESP-029)',()=>{
 const css=stylesheet(),dialog=fs.readFileSync('components/ui/dialog.tsx','utf8');
 // A grid with an implicit `auto` column grows to its widest child: German category names made Investments 1100px wide in a 1024px window.
 assert.match(css,/\.asset-dashboard\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.segmented\.asset-category-filters\{flex-wrap:wrap;overflow:visible\}/);
 // Every dialog: one column that cannot outgrow it, a height within the screen, and its own scroll (Customize was cut off on phones).
 assert.match(dialog,/grid w-full grid-cols-\[minmax\(0,1fr\)\] max-w-\[calc\(100%-2rem\)\] max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
 assert.match(css,/\.expense-mode-tabs>\[data-slot="tabs-list"\]\{[^}]*height:auto;[^}]*flex-wrap:wrap/,'Plan, Expense and Debt or mortgage wrap at 280px');
 assert.match(fs.readFileSync('components/sign-in-screen.module.css','utf8'),/\.legal\{display:flex;flex-wrap:wrap/,'Terms and Privacy wrap in German at 280px');
 assert.match(fs.readFileSync('components/sign-in-screen.module.css','utf8'),/\.header>:first-child\{min-width:0\}\.header :global\(\.brand small\.block\)\{white-space:normal\}/,'the theme toggle stays on a 280px screen');
 // Record forms and the cash account field: a long option ("Everyday checking · $14,200") or source name never widens the dialog.
 assert.match(css,/\.record-form\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
 assert.match(css,/\.cash-account-field\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
 // Any dialog: a long option or a link label never widens it; the Customize buttons wrap (seen in German at 280–393px).
 assert.match(css,/\[data-slot=dialog-content\] \[data-slot="native-select-wrapper"\]\{width:100%;min-width:0\}/);
 assert.match(css,/\[data-slot=dialog-content\] form :is\(div,label\):not\(\[class\*="min-w-"\]\)\{min-width:0\}/);
 assert.match(css,/\[data-slot=dialog-content\] :is\(\[data-variant=link\],\.panel-link\)\{max-width:100%;height:auto;white-space:normal/);
 assert.match(css,/\.customize-footer\{display:flex;flex-wrap:wrap;/);
 // Net worth and debt sit side by side only while both figures fit (Arabic at 280px cut "202,800 US$").
 assert.match(css,/\.portfolio-summary-metrics\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,11rem\),1fr\)\)/);
 assert.match(fs.readFileSync('components/ui/sidebar.tsx','utf8'),/SIDEBAR_WIDTH_MOBILE = "min\(18rem, 85vw\)"/);
 assert.match(css,/\.goal-setup-steps\{display:flex;flex-wrap:wrap;/,'the add-goal steps wrap so Close stays on screen');
});

test('switches, chips and names show their whole text (SCR-085, LIST-024, LIST-025, LIST-007)',()=>{
 const css=stylesheet();
 assert.match(css,/\.budget-left-tabs\{display:flex;width:100%;flex-wrap:wrap;overflow:visible\}/,'Summary, Income and Expenses never scroll');
 // Account rows wrap by themselves: the balance moves under the name before the name breaks between letters.
 assert.match(css,/\.account-list-row\{display:flex;flex-wrap:wrap;/);
 assert.match(css,/\.account-list-name\{flex:1 1 9rem;min-width:0;font-weight:600;overflow-wrap:break-word\}/);
 assert.match(css,/\.account-group>summary\{display:flex;flex-wrap:wrap;/);
 // Transaction chips keep their equal columns, and a long name wraps inside its column.
 for(const chip of ['.transaction-category>span:last-child','.transaction-business>span:last-child','.report-transaction-list>li>*>span:nth-child(2)>*']){
  const rule=css.match(new RegExp(chip.replace(/[.*+?^${}()|[\]\\>]/g,'\\$&')+'\\{([^}]*)\\}'))?.[1];
  assert.ok(rule,chip);assert.doesNotMatch(rule,/ellipsis|nowrap/,chip);
 }
});

test('dark tooltips and menus stay readable, touch fields do not zoom, and primitives speak the page language (THEME-011, A11Y-016, RESP-027, RESP-028, RTL-004, TOK-010)',()=>{
 const css=stylesheet(),modules=fs.readdirSync('components').filter(file=>file.endsWith('.module.css')).map(file=>fs.readFileSync('components/'+file,'utf8')).join('\n');
 // Recharts writes a white background inline; with the dark theme's light text it read 1.12:1.
 assert.match(css,/\.recharts-default-tooltip \{[^}]*color: var\(--popover-foreground\); background: var\(--popover\) !important;/);
 assert.match(css,/\.recharts-default-tooltip \.recharts-tooltip-item \{ color: var\(--popover-foreground\) !important; \}/,'rows are never drawn in the series colour (1.31:1 in dark)');
 const menu=fs.readFileSync('components/ui/dropdown-menu.tsx','utf8');
 assert.doesNotMatch(menu,/text-destructive/,'red on the dark menu was 3.37:1');assert.match(menu,/data-\[variant=destructive\]:text-\(--negative\)/);
 const coarse=css.slice(css.indexOf('/* One floor for every tappable control'));
 assert.match(coarse,/:is\(input:not\(\[type=checkbox\],\[type=radio\],\[type=range\]\),select,textarea\)\{font-size:var\(--type-body\)!important\}/);
 assert.match(coarse,/\.nav-item,\.user-link,\.brand-compact\{min-height:44px!important\}/);
 assert.match(css,/\.auth-page \.panel>a\{display:inline-flex;align-items:center;min-height:44px;/);
 // Positions mirror in Arabic: only a centred toast (left:50%) and a full-screen sheet (left:0) keep a physical side.
 assert.deepEqual((css+modules).match(/(?<![\w-])right:\s*-?\d/g),null);
 assert.deepEqual((css+modules).match(/(?<![\w-])left:\s*(?!0[;}]|50%)-?\d/g),null);
 assert.doesNotMatch(css+modules,/font-size:10px/);
 // Close, the drawer's name and Toggle Sidebar are translated; no English-only description is read out.
 for(const file of ['components/ui/dialog.tsx','components/ui/sheet.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<span className="sr-only">\{label\("Close"\)\}<\/span>/);
 const sidebar=fs.readFileSync('components/ui/sidebar.tsx','utf8');
 assert.match(sidebar,/<SheetTitle>\{label\("Menu"\)\}<\/SheetTitle>/);assert.doesNotMatch(sidebar,/Displays the mobile sidebar/);
 const {useUiLabel}=loadTS('components/ui/ui-label.ts',{react:{...React,useContext:()=>null}});
 assert.equal(useUiLabel()('Close'),'Close','without a provider a primitive falls back to English instead of throwing');
});
