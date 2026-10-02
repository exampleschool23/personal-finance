import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const styles=new Proxy({},{get:(_,key)=>String(key)});
function render(state){
 // useState is called in a fixed order: step, phone, code, busy, error, wait.
 const order=['step','phone','code','busy','error','wait'];let call=0;
 const {PhoneSignIn}=loadTS('components/phone-sign-in.tsx',{
  react:{...React,useState(initial){const key=order[call++%order.length];return [key in state?state[key]:initial,()=>{}];}},
  './sign-in-screen.module.css':styles,
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(key,values={})=>key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name)})},
  '@/components/ui/button':{Button:props=>React.createElement('button',{...props,variant:undefined})},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  '@/lib/feedback':{showNotice:()=>{}},
  'lucide-react':{ArrowRight:()=>null},
 });
 return renderToStaticMarkup(React.createElement(PhoneSignIn,{botUsername:state.bot===undefined?'hoggish_bot':state.bot,onUseEmail:()=>{}}));
}
test('the phone step asks for the number, explains where the code goes and links to the bot',()=>{
 const html=render({});
 assert.match(html,/<label for="signin-phone">Phone number<\/label>/);
 assert.match(html,/type="tel"[^>]*autoComplete="tel"|autoComplete="tel"[^>]*type="tel"/);
 assert.ok(html.includes('We send a code to your Telegram chat. No account yet? Open our bot to create one.'));
 assert.match(html,/<a href="https:\/\/t\.me\/hoggish_bot"[^>]*>Open the bot<\/a>/);
 assert.ok(html.includes('Send code</button>')||html.includes('Send code<svg'));
 assert.ok(html.includes('Use email instead'));assert.ok(!html.includes('signin-code'));
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
 const screen=fs.readFileSync('components/sign-in-screen.tsx','utf8');
 assert.match(screen,/const phone = usePhoneSignIn\(\);/);assert.match(fs.readFileSync('hooks/use-phone-sign-in.ts','utf8'),/fetch\('\/api\/auth\/phone'/);assert.match(screen,/\{phone\.enabled && !byPhone &&/);
 assert.match(screen,/byPhone \? <PhoneSignIn botUsername=\{phone\.botUsername\} onUseEmail=/);
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

