import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byLabel,byText,byType,event} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const {formatMoney}=loadTS('lib/format.ts');
const {currencyLabel}=loadTS('lib/currencies.ts');

function panel(t,props={},{reply}={}){
 if(!t.timersMocked){t.mock.timers.enable({apis:['setTimeout']});t.timersMocked=true;}
 const r=createRenderer(),saved=[],errors=[],savedNotices=[],requests=[],retries=[];
 const replies=[];
 const {SettingsPanel}=r.load('components/settings-panel.tsx',{
  '@/components/language-provider':language('en'),
  '@/components/ui/button':hostModule(),'@/components/ui/input':hostModule(),'@/components/ui/native-select':hostModule(),'@/components/ui/dialog':hostModule(),'@/components/ui/alert-dialog':hostModule(),'lucide-react':hostModule(),
  '@/components/presentation-foundation/inline-error':hostModule(),'@/components/presentation-foundation/info-hint':hostModule(),'@/components/presentation-foundation/loading-placeholder':hostModule(),
  '@/lib/feedback':{showError:message=>errors.push(message),showSaved:language=>savedNotices.push(language)},
  '@/lib/api-client':{requestJson:async(url,options)=>{requests.push([url,options]);const next=replies.shift()??reply;if(next instanceof Error)throw next;return typeof next==='function'?next(options.body):next??options.body;}},
 });
 const base={initial:{display_name:'Ada',country:'GB',language:'en',currencies:['USD'],font:'inter'},demo:false,onSaved:p=>saved.push(p),loading:false,loadError:'',onRetry:()=>retries.push(true),ratesDate:'2026-09-30'};
 const view=(next={})=>r.render(r.react.createElement(SettingsPanel,Object.assign(base,next)));
 view(props);
 const select=value=>r.find(node=>node.type==='NativeSelect'&&node.children.some(option=>option.type==='option'&&option.props.value===value));
 const settle=async(ms=0)=>{t.mock.timers.tick(ms);await r.flush();};
 return {r,view,saved,errors,savedNotices,requests,retries,replies,select,settle};
}

test('loading shows a placeholder instead of the form',t=>{
 const {r}=panel(t,{loading:true});
 assert.equal(r.find(byType('LoadingPlaceholder')).props.label,'Loading settings…');
 assert.equal(r.all(byType('form')).length,0);
 assert.equal(text(r.find(byType('h2'))),'Profile & preferences'+'Keep your profile details, language, and currency preferences up to date.');
});

test('a failed load offers a retry, disables the fields and never saves fallback preferences',async t=>{
 const s=panel(t,{loadError:'Could not load settings.'});
 assert.equal(s.r.find(byType('InlineError')).props.message,'Could not load settings.');
 s.r.fire(s.r.find(byText('Button','Retry loading settings')),'onClick');
 assert.equal(s.retries.length,1);
 assert.equal(s.r.find(byType('fieldset')).props.disabled,true);
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle(1000);
 assert.deepEqual(s.requests,[]);assert.deepEqual(s.saved,[]);
});

test('a changed setting saves at once to the server without the onboarded flag',async t=>{
 const s=panel(t,{initial:{display_name:'Ada',country:'GB',language:'en',currencies:['USD'],font:'inter',onboarded:true}},{reply:body=>({...body,display_name:'Ada'})});
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle();
 assert.equal(s.requests.length,1);
 const [url,options]=s.requests[0];
 assert.equal(url,'/api/settings');assert.equal(options.method,'PUT');
 assert.equal(options.body.language,'fr');assert.equal(options.body.onboarded,undefined);
 assert.equal(s.saved.at(-1).language,'fr');assert.deepEqual(s.savedNotices,['fr']);
 await s.settle(1000);
 assert.equal(s.requests.length,1,'a saved draft is not sent again');
 // The country list is translated and sorted by name.
 s.r.fire(s.r.find(node=>node.props.id==='profile-country'),'onChange',{target:{value:'DE'}});
 await s.settle();
 assert.equal(s.requests.at(-1)[1].body.country,'DE');
 const countries=s.r.find(node=>node.props.id==='profile-country').children.map(text);
 assert.equal(countries[0],'Select your country');assert.ok(countries.includes('Germany'));
});

test('typing a name waits for a pause, and leaving the field saves at once; demo mode trims locally',async t=>{
 const s=panel(t,{demo:true,ratesDate:'2026-09-30'});
 assert.equal(s.r.all(node=>node.props.className==='preferences-rates-credit').length,0,'demo shows no rates credit');
 const name=()=>s.r.find(node=>node.props.id==='profile-name');
 s.r.fire(name(),'onChange',{target:{value:'  Grace  '}});
 await s.settle(899);
 assert.deepEqual(s.saved,[],'typing waits');
 await s.settle(1);
 assert.equal(s.saved.at(-1).display_name,'Grace','demo saves the trimmed name locally');
 assert.deepEqual(s.requests,[]);
 assert.equal(name().props.value,'Grace','the field shows what was saved');
 s.r.fire(name(),'onChange',{target:{value:'Grace H'}});
 s.r.fire(name(),'onBlur');
 await s.settle(0);
 assert.equal(s.saved.at(-1).display_name,'Grace H','leaving the field saves without waiting');
 s.r.fire(name(),'onChange',{target:{value:'Grace Hopper'}});
 const e=event();s.r.fire(s.r.find(byType('form')),'onSubmit',e);
 assert.equal(e.defaultPrevented,true);
 await s.settle(0);
 assert.equal(s.saved.at(-1).display_name,'Grace Hopper','pressing Enter saves at once');
 // A missing name saves as empty.
 const blank=panel(t,{demo:true,initial:{language:'en',currencies:['USD']}});
 blank.r.fire(blank.select('de'),'onChange',{target:{value:'de'}});
 await blank.settle();
 assert.equal(blank.saved.at(-1).display_name,'');
 assert.equal(blank.r.find(node=>node.props.id==='profile-name').props.value,'');
 assert.equal(blank.r.find(node=>node.props.id==='profile-country').props.value,'');
});

test('a failed save reports the error once and retries only after another change',async t=>{
 const s=panel(t);
 s.replies.push(Error('Settings service is down.'));
 s.r.fire(s.select('es'),'onChange',{target:{value:'es'}});
 await s.settle();
 assert.deepEqual(s.errors,['Settings service is down.']);
 await s.settle(1000);
 assert.equal(s.requests.length,1,'the failed draft is not retried in a loop');
 s.replies.push(Error(''));
 s.r.fire(s.select('es'),'onChange',{target:{value:'de'}});
 await s.settle();
 assert.deepEqual(s.errors.at(-1),'Could not save settings. Try again.','an empty message falls back to the generic one');
 s.r.fire(s.select('de'),'onChange',{target:{value:'it'}});
 await s.settle();
 assert.equal(s.saved.at(-1).language,'it');
});

test('a change made while a save is running is kept and saved next',async t=>{
 const s=panel(t);
 let release;s.replies.push(new Promise(resolve=>{release=resolve;}).then(()=>({display_name:'Ada',country:'GB',language:'fr',currencies:['USD'],font:'inter'})));
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle();
 assert.equal(s.requests.length,1);
 s.r.fire(s.r.find(node=>node.props.id==='profile-country'),'onChange',{target:{value:'FR'}});
 release();await s.settle();await s.settle();
 assert.equal(s.requests.length,2);
 assert.equal(s.requests[1][1].body.country,'FR');assert.equal(s.requests[1][1].body.language,'fr');
});

test('the font choice previews the primary currency through the money formatter and ignores unknown fonts',async t=>{
 const s=panel(t,{initial:{language:'en',currencies:['EUR','USD'],font:'unknown'}});
 const font=()=>s.select('onest');
 assert.equal(font().props.value,'inter','an unknown font falls back to Inter');
 assert.deepEqual(font().children.map(text),['Inter (current)','Onest']);
 const preview=()=>s.r.find(node=>node.props.className==='font-preview');
 assert.match(text(preview()),new RegExp(formatMoney(1234567,'EUR','en').replace(/[$.]/g,'\\$&')));
 s.r.fire(font(),'onChange',{target:{value:'comic-sans'}});
 await s.settle();
 assert.deepEqual(s.requests,[]);
 s.r.fire(font(),'onChange',{target:{value:'onest'}});
 await s.settle();
 assert.equal(s.requests.at(-1)[1].body.font,'onest');
 assert.equal(preview().props['data-font'],'onest');
});

test('the primary currency can be swapped and the second one removed',async t=>{
 const s=panel(t,{initial:{language:'en',currencies:['USD','EUR']}});
 const primary=()=>s.r.find(node=>node.type==='NativeSelect'&&node.props.value==='USD'||node.type==='NativeSelect'&&node.props.value==='EUR');
 assert.deepEqual(primary().children.map(text),[currencyLabel('USD','en'),currencyLabel('EUR','en')]);
 const list=()=>s.r.find(node=>node.props.className==='preferences-currency-list');
 assert.equal(text(list()),'USD'+currencyLabel('USD','en').split(' · ')[1]+'Primary'+'EUR'+currencyLabel('EUR','en').split(' · ')[1]);
 assert.equal(text(s.r.find(node=>node.props.className==='currency-search-trigger')),'Change currencies');
 s.r.fire(primary(),'onChange',{target:{value:'EUR'}});
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['EUR','USD']);
 s.r.fire(s.r.find(byLabel('Remove USD')),'onClick');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['EUR']);
 assert.equal(text(s.r.find(node=>node.props.className==='currency-search-trigger')),'Add currency');
 // The free rates service is credited with the date written out.
 assert.equal(text(s.r.find(node=>node.props.className==='preferences-rates-credit')),'Updated 30 September 2026Rates By Exchange Rate API');
});

test('the currency catalogue searches, adds, refuses the last one and asks which one to replace when full',async t=>{
 const s=panel(t,{ratesDate:null});
 assert.equal(s.r.all(node=>node.props.className==='preferences-rates-credit').length,0);
 const dialog=()=>s.r.find(byType('Dialog'));
 s.r.fire(dialog(),'onOpenChange',true);
 assert.equal(dialog().props.open,true);
 const search=()=>s.r.find(byLabel('Search currencies'));
 const boxes=()=>s.r.all(node=>node.type==='input'&&node.props.type==='checkbox');
 assert.ok(boxes().length>100);
 s.r.fire(search(),'onChange',{target:{value:'euro'}});
 const euro=s.r.find(node=>node.type==='label'&&text(node)===currencyLabel('EUR','en'));
 s.r.fire(euro.children[0],'onChange');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD','EUR']);
 // A third currency asks which one it replaces.
 s.r.fire(search(),'onChange',{target:{value:'yen'}});
 const yen=s.r.find(node=>node.type==='label'&&text(node).startsWith('JPY'));
 s.r.fire(yen.children[0],'onChange');
 const alert=()=>s.r.find(byType('AlertDialog'));
 assert.equal(alert().props.open,true);
 assert.equal(text(s.r.find(byType('AlertDialogTitle'))),'You already have two currencies');
 assert.equal(text(s.r.find(byType('AlertDialogDescription'))),'You can keep up to two preferred currencies. Choose which one JPY replaces.');
 assert.deepEqual(s.r.all(byType('AlertDialogAction')).map(text),['Replace USD','Replace EUR']);
 assert.equal(text(s.r.find(byType('AlertDialogCancel'))),'Cancel');
 s.r.fire(s.r.find(byText('AlertDialogAction','Replace EUR')),'onClick');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD','JPY']);
 s.r.fire(alert(),'onOpenChange',true);assert.equal(alert().props.open,true,'opening keeps the notice');
 s.r.fire(alert(),'onOpenChange',false);assert.equal(alert().props.open,false);
 // Nothing matches.
 s.r.fire(search(),'onChange',{target:{value:'zzzz'}});
 assert.equal(text(s.r.find(node=>node.props.role==='status')),'No matching currencies.');
 s.r.fire(dialog(),'onOpenChange',false);
 assert.equal(search().props.value,'','closing clears the search');
 assert.equal(dialog().props.open,false);
 // Clearing back to one, then trying to clear the last one.
 s.r.fire(s.r.find(node=>node.type==='label'&&text(node).startsWith('JPY')).children[0],'onChange');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD']);
 s.r.fire(s.r.find(node=>node.type==='label'&&text(node).startsWith('USD')).children[0],'onChange');
 assert.equal(text(s.r.find(byType('AlertDialogTitle'))),'Keep at least one currency');
 assert.equal(text(s.r.find(byType('AlertDialogDescription'))),'USD is your only currency, so it can’t be cleared. Pick another currency first.');
 assert.deepEqual(s.r.all(byType('AlertDialogAction')).map(text),['OK']);
});

test('running the welcome setup again waits for saves and reports a failure',async t=>{
 let finish;const runs=[];
 const s=panel(t,{onRestartSetup:()=>{runs.push(true);return new Promise((resolve,reject)=>{finish={resolve,reject};});}});
 const button=()=>s.r.find(byText('Button','Run setup again'));
 assert.equal(button().props.disabled,false);
 s.r.fire(button(),'onClick');
 assert.equal(button().props.disabled,true,'busy while the setup restarts');
 finish.reject(Error('Could not restart setup.'));await s.settle();
 assert.deepEqual(s.errors,['Could not restart setup.']);
 assert.equal(button().props.disabled,false);
 s.r.fire(button(),'onClick');finish.resolve();await s.settle();
 assert.equal(runs.length,2);assert.equal(s.errors.length,1);
 // An unsaved change disables it.
 s.r.fire(s.r.find(node=>node.props.id==='profile-name'),'onChange',{target:{value:'Ada L'}});
 assert.equal(button().props.disabled,true);
 assert.equal(panel(t,{onRestartSetup:undefined}).r.all(byText('Button','Run setup again')).length,0);
});
