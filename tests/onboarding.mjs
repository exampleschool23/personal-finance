import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const helpers=loadTS('lib/onboarding.ts');
const today='2026-09-30';

test('the welcome setup opens only for a signed-in owner whose loaded preferences never finished it',()=>{
 const base={user:'owner@example.com',demo:false,loading:false,error:'',preferences:{onboarded:false}};
 assert.equal(helpers.needsOnboarding(base),true);
 assert.equal(helpers.needsOnboarding({...base,preferences:{onboarded:true}}),false);
 // A settings row saved before the setup existed carries no flag and is left alone.
 assert.equal(helpers.needsOnboarding({...base,preferences:{}}),false);
 assert.equal(helpers.needsOnboarding({...base,user:null}),false);
 assert.equal(helpers.needsOnboarding({...base,demo:true}),false);
 assert.equal(helpers.needsOnboarding({...base,loading:true}),false);
 assert.equal(helpers.needsOnboarding({...base,error:'Settings are unavailable.'}),false);
});

test('currency cards toggle, keep the primary when a third is tapped, and never empty the list',()=>{
 assert.deepEqual(helpers.pickCurrency(['USD'],'EUR'),['USD','EUR']);
 assert.deepEqual(helpers.pickCurrency(['USD','EUR'],'EUR'),['USD']);
 assert.deepEqual(helpers.pickCurrency(['USD','EUR'],'UZS'),['USD','UZS']);
 assert.deepEqual(helpers.pickCurrency(['USD'],'USD'),['USD']);
 assert.deepEqual(helpers.makePrimary(['USD','EUR'],'EUR'),['EUR','USD']);
 assert.deepEqual(helpers.makePrimary(['USD','EUR'],'GBP'),['USD','EUR']);
});

test('choosing a country puts its currency first and keeps at most two',()=>{
 assert.deepEqual(helpers.currenciesForCountry(['USD','UZS'],'UZ'),['UZS','USD']);
 assert.deepEqual(helpers.currenciesForCountry(['USD','UZS'],'DE'),['EUR','USD']);
 assert.deepEqual(helpers.currenciesForCountry(['USD','UZS'],'AQ'),['USD','UZS']);
 assert.deepEqual(helpers.currenciesForCountry(['USD','UZS'],''),['USD','UZS']);
 assert.equal(helpers.countryCurrency('KZ'),'KZT');
 for(const code of Object.values({UZ:'UZS',FR:'EUR',JP:'JPY'}))assert.ok(loadTS('lib/currencies.ts').isCurrency(code));
});

test('goal horizons land on the same calendar day and the tracking presets resolve to ISO days',()=>{
 assert.equal(helpers.horizonDate(today,1),'2027-09-30');
 assert.equal(helpers.horizonDate('2024-02-29',1),'2025-03-01');
 assert.equal(helpers.trackingStartFor('today',today,''),today);
 assert.equal(helpers.trackingStartFor('year',today,''),'2026-01-01');
 assert.equal(helpers.trackingStartFor('custom',today,'2026-03-15'),'2026-03-15');
 assert.equal(helpers.trackingStartFor('custom',today,''),null);
 assert.equal(helpers.trackingStartFor('later',today,'2026-03-15'),null);
});

test('a first goal is a net-worth goal with the typed target and a future date, or nothing at all',()=>{
 const payload=helpers.onboardingGoalPayload({target:15000.5,horizon:3,custom:''},'USD','Net worth target',today,'goal-1');
 assert.deepEqual(payload,{id:'goal-1',name:'Net worth target',kind:'net_worth',currency:'USD',account_id:null,target:15000.5,allocated:0,target_date:'2029-09-30',archived:false,monthly_contribution:null,annual_return:0});
 assert.equal(helpers.onboardingGoalPayload({target:0,horizon:1,custom:''},'USD','n',today),null);
 assert.equal(helpers.onboardingGoalPayload({target:100,horizon:null,custom:''},'USD','n',today),null);
 assert.equal(helpers.onboardingGoalPayload({target:100,horizon:'custom',custom:''},'USD','n',today),null);
 assert.equal(helpers.onboardingGoalPayload({target:100,horizon:'custom',custom:today},'USD','n',today),null);
 assert.equal(helpers.onboardingGoalPayload({target:100,horizon:'custom',custom:'2026-10-01'},'USD','n',today).target_date,'2026-10-01');
 // The database only accepts net-worth goals without an account and with a date, so the payload satisfies the planning schema.
 const {planningSchemas}=loadTS('lib/planning-schemas.ts');
 assert.ok(planningSchemas.goal.safeParse({...payload,id:'3f8b2c1e-6d4a-4b7f-9c2d-1a2b3c4d5e6f'}).success);
 assert.match(helpers.onboardingGoalPayload({target:1,horizon:1,custom:''},'USD','n',today).id,/^[0-9a-f-]{36}$/);
});

test('the screen renders its four steps with pressed cards, a progress bar and translated labels',()=>{
 const element=tag=>function Element(all){const props={...all};delete props.asChild;delete props.variant;delete props.size;return React.createElement(tag,props);};
 const languages=[];
 const {OnboardingScreen}=loadTS('components/onboarding-screen.tsx',{
  './onboarding-screen.module.css':new Proxy({},{get:(_,key)=>String(key)}),
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key),setLanguage:next=>languages.push(next)})},
  '@/components/presentation-foundation/date-picker':{DatePicker:props=>React.createElement('input',{'data-picker':props.min})},
  '@/components/presentation-foundation/formatted-number-input':{FormattedNumberInput:props=>React.createElement('input',{value:props.value,readOnly:true})},
  '@/components/ui/button':{Button:element('button')},'@/components/ui/input':{Input:element('input')},'@/components/ui/native-select':{NativeSelect:element('select')},
 });
 const html=renderToStaticMarkup(React.createElement(OnboardingScreen,{brand:'Brand',initial:{language:'ru',currencies:['USD','UZS'],font:'inter',onboarded:false},telegram:'telegram',savePreferences:async p=>p,applyPreferences:()=>{},saveGoal:async()=>{},saveTrackingStart:async()=>{},today}));
 assert.match(html,/role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1"/);
 assert.match(html,/Step 1 of 4/);
 assert.match(html,/<h1 tabindex="-1">Let’s set up your workspace\.<\/h1>/);
 // The language is a dropdown like the country, with the current language selected and every language listed.
 assert.match(html,/<select id="onboarding-language"/);
 assert.match(html,/<option value="ru" lang="ru" selected="">Русский<\/option>/);
 assert.equal((html.match(/<option value="[a-zA-Z-]+" lang=/g)||[]).length,16);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,0);
 assert.match(html,/id="onboarding-country"/);
 assert.match(html,/Skip setup/);
 assert.doesNotMatch(html,/Skip this step/);
 assert.doesNotMatch(html,/telegram/);
 const source=fs.readFileSync('components/onboarding-screen.tsx','utf8');
 assert.ok(!/new Intl\.|toLocaleString|toFixed\(|type="date"|fetch\(/.test(source));
 for(const language of ['en','ru','ar','ja']){
  const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
  for(const [,,message] of source.matchAll(/\bt\((["'])((?:(?!\1).)+)\1[,)]/g))assert.ok(labels[message],`${language}: ${message}`);
 }
});

test('the shell shows the setup instead of the drawer, and Settings can run it again',()=>{
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8');
 assert.match(shell,/if \(onboardingNeeded\)\s*return <OnboardingScreen /);
 assert.ok(shell.indexOf('<OnboardingScreen ')<shell.indexOf('<SidebarProvider>'));
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 assert.match(provider,/needsOnboarding\(\{ user, demo, loading: settingsLoading, error: settingsError, preferences: preferencesData \}\)/);
 assert.match(provider,/savePreferences\(\{ \.\.\.preferencesData, onboarded: false \}\)/);
 const panel=fs.readFileSync('components/settings-panel.tsx','utf8');
 // The Settings form never re-stamps the setup; only the wizard and "Run setup again" do.
 assert.match(panel,/JSON\.stringify\(\{ \.\.\.draft, onboarded: undefined \}\)/);
 assert.match(panel,/Run setup again/);
});

test('the workspace waits for the settings of a signed-in owner, so the dashboard never shows before the welcome setup',()=>{
 const base={user:'owner@example.com',demo:false,loading:true};
 assert.equal(helpers.awaitingSettings(base),true);
 assert.equal(helpers.awaitingSettings({...base,loading:false}),false);
 assert.equal(helpers.awaitingSettings({...base,user:null}),false);
 assert.equal(helpers.awaitingSettings({...base,demo:true}),false);
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8');
 assert.match(shell,/awaitingSettings\(\{ user, demo, loading: settingsLoading \}\)\)\s*return <main className="session-loading"/);
 assert.ok(shell.indexOf('awaitingSettings(')<shell.indexOf('if (onboardingNeeded)'));
});

test('an account that has not finished the setup keeps the language already showing, and the wizard preselects it',()=>{
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 assert.match(provider,/useEffectEvent\(\(loaded: Preferences\) => applyPreferences\(loaded\.onboarded === false \? \{ \.\.\.loaded, language \} : loaded\)\)/);
});

test('the welcome setup and Settings list every language from one catalogue and suggest no local currency first',()=>{
 for(const file of ['components/onboarding-screen.tsx','components/settings-panel.tsx','components/language-provider.tsx']){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/languageCatalogue\.map/,file);
  assert.ok(!/value="uz"|\['uz'|O‘zbek/.test(source),file);
 }
 assert.ok(!helpers.suggestedCurrencies.includes('UZS'));
 assert.equal(helpers.suggestedCurrencies[0],'USD');
 // Accounts that still hold the old untouched USD and UZS pair start from USD; a chosen pair is kept.
 assert.deepEqual(helpers.startingCurrencies(['USD','UZS']),['USD']);
 assert.deepEqual(helpers.startingCurrencies(['UZS','USD']),['UZS','USD']);
 assert.deepEqual(helpers.startingCurrencies(['EUR']),['EUR']);
});
