import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const styles=new Proxy({},{get:(_,key)=>String(key)});
function render(state){
 // useState is called in a fixed order: step, phone, code, busy, error, wait, country.
 const order=['step','phone','code','busy','error','wait','country'];let call=0;
 const {PhoneSignIn}=loadTS('components/phone-sign-in.tsx',{
  react:{...React,useState(initial){const key=order[call++%order.length];return [key in state?state[key]:initial,()=>{}];}},
  './sign-in-screen.module.css':styles,
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(key,values={})=>key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name)})},
  '@/components/ui/button':{Button:props=>React.createElement('button',{...props,variant:undefined})},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  '@/lib/feedback':{showNotice:()=>{}},
  'lucide-react':{ArrowRight:()=>null,ArrowLeft:()=>null},
  '@/components/phone-number-field':{PhoneNumberField:({id,country,national})=>React.createElement('input',{id,type:'tel','data-country':country,value:national,readOnly:true})},
 });
 return renderToStaticMarkup(React.createElement(PhoneSignIn,{botUsername:state.bot===undefined?'hoggish_bot':state.bot,onBack:()=>{}}));
}
test('the phone step asks for the number, explains where the code goes and links to the bot',()=>{
 const html=render({});
 assert.match(html,/<label for="signin-phone">Phone number<\/label>/);
 assert.match(html,/<input id="signin-phone" type="tel"/,'the country picker and number field');
 assert.ok(html.includes('We send a code to your Telegram chat. No account yet? Open our bot to create one.'));
 assert.match(html,/<a href="https:\/\/t\.me\/hoggish_bot"[^>]*>Open the bot<\/a>/);
 assert.ok(html.includes('Send code</button>')||html.includes('Send code<svg'));
 assert.ok(html.includes('Back</button>'));assert.ok(!html.includes('Use email instead'));assert.ok(!html.includes('signin-code'));
 assert.ok(!render({bot:null}).includes('t.me/'),'no bot link without a bot name');
});
test('the code step takes a one-time numeric code and offers a different number',()=>{
 const html=render({step:'code',phone:'+998901234567'});
 assert.match(html,/<label for="signin-code">Code<\/label>/);
 assert.match(html,/inputMode="numeric"/);assert.match(html,/autoComplete="one-time-code"/);assert.match(html,/pattern="\[0-9\]\{4,10\}"/);
 assert.ok(html.includes('Enter the code we sent to your Telegram chat.'));
 assert.ok(html.includes('Verify'));assert.ok(html.includes('Use a different number'));assert.ok(!html.includes('signin-phone'));
});
test('a failure is shown as a translated alert',()=>{
 assert.match(render({step:'code',error:'The code is wrong or has expired.'}),/role="alert">The code is wrong or has expired\.<\/p>/);
});
test('the sign-in page shows phone sign-in only when the server reports it, and the Telegram landing page signs in once',()=>{
 const choices=fs.readFileSync('components/auth-card.tsx','utf8');
 assert.match(choices,/const phone = usePhoneSignIn\(\);/);assert.match(fs.readFileSync('hooks/use-phone-sign-in.ts','utf8'),/fetch\('\/api\/auth\/phone'/);assert.match(choices,/\{phone\.enabled && <Button/);
 // Choosing phone leaves only the phone form: no Google, divider, email form, sign-up link or sample workspace.
 assert.match(choices,/if \(byPhone\) return <PhoneSignIn botUsername=\{phone\.botUsername\} onBack=\{\(\) => setByPhone\(false\)\}\/>;/);
 for(const file of ['components/sign-in-screen.tsx','components/account-access-card.tsx']){const source=fs.readFileSync(file,'utf8');assert.match(source,/<SampleInvite[^>]*\/>\s*<\/ProviderChoices>/,file);}
 const page=fs.readFileSync('app/auth/telegram/page.tsx','utf8');
 assert.match(page,/fetch\('\/api\/auth\/telegram'/);assert.match(page,/https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
 assert.match(page,/started\.current/,'the sign-in runs once even if the effect repeats');
 assert.match(page,/query\.get\('t'\)/);assert.match(page,/webApp\?\.initData/);
 assert.ok(!/localStorage|document\.cookie/.test(page),'no credential is kept in the page');
});

test('the code step offers a new code once the minute between codes has passed',()=>{
 const waiting=render({step:'code',phone:'+998901234567',wait:42});
 assert.match(waiting,/<button[^>]*disabled=""[^>]*>Send a new code in 42 s<\/button>/);
 const ready=render({step:'code',phone:'+998901234567',wait:0});
 assert.match(ready,/<button[^>]*>Send a new code<\/button>/);assert.doesNotMatch(ready,/disabled="">Send a new code/);
 assert.doesNotMatch(render({}),/Send a new code/,'the phone step has no resend');
 assert.equal(loadTS('components/phone-sign-in.tsx',{'./sign-in-screen.module.css':{}}).resendSeconds,60);
});


test('phone numbers take a country with its flag and dialing code, and a pasted international number picks the country',()=>{
 const {phoneCountries,dialCode,dialLabel,countryFlag,splitInternational,internationalPhone,browserPhoneCountry}=loadTS('lib/phone-countries.ts');
 assert.ok(phoneCountries.length>230);assert.ok(!phoneCountries.includes('AQ')&&!phoneCountries.includes('BV'));
 assert.equal(dialCode('US'),'1');assert.equal(dialCode('UZ'),'998');assert.equal(dialCode('GB'),'44');assert.equal(dialCode('DE'),'49');
 assert.equal(dialLabel('AS'),'+1 684');assert.equal(dialLabel('US'),'+1');assert.equal(dialLabel('UZ'),'+998');
 assert.equal(countryFlag('JP'),'🇯🇵');assert.equal(countryFlag('br'),'🇧🇷');
 assert.deepEqual({...splitInternational('+998 90 123 45 67')},{country:'UZ',national:'901234567'});
 assert.deepEqual({...splitInternational('0049 151 2345678')},{country:'DE',national:'1512345678'});
 assert.equal(splitInternational('+1 416 555 0100','CA').country,'CA','a chosen country sharing the code is kept');
 assert.equal(splitInternational('+1 212 555 0100','DE').country,'US');
 assert.equal(splitInternational('+7 701 000 0000','KZ').country,'KZ');
 assert.equal(splitInternational('+1 268 555 0100').country,'AG','the longest code wins');
 assert.equal(splitInternational('555 0100'),null,'a national number keeps the chosen country');
 assert.deepEqual({...splitInternational('+9','GB')},{country:'GB',national:'+9'},'typing +9 keeps the plus until +998 completes a code');
 assert.equal(internationalPhone('GB','+99'),'+99','a number still in + form is sent as typed');
 assert.equal(internationalPhone('GB','07700 900123'),'+447700900123','the domestic trunk zero is dropped');
 assert.equal(internationalPhone('IT','06 1234 5678'),'+390612345678','Italy keeps its leading zero');
 assert.equal(browserPhoneCountry(['en-US','fr']),'US');assert.equal(browserPhoneCountry(['uz','pt-BR']),'BR');assert.equal(browserPhoneCountry(['en','fr']),'','no region, no guess');
});
