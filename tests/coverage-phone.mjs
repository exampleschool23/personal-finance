import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,cssModule,language,text,byText,byType,event} from './helpers/coverage-render.mjs';

const ui={'@/components/ui/button':hostModule(),'@/components/ui/input':hostModule(),'@/components/ui/popover':hostModule(),'@/components/ui/dialog':hostModule(),'@/components/ui/command':hostModule(),'lucide-react':hostModule(),'./sign-in-screen.module.css':cssModule()};

function field({country='UZ',national='',mobile=false}={}){
 const r=createRenderer(),changes=[];
 const state={mobile};
 const {PhoneNumberField}=r.load('components/phone-number-field.tsx',{...ui,'@/components/language-provider':language('en'),'@/hooks/use-mobile':{useIsMobile:()=>state.mobile}});
 const props={id:'phone',country,national,onChange:(next,number)=>changes.push([next,number])};
 const view=(next={})=>r.render(r.react.createElement(PhoneNumberField,Object.assign(props,next)));
 view();
 return {r,changes,view,state,trigger:()=>r.find(node=>node.props.role==='combobox'),items:()=>r.all(byType('CommandItem'))};
}

test('the country trigger shows the flag and code, and the list marks the chosen country',()=>{
 const {r,trigger,items}=field({country:'UZ',national:'90 123 45 67'});
 assert.equal(trigger().props['aria-label'],'Country code: Uzbekistan +998');
 assert.equal(trigger().props['aria-expanded'],false);assert.equal(trigger().props['aria-controls'],undefined);
 assert.match(text(trigger()),/🇺🇿\+998/);
 assert.ok(items().length>150,'every dialable country is listed');
 const chosen=items().filter(item=>item.children.some(child=>child.type==='Check'));
 assert.deepEqual(chosen.map(item=>item.props.value),['UZ']);
 const input=r.find(node=>node.type==='Input');
 assert.equal(input.props.value,'90 123 45 67');assert.equal(input.props.type,'tel');assert.equal(input.props.placeholder,'Enter your phone number');
 assert.equal(r.all(byType('Dialog')).length,0,'desktop uses the popover only');
});

test('without a country the trigger shows a globe and a bare plus',()=>{
 const {trigger}=field({country:''});
 assert.equal(trigger().props['aria-label'],'Country code');
 assert.ok(trigger().children.some(child=>child.type==='Globe'));
 assert.equal(text(trigger()),'+');
});

test('searching filters by name, ISO code or dialing code and clears on close',()=>{
 const {r,trigger,items}=field({country:'US'});
 const popover=()=>r.find(byType('Popover'));
 r.fire(popover(),'onOpenChange',true);
 assert.equal(trigger().props['aria-expanded'],true);assert.equal(trigger().props['aria-controls'],'phone-countries');
 assert.equal(popover().props.open,true);
 const search=()=>r.find(byType('CommandInput'));
 r.fire(search(),'onValueChange','uzbek');
 assert.deepEqual(items().map(item=>item.props.value),['UZ']);
 r.fire(search(),'onValueChange','  de ');
 assert.ok(items().some(item=>item.props.value==='DE'),'an exact ISO code matches');
 r.fire(search(),'onValueChange','+998');
 assert.deepEqual(items().map(item=>item.props.value),['UZ'],'a dialing code with a plus matches');
 r.fire(search(),'onValueChange','zzzz');
 assert.equal(items().length,0);
 assert.equal(text(r.find(byType('CommandEmpty'))),'No matching countries.');
 r.fire(popover(),'onOpenChange',false);
 assert.equal(search().props.value,'','closing clears the search');
 assert.ok(items().length>150);
});

test('picking a country keeps the number and closes the list',()=>{
 const {r,changes,items}=field({country:'US',national:'555 0100'});
 r.fire(r.find(byType('Popover')),'onOpenChange',true);
 r.fire(r.find(byType('CommandInput')),'onValueChange','france');
 r.fire(items()[0],'onSelect');
 assert.deepEqual(changes,[['FR','555 0100']]);
 assert.equal(r.find(byType('Popover')).props.open,false);
 assert.equal(r.find(byType('CommandInput')).props.value,'');
});

test('typing keeps digits and separators; pasting an international number picks its country',()=>{
 const {r,changes}=field({country:'US'});
 const type=value=>r.fire(r.find(byType('Input')),'onChange',{target:{value}});
 type('(555) 01-00 abc');
 type('+998 90 123 45 67');
 type('00 44 20 7946 0958');
 type('+9');
 assert.deepEqual(changes,[['US','(555) 01-00 '],['UZ','901234567'],['GB','2079460958'],['US','+9']]);
});

test('on phones the list opens as a full-screen dialog instead of the popover',()=>{
 const {r,trigger}=field({country:'UZ',mobile:true});
 const dialog=()=>r.find(byType('Dialog'));
 assert.equal(dialog().props.open,false);
 r.fire(dialog(),'onOpenChange',true);
 assert.equal(dialog().props.open,true);assert.equal(r.find(byType('Popover')).props.open,false,'the popover stays closed on phones');
 assert.equal(trigger().props['aria-expanded'],true);
 assert.equal(text(r.find(byType('DialogTitle'))),'Country code');
 assert.equal(r.all(byType('Command')).length,2,'the same picker is inside the dialog');
});

// Phone sign-in drives the real field above.
function signIn(t,{bot='hoggish_bot',visitor={ok:true,body:{country:'GB'}},languages=['en-US'],noNavigator=false}={}){
 t.mock.timers.enable({apis:['setTimeout']});
 const calls=[],notices=[],replaced=[],backs=[];
 const replies=[];
 const fetches=[];
 globalThis.fetch=async url=>{fetches.push(url);if(visitor instanceof Error)throw visitor;return {ok:visitor.ok,json:async()=>visitor.body};};
 const navigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 if(noNavigator)delete globalThis.navigator;
 else Object.defineProperty(globalThis,'navigator',{value:{languages,language:languages?.[0]??'en-US'},configurable:true,writable:true});
 globalThis.window={location:{replace:url=>replaced.push(url)}};
 t.after(()=>{delete globalThis.fetch;delete globalThis.window;Object.defineProperty(globalThis,'navigator',navigator);});
 const r=createRenderer();
 const {PhoneSignIn,resendSeconds}=r.load('components/phone-sign-in.tsx',{...ui,
  '@/components/language-provider':language('en'),'@/hooks/use-mobile':{useIsMobile:()=>false},
  '@/lib/feedback':{showNotice:message=>notices.push(message)},
  '@/lib/api-client':{requestJson:async(url,options)=>{calls.push([url,options.body]);assert.equal(options.fallback,'Account service is unavailable. Please try again.');const reply=replies.shift();if(reply instanceof Error)throw reply;return reply??{};}},
 });
 r.render(r.react.createElement(PhoneSignIn,{botUsername:bot,onBack:()=>backs.push(true)}));
 const submit=()=>r.fireAsync(r.find(byType('form')),'onSubmit',event());
 return {r,calls,notices,replaced,backs,replies,fetches,submit,resendSeconds,country:()=>r.find(node=>node.props.role==='combobox').props['aria-label']};
}

test('the starting country comes from the browser, then from the visitor country service',async t=>{
 const s=signIn(t,{languages:['en-US']});
 assert.equal(s.country(),'Country code: United States +1');
 await s.r.flush();
 assert.deepEqual(s.fetches,['/api/visitor-country']);
 assert.equal(s.country(),'Country code: United Kingdom +44');
 assert.equal(s.r.find(node=>node.type==='a').props.href,'https://t.me/hoggish_bot');
 s.r.fire(s.r.find(byText('Button','Back')),'onClick');
 assert.equal(s.backs.length,1);
});

test('the country service failing, answering badly or without a country keeps the browser guess',async t=>{
 for(const visitor of [Error('offline'),{ok:false,body:{}},{ok:true,body:{}}]){
  await t.test(String(visitor.ok??visitor.message),async t=>{
   const s=signIn(t,{visitor,languages:['de-DE']});
   await s.r.flush();
   assert.equal(s.country(),'Country code: Germany +49');
  });
 }
});

test('without a browser navigator the field starts without a country and sends nothing until one is known',async t=>{
 const s=signIn(t,{noNavigator:true,visitor:{ok:true,body:{}},bot:null});
 assert.equal(s.country(),'Country code');
 assert.equal(s.r.all(node=>node.type==='a').length,0,'no bot link without a bot name');
 await s.r.flush();
 s.replies.push({});
 await s.submit();
 assert.deepEqual(s.calls,[['/api/auth/phone',{action:'send',phone:''}]]);
});

test('a country the person picks is kept even when the visitor country arrives later',async t=>{
 const s=signIn(t,{languages:['en-US']});
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'+998 90 123 45 67'}});
 await s.r.flush();
 assert.equal(s.country(),'Country code: Uzbekistan +998');
 assert.deepEqual(s.fetches,['/api/visitor-country'],'the effect does not ask again once a country is chosen');
 // Typing in the same country does not count as a choice of country.
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'90 123 45 68'}});
 assert.equal(s.r.find(byType('Input')).props.value,'90 123 45 68');
});

test('sending a code moves to the code step, counts down and lets the person resend',async t=>{
 const s=signIn(t,{visitor:{ok:true,body:{country:'UZ'}}});
 await s.r.flush();
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'90 123 45 67'}});
 s.replies.push({message:'Code sent to Telegram.'});
 await s.submit();
 assert.deepEqual(s.calls,[['/api/auth/phone',{action:'send',phone:'+998901234567'}]]);
 assert.deepEqual(s.notices,['Code sent to Telegram.']);
 const code=()=>s.r.find(node=>node.props.id==='signin-code');
 assert.equal(code().props.autoComplete,'one-time-code');
 const resend=()=>s.r.find(node=>node.type==='Button'&&node.props.variant==='outline');
 assert.equal(text(resend()),'Send a new code in 60 s');assert.equal(resend().props.disabled,true);
 assert.equal(s.resendSeconds,60);
 // Resending while the timer runs does nothing.
 await s.r.fireAsync(resend(),'onClick');assert.equal(s.calls.length,1);
 t.mock.timers.tick(1000);s.r.update();
 assert.equal(text(resend()),'Send a new code in 59 s');
 for(let i=0;i<59;i++){t.mock.timers.tick(1000);s.r.update();}
 assert.equal(text(resend()),'Send a new code');assert.equal(resend().props.disabled,false);
 s.r.fire(code(),'onChange',{target:{value:'12-34 x'}});
 assert.equal(code().props.value,'1234','only digits are kept');
 s.replies.push({});
 await s.r.fireAsync(resend(),'onClick');
 assert.deepEqual(s.calls[1],['/api/auth/phone',{action:'send',phone:'+998901234567'}]);
 assert.equal(code().props.value,'','resending clears the typed code');
 assert.equal(s.notices.length,1,'no notice without a message');
 assert.equal(text(resend()),'Send a new code in 60 s');
});

test('a failed resend shows the error and allows another try',async t=>{
 const s=signIn(t,{visitor:{ok:true,body:{country:'UZ'}}});
 await s.r.flush();
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'901234567'}});
 s.replies.push({});
 await s.submit();
 for(let i=0;i<60;i++){t.mock.timers.tick(1000);s.r.update();}
 s.replies.push(Error('Too many requests'));
 await s.r.fireAsync(s.r.find(byText('Button','Send a new code')),'onClick');
 assert.equal(text(s.r.find(node=>node.props.role==='alert')),'Too many requests');
 assert.equal(s.r.find(byText('Button','Send a new code')).props.disabled,false);
});

test('verifying signs in with a full page load; a wrong code shows an alert',async t=>{
 const s=signIn(t,{visitor:{ok:true,body:{country:'UZ'}}});
 await s.r.flush();
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'901234567'}});
 s.replies.push({});
 await s.submit();
 s.r.fire(s.r.find(node=>node.props.id==='signin-code'),'onChange',{target:{value:'0000'}});
 s.replies.push(Error('Invalid code'));
 await s.submit();
 assert.equal(text(s.r.find(node=>node.props.role==='alert')),'Invalid code');
 assert.deepEqual(s.replaced,[]);
 s.r.fire(s.r.find(node=>node.props.id==='signin-code'),'onChange',{target:{value:'123456'}});
 s.replies.push({});
 await s.submit();
 assert.deepEqual(s.calls.at(-1),['/api/auth/phone',{action:'verify',phone:'+998901234567',code:'123456'}]);
 assert.deepEqual(s.replaced,['/']);
 assert.equal(s.r.all(node=>node.props.role==='alert').length,0,'the error clears on a new attempt');
});

test('a different number returns to the phone step; a busy form ignores a second submit',async t=>{
 const s=signIn(t,{visitor:{ok:true,body:{country:'UZ'}}});
 await s.r.flush();
 s.r.fire(s.r.find(byType('Input')),'onChange',{target:{value:'901234567'}});
 s.replies.push(Error('Account service is unavailable. Please try again.'));
 await s.submit();
 assert.equal(text(s.r.find(node=>node.props.role==='alert')),'Account service is unavailable. Please try again.');
 assert.equal(s.r.all(node=>node.props.id==='signin-code').length,0,'a failed send stays on the phone step');
 s.replies.push({});
 await s.submit();
 s.r.fire(s.r.find(byText('Button','Use a different number')),'onClick');
 assert.ok(s.r.find(node=>node.props.htmlFor==='signin-phone'));
 assert.equal(s.r.find(byType('Input')).props.value,'901234567','the number is kept');
 // Two submits in a row: the second sees the form busy and sends nothing.
 let release;s.replies.push(new Promise(resolve=>{release=resolve;}).then(()=>({})));
 const form=s.r.find(byType('form'));
 const first=form.props.onSubmit(event());s.r.update();
 assert.equal(s.r.find(byType('form')).props['aria-busy'],true);
 await s.r.find(byType('form')).props.onSubmit(event());
 release();await first;await s.r.flush();
 assert.equal(s.calls.length,3);
});
