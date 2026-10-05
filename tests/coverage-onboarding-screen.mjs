import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,cssModule,text,byType,host} from './helpers/component-tree.mjs';

const {formatMoney,formatDate}=loadTS('lib/format.ts');
const today='2026-10-04';

function setup(overrides={},{mounted=true}={}){
 const focused=[],languages=[];
 const renderer=createRenderer({attach:element=>mounted&&element.type==='h1'?{focus:()=>focused.push(text(element))}:null});
 const {OnboardingScreen}=renderer.load('components/onboarding-screen.tsx',{
  './onboarding-screen.module.css':cssModule(),
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key])),setLanguage:code=>languages.push(code)})},
  '@/components/presentation-foundation/date-picker':{DatePicker:host('date-picker')},
  '@/components/presentation-foundation/formatted-number-input':{FormattedNumberInput:host('number-input')},
  '@/components/ui/button':{Button:host('button')},'@/components/ui/input':{Input:host('input')},'@/components/ui/native-select':{NativeSelect:host('select')},
 });
 const calls={goals:[],tracking:[],preferences:[],applied:[]};
 const props={brand:'Brand',telegram:React.createElement('telegram-panel'),today,
  initial:{language:'en',currencies:['USD','UZS'],font:'inter',onboarded:false},
  saveGoal:async goal=>{calls.goals.push(goal);},saveTrackingStart:async date=>{calls.tracking.push(date);},
  savePreferences:async preferences=>{calls.preferences.push(preferences);return {...preferences,saved:true};},
  applyPreferences:preferences=>calls.applied.push(preferences),...overrides};
 const view={calls,focused,languages,props,find:renderer.find,all:renderer.all,flush:renderer.flush,
  render:()=>renderer.render(React.createElement(OnboardingScreen,props)),
  get tree(){return renderer.tree;},
  button:label=>renderer.find(byType('button',label)),
  click:label=>{view.button(label).props.onClick();return view.render();},
  heading:()=>text(renderer.find(node=>node.type==='h1')),
 };
 view.render();
 return view;
}
const change=(element,value)=>element.props.onChange({target:{value},currentTarget:{value}});

test('the profile step keeps the name, picks the country currency first and switches the language',()=>{
 const view=setup();
 assert.equal(view.heading(),'Let’s set up your workspace.');
 assert.deepEqual(view.focused,['Let’s set up your workspace.'],'the step heading takes focus');
 assert.match(text(view.tree),/Step 1 of 4/);
 assert.equal(view.find(node=>node.props.role==='progressbar').props['aria-valuenow'],1);
 assert.equal(view.button('Back').props.disabled,true,'no step before the first');
 assert.equal(view.all(node=>node.type==='button'&&text(node).includes('Skip this step')).length,0);
 change(view.find(node=>node.props.id==='onboarding-name'),'  Ana  ');view.render();
 change(view.find(node=>node.props.id==='onboarding-country'),'FR');view.render();
 assert.equal(view.find(node=>node.props.id==='onboarding-country').props.value,'FR');
 const language=view.find(node=>node.props.id==='onboarding-language');
 change(language,'klingon');view.render();
 assert.deepEqual(view.languages,[],'an unknown language is ignored');
 change(language,'ru');view.render();
 assert.deepEqual(view.languages,['ru']);
 assert.equal(view.find(node=>node.props.id==='onboarding-language').props.value,'ru');
 view.click('Continue');
 assert.equal(view.heading(),'Which currencies do you use?');
 // The legacy USD and UZS pair starts from USD alone; France makes EUR primary and keeps USD second.
 const pressed=view.all(node=>node.type==='button'&&node.props['aria-pressed']===true).map(node=>view.find(item=>item.type==='strong',node).children[0]);
 assert.deepEqual(pressed,['EUR','USD']);
 assert.match(text(view.find(byType('button','EUR'))),/Euro.*Primary/);
 assert.match(text(view.tree),/EUR is primary\./);
});

test('the currency step reorders, replaces and searches currencies',()=>{
 const view=setup({initial:{language:'en',currencies:['EUR'],font:'inter',onboarded:false}});
 view.click('Continue');
 assert.doesNotMatch(text(view.tree),/is primary\./,'one currency needs no primary hint');
 view.click('GBP');
 assert.match(text(view.tree),/EUR is primary\./);
 view.click('Make GBP primary');
 assert.match(text(view.tree),/GBP is primary\./);
 view.click('USD');
 assert.match(text(view.tree),/GBP is primary\. Make USD primary/,'a third choice replaces the secondary currency');
 const search=()=>view.find(node=>node.props.id==='onboarding-currency-search');
 change(search(),'zzzz');view.render();
 assert.equal(text(view.find(node=>node.props.role==='status')),'No matching currencies.');
 change(search(),'yen');view.render();
 const chip=view.find(byType('button','JPY · Japanese Yen'));
 assert.equal(chip.props['aria-pressed'],false);
 chip.props.onClick();view.render();
 assert.equal(search().props.value,'','choosing a result clears the search');
 assert.match(text(view.tree),/GBP is primary\. Make JPY primary/);
 change(search(),'   ');view.render();
 assert.equal(view.all(node=>node.props.role==='status').length,0,'blank search shows no results');
 view.click('Back');
 assert.equal(view.heading(),'Let’s set up your workspace.');
});

test('the goal step offers horizons and a custom date and summarises the target with shared formatters',()=>{
 const view=setup();
 view.click('Continue');view.click('Continue');
 assert.equal(view.heading(),'Set a first target.');
 assert.equal(view.find(node=>node.type==='number-input').props.value,0);
 view.find(node=>node.type==='number-input').props.onValueChange(5000);view.render();
 for(const [label,years] of [['In 1 year',1],['In 3 years',3],['In 5 years',5]])assert.match(text(view.button(label)),new RegExp(formatDate(`${2026+years}-10-04`,'en-US')));
 assert.equal(formatDate('2029-10-04','en-US'),'4 October 2029');
 view.click('In 3 years');
 assert.equal(view.button('In 3 years').props['aria-pressed'],true);
 assert.match(text(view.tree),new RegExp(`Reach \\${formatMoney(5000,'USD','en-US')} by 4 October 2029\\.`));
 view.click('In 3 years');
 assert.equal(view.button('In 3 years').props['aria-pressed'],false,'a second tap clears the horizon');
 assert.doesNotMatch(text(view.tree),/Reach /);
 view.click('Choose a date');
 assert.match(text(view.button('Choose a date')),/Any day after today/);
 const picker=view.find(node=>node.type==='date-picker');
 assert.equal(picker.props.min,'2026-10-05','only days after today');
 picker.props.onChange('2027-01-15');view.render();
 assert.match(text(view.button('Choose a date')),/15 January 2027/);
 assert.match(text(view.tree),/Reach \$5,000 by 15 January 2027\./);
 view.click('Choose a date');
 assert.equal(view.all(node=>node.type==='date-picker').length,0);
 view.click('Skip this step');
 assert.equal(view.heading(),'Stay in the loop.');
 assert.equal(view.all(node=>node.type==='telegram-panel').length,1);
 assert.equal(view.button('Finish setup').props.disabled,false);
});

test('finishing saves the goal, the tracking start and the preferences, then opens the workspace',async()=>{
 const view=setup();
 change(view.find(node=>node.props.id==='onboarding-name'),'  Ana  ');view.render();
 view.click('Continue');view.click('Continue');
 view.find(node=>node.type==='number-input').props.onValueChange(250000);view.render();
 view.click('In 5 years');view.click('Continue');
 assert.match(text(view.button('Today')),/4 October 2026/);
 assert.match(text(view.button('Start of this year')),/1 January 2026/);
 assert.match(text(view.button('Decide later')),/From your first investment/);
 assert.equal(view.button('Decide later').props['aria-pressed'],true);
 view.click('Choose a date');
 assert.match(text(view.button('Choose a date')),/Any earlier day/);
 const picker=view.find(node=>node.type==='date-picker');
 assert.equal(picker.props.max,today);
 picker.props.onChange('2026-03-02');view.render();
 assert.match(text(view.button('Choose a date')),/2 March 2026/);
 view.click('Finish setup');
 assert.match(text(view.button('Saving…')),/Saving…/);
 assert.equal(view.button('Saving…').props.disabled,true);
 assert.equal(view.button('Skip setup').props.disabled,true);
 await view.flush();
 assert.equal(view.calls.goals.length,1);
 assert.deepEqual({...view.calls.goals[0],id:undefined},{id:undefined,name:'Net worth target',kind:'net_worth',currency:'USD',account_id:null,target:250000,allocated:0,target_date:'2031-10-04',archived:false,monthly_contribution:null,annual_return:0});
 assert.deepEqual(view.calls.tracking,['2026-03-02']);
 assert.equal(view.calls.preferences[0].display_name,'Ana');
 assert.equal(view.calls.preferences[0].onboarded,true);
 assert.deepEqual(view.calls.applied,[],'the done screen waits for the person');
 assert.equal(view.heading(),'You’re all set, Ana.');
 assert.ok(view.focused.includes('You’re all set, Ana.'));
 view.button('Open my workspace').props.onClick();
 assert.equal(view.calls.applied[0].saved,true);
});

test('Today and Start of this year are saved as tracking starts; nothing is saved for an empty goal',async()=>{
 for(const [label,expected] of [['Today',today],['Start of this year','2026-01-01']]){
  const view=setup({initial:{language:'en',currencies:['EUR'],font:'inter',onboarded:false}});
  for(let i=0;i<3;i++)view.click('Continue');
  view.click(label);view.click('Finish setup');await view.flush();
  assert.deepEqual(view.calls.goals,[]);
  assert.deepEqual(view.calls.tracking,[expected]);
  assert.equal(view.heading(),'You’re all set.');
 }
});

test('Skip setup saves the preferences only and applies them straight away',async()=>{
 const view=setup();
 view.click('Continue');view.click('Continue');
 view.find(node=>node.type==='number-input').props.onValueChange(1000);view.click('In 1 year');
 view.click('Skip setup');await view.flush();
 assert.deepEqual(view.calls.goals,[]);assert.deepEqual(view.calls.tracking,[]);
 assert.equal(view.calls.applied.length,1);
 assert.equal(view.calls.applied[0].onboarded,true);
 assert.equal(view.calls.applied[0].display_name,'');
});

test('a failed save shows the error, keeps the step and retries with the same goal id',async()=>{
 let fail=true;const ids=[];
 const view=setup({saveGoal:async goal=>{ids.push(goal.id);if(fail)throw Error('Could not save the goal.');}});
 view.click('Continue');view.click('Continue');
 view.find(node=>node.type==='number-input').props.onValueChange(900);view.render();
 view.click('In 1 year');view.click('Continue');
 view.click('Finish setup');await view.flush();
 assert.equal(text(view.find(node=>node.props.role==='alert')),'Could not save the goal.');
 assert.equal(view.button('Finish setup').props.disabled,false);
 assert.deepEqual(view.calls.preferences,[]);
 // Moving between steps clears the message.
 view.click('Back');
 assert.equal(view.all(node=>node.props.role==='alert').length,0);
 view.click('Skip this step');
 fail=true;view.click('Finish setup');await view.flush();
 assert.equal(view.all(node=>node.props.role==='alert').length,1);
 view.click('Back');view.click('Continue');
 assert.equal(view.all(node=>node.props.role==='alert').length,0,'Continue clears the error');
 fail=false;view.click('Finish setup');await view.flush();
 assert.equal(new Set(ids).size,1,'the retry updates the same goal');
 assert.equal(ids.length,3);
 assert.equal(view.heading(),'You’re all set.');
});

test('the screen falls back to the app calendar day when no date is given',()=>{
 const view=setup({today:undefined});
 view.click('Continue');view.click('Continue');
 assert.match(text(view.button('In 1 year')),/\d{1,2} [A-Z][a-z]+ \d{4}/);
});

test('focusing the heading is skipped while it is not mounted',()=>{
 const view=setup({},{mounted:false});
 assert.deepEqual(view.focused,[]);
 view.click('Continue');
 assert.equal(view.heading(),'Which currencies do you use?');
});
