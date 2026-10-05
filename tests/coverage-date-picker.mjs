import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byLabel,byText,event} from './helpers/component-tree.mjs';

// Today is 30 September 2026 for every test here.
const now=new Date('2026-09-30T07:00:00Z');
function mount(t,props,{narrow=true,locale='en'}={}){
 if(!t.dateMocked){t.mock.timers.enable({apis:['Date'],now});t.dateMocked=true;}
 const listeners=new Set();
 const media={matches:narrow,addEventListener:(type,listener)=>listeners.add(listener),removeEventListener:(type,listener)=>listeners.delete(listener)};
 globalThis.window={matchMedia:query=>{assert.equal(query,'(max-width: 720px)');return media;}};
 t.after(()=>{delete globalThis.window;});
 const r=createRenderer();
 const {DatePicker}=r.load('components/presentation-foundation/date-picker.tsx',{
  '@/components/language-provider':language(locale),
  '@/components/ui/popover':hostModule(),'@/components/ui/button':hostModule(),'lucide-react':hostModule(),
 });
 const changes=[];
 const view=next=>r.render(r.react.createElement(DatePicker,{onChange:value=>changes.push(value),...next}));
 view(props);
 return {r,view,changes,media,listeners,popover:()=>r.find(node=>node.type==='Popover')};
}
const grids=r=>r.all(node=>node.props.className==='pos-month-grid');
// Simulated DOM for the keyboard handlers: the grid's buttons, with focus recorded.
function keyboard(grid){
 const focused=[];
 const buttons=grid.children.filter(child=>child.type==='button').map(node=>({node,disabled:!!node.props.disabled,focus(){focused.push(text(node));}}));
 const parentElement={querySelectorAll:()=>buttons};
 for(const button of buttons)button.parentElement=parentElement;
 const press=(label,key)=>{const target=buttons.find(button=>text(button.node)===label||button.node.props['aria-label']===label);const e=event({key,currentTarget:target});target.node.props.onKeyDown(e);return e;};
 return {focused,press};
}

test('day picker shows the formatted value, today and the selected day, and closes on a pick',t=>{
 const {r,changes,popover}=mount(t,{value:'2026-09-16'});
 const trigger=r.find(node=>node.props.className==='date-picker-trigger');
 assert.equal(trigger.props['aria-label'],'16 September 2026');assert.equal(text(trigger),'16 September 2026');
 assert.equal(grids(r).length,1,'a narrow screen shows one month');
 assert.equal(r.find(node=>node.props['aria-pressed']===true&&node.type==='button').props['aria-label'],'16 September 2026');
 const today=r.find(node=>node.props['aria-current']==='date');
 assert.equal(today.props['aria-label'],'30 September 2026');assert.match(today.props.className,/pos-today/);
 const weekdays=r.all(node=>node.props.className==='pos-weekday').map(text);
 assert.equal(weekdays.length,7);
 // Days of the neighbouring months stay visible but disabled.
 const outside=r.find(byLabel('31 August 2026'));
 assert.equal(outside.props.disabled,true);assert.equal(outside.props['data-outside'],true);
 r.fire(popover(),'onOpenChange',true);
 assert.equal(popover().props.open,true);
 r.fire(r.find(byLabel('20 September 2026')),'onClick');
 assert.deepEqual(changes,['2026-09-20']);
 assert.equal(popover().props.open,false,'choosing a day closes the picker');
 // Required fields offer no Clear date.
 assert.equal(r.all(byText('Button','Clear date')).length,0);
});

test('an empty day picker prompts for a date and opens on today',t=>{
 const {r,popover}=mount(t,{value:''});
 assert.equal(r.find(node=>node.props.className==='date-picker-trigger').props['aria-label'],'Select date');
 r.fire(popover(),'onOpenChange',true);
 assert.equal(text(r.find(node=>node.props.className==='pos-year-trigger')),'September 2026');
 r.fire(popover(),'onOpenChange',false);
 assert.equal(popover().props.open,false);
});

test('minimum and maximum dates disable days and arrows, and clicks on them change nothing',t=>{
 const {r,changes}=mount(t,{value:'2026-09-16',min:'2026-09-10',max:'2026-09-20'});
 const early=r.find(byLabel('5 September 2026')),late=r.find(byLabel('25 September 2026'));
 assert.equal(early.props.disabled,true);assert.equal(late.props.disabled,true);
 r.fire(early,'onClick');r.fire(late,'onClick');
 assert.deepEqual(changes,[],'days outside the range are refused even if clicked');
 assert.equal(r.find(byLabel('Previous month')).props.disabled,true);
 assert.equal(r.find(byLabel('Next month')).props.disabled,true);
 // Presets outside the range are not offered: only Today would be, and it is after the maximum.
 const presets=r.find(node=>node.props.className==='date-picker-presets');
 assert.equal(text(presets),'Presets');
});

test('presets and Clear date select at once; an optional field can be cleared',t=>{
 const {r,changes}=mount(t,{value:'2026-09-16',required:false});
 const labels=r.all(node=>node.type==='Button').map(text);
 assert.deepEqual(labels,['Today','Tomorrow','In one week','Clear date']);
 r.fire(r.find(byText('Button','Tomorrow')),'onClick');
 r.fire(r.find(byText('Button','Clear date')),'onClick');
 assert.deepEqual(changes,['2026-10-01','']);
});

test('month arrows page through months and across the year boundary',t=>{
 const {r}=mount(t,{value:'2026-12-05'});
 const heading=()=>text(r.find(node=>node.props.className==='pos-year-trigger'));
 assert.equal(heading(),'December 2026');
 r.fire(r.find(byLabel('Next month')),'onClick');
 assert.equal(heading(),'January 2027');
 r.fire(r.find(byLabel('Previous month')),'onClick');r.fire(r.find(byLabel('Previous month')),'onClick');
 assert.equal(heading(),'November 2026');
});

test('the year chooser pages by twelve years and returns to the chosen year',t=>{
 const {r}=mount(t,{value:'2026-09-16'});
 const yearTrigger=()=>r.find(node=>node.props.className==='pos-year-trigger');
 assert.equal(yearTrigger().props['aria-label'],'Change year for September 2026');
 r.fire(yearTrigger(),'onClick');
 assert.equal(yearTrigger().props['aria-expanded'],true);
 assert.equal(text(yearTrigger()),'2016–2027');
 const years=()=>r.all(node=>node.type==='button'&&/^\d{4}$/.test(text(node))).map(text);
 assert.equal(years().length,12);assert.equal(years()[0],'2016');
 assert.equal(r.find(node=>node.props['aria-pressed']===true&&text(node)==='2026').type,'button');
 r.fire(r.find(byLabel('Next years')),'onClick');
 assert.equal(years()[0],'2028');
 r.fire(r.find(byLabel('Previous years')),'onClick');r.fire(r.find(byLabel('Previous years')),'onClick');
 assert.equal(years()[0],'2004');
 r.fire(r.find(byText('button','2010')),'onClick');
 assert.equal(text(yearTrigger()),'September 2010');
 assert.equal(yearTrigger().props['aria-expanded'],false);
 // Toggling the chooser twice closes it again without a change.
 r.fire(yearTrigger(),'onClick');r.fire(yearTrigger(),'onClick');
 assert.equal(text(yearTrigger()),'September 2010');
});

test('the year chooser stops at the first and last pages',t=>{
 const {r}=mount(t,{value:'2026-09-16'});
 r.fire(r.find(node=>node.props.className==='pos-year-trigger'),'onClick');
 let pages=0;
 while(!r.find(byLabel('Previous years')).props.disabled&&pages<500){r.fire(r.find(byLabel('Previous years')),'onClick');pages++;}
 assert.equal(text(r.find(node=>node.props.className==='pos-year-trigger')),'12–23','the first page starts at year 12');
 while(!r.find(byLabel('Next years')).props.disabled&&pages<2000){r.fire(r.find(byLabel('Next years')),'onClick');pages++;}
 assert.equal(text(r.find(node=>node.props.className==='pos-year-trigger')),'9984–9995','the last full page ends before year 10000');
});

test('arrow keys move focus by a day or a week and skip disabled days',t=>{
 const {r}=mount(t,{value:'2026-09-16',max:'2026-09-20'});
 const {focused,press}=keyboard(grids(r)[0]);
 assert.equal(press('16 September 2026','ArrowRight').defaultPrevented,true);
 press('16 September 2026','ArrowLeft');press('16 September 2026','ArrowUp');
 press('16 September 2026','ArrowDown');// 23 September is after the maximum
 press('1 September 2026','ArrowUp');// before the grid's first row
 assert.deepEqual(focused,['17','15','9']);
 assert.equal(press('16 September 2026','Enter').defaultPrevented,false,'other keys keep their default');
});

test('a wide screen shows two months side by side, capped at today by showing the previous month first',t=>{
 const {r,popover,media,listeners}=mount(t,{value:'',max:'2026-09-30'},{narrow:false});
 r.fire(popover(),'onOpenChange',true);
 assert.deepEqual(r.all(node=>node.props.className==='pos-year-trigger').map(text),['August 2026','September 2026']);
 assert.equal(r.all(byLabel('Previous month')).length,1);assert.equal(r.all(byLabel('Next month')).length,1);
 r.fire(r.find(byLabel('Next month')),'onClick');
 assert.deepEqual(r.all(node=>node.props.className==='pos-year-trigger').map(text),['September 2026','October 2026']);
 // Choosing a year on the right-hand month keeps that month on the right.
 r.fire(r.all(node=>node.props.className==='pos-year-trigger')[1],'onClick');
 r.fire(r.find(byText('button','2024')),'onClick');
 assert.deepEqual(r.all(node=>node.props.className==='pos-year-trigger').map(text),['September 2024','October 2024']);
 // And on the left-hand month, that month stays on the left.
 r.fire(r.all(node=>node.props.className==='pos-year-trigger')[0],'onClick');
 r.fire(r.find(byText('button','2025')),'onClick');
 assert.deepEqual(r.all(node=>node.props.className==='pos-year-trigger').map(text),['September 2025','October 2025']);
 // Narrowing the window switches to one month; unmounting stops listening.
 media.matches=true;for(const listener of listeners)listener();r.update();
 assert.equal(grids(r).length,1);
 r.unmount();assert.equal(listeners.size,0);
});

test('a wide picker whose maximum is today keeps the current month when the minimum forbids the previous one',t=>{
 const {r,popover}=mount(t,{value:'',min:'2026-09-05',max:'2026-09-30'},{narrow:false});
 r.fire(popover(),'onOpenChange',true);
 assert.deepEqual(r.all(node=>node.props.className==='pos-year-trigger').map(text),['September 2026','October 2026']);
});

test('month mode lists the twelve months of the year with limits and closes on a pick',t=>{
 const {r,changes,popover}=mount(t,{mode:'month',value:'2026-09',min:'2026-03-15',max:'2026-11-01'});
 const trigger=r.find(node=>node.props.className==='date-picker-trigger');
 assert.equal(trigger.props['aria-label'],'Month');assert.equal(text(trigger),'September 2026');
 const months=()=>r.all(node=>node.props.className?.startsWith('pos-day'));
 assert.equal(months().length,12);
 assert.deepEqual(months().filter(node=>node.props.disabled).map(text),['January 2026','February 2026','December 2026']);
 assert.equal(months().find(node=>node.props['aria-pressed']).props.className,'pos-day pos-selected');
 assert.equal(r.find(byLabel('Previous year')).props.disabled,true);assert.equal(r.find(byLabel('Next year')).props.disabled,true);
 r.fire(popover(),'onOpenChange',true);
 assert.equal(popover().props.open,true);
 r.fire(months()[4],'onClick');
 assert.deepEqual(changes,['2026-05']);assert.equal(popover().props.open,false);
 // Keyboard: left/right by one month, up/down by a row of three, never onto a disabled month.
 const grid=r.find(node=>node.props.className==='month-selection-grid');
 const {focused,press}=keyboard(grid);
 press('May 2026','ArrowRight');press('May 2026','ArrowLeft');press('May 2026','ArrowDown');press('May 2026','ArrowUp');
 press('April 2026','ArrowLeft');press('November 2026','ArrowDown');
 assert.equal(press('May 2026','Tab').defaultPrevented,false);
 assert.deepEqual(focused,['June 2026','April 2026','August 2026','March 2026']);
});

test('month mode pages by year, opens on the current month when empty and stops at year 100 and 9999',t=>{
 const {r,popover}=mount(t,{mode:'month',value:''});
 assert.equal(text(r.find(node=>node.props['aria-live']==='polite')),'2026');
 r.fire(r.find(byLabel('Next year')),'onClick');
 assert.equal(text(r.find(node=>node.props['aria-live']==='polite')),'2027');
 r.fire(r.find(byLabel('Previous year')),'onClick');r.fire(r.find(byLabel('Previous year')),'onClick');
 assert.equal(text(r.find(node=>node.props['aria-live']==='polite')),'2025');
 r.fire(popover(),'onOpenChange',true);
 assert.equal(text(r.find(node=>node.props['aria-live']==='polite')),'2026','reopening returns to the current year');
 assert.equal(text(r.find(node=>node.props.className==='date-picker-trigger')),'—','a missing month shows an em dash');
 const early=mount(t,{mode:'month',value:'0100-05'}).r;
 assert.equal(early.find(byLabel('Previous year')).props.disabled,true);
 const late=mount(t,{mode:'month',value:'9999-05'}).r;
 assert.equal(late.find(byLabel('Next year')).props.disabled,true);
 r.fire(popover(),'onOpenChange',false);assert.equal(popover().props.open,false);
});
