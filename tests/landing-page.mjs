import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
const seen=new Set();
function render({bot=null,error='',busy=false}={}){
 const {LandingPage}=loadTS('components/landing-page.tsx',{
  './landing-page.module.css':{},
  'next/link':{__esModule:true,default:props=>React.createElement('a',props)},
  '@/components/language-provider':{useLanguage:()=>({language:'en',locale:'en-US',t:(key,values={})=>{seen.add(key);return key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name);}})},
  '@/components/ui/button':{Button:props=>props.asChild?props.children:React.createElement('button',{type:props.type,disabled:props.disabled},props.children)},
  '@/hooks/use-phone-sign-in':{usePhoneSignIn:()=>({enabled:!!bot,botUsername:bot})},
 });
 return renderToStaticMarkup(React.createElement(LandingPage,{brand:React.createElement('span',null,'brand'),preferences:null,busy,error,onDemo:()=>{}}));
}

test('the landing page leads to sign-in, sign-up, the sample workspace and the legal pages',()=>{
 const html=render();
 assert.equal((html.match(/<h1/g)||[]).length,1);
 assert.equal((html.match(/href="\/sign-in"/g)||[]).length,2,'nav and footer');
 assert.equal((html.match(/href="\/auth\/access\?mode=signup"/g)||[]).length,4,'nav, hero, closing band and footer');
 assert.equal((html.match(/>Explore sample workspace<\/button>/g)||[]).length,2);
 assert.match(html,/href="\/terms"/);assert.match(html,/href="\/privacy"/);
 for(const anchor of ['features','how-it-works','privacy']){assert.ok(html.includes(`href="#${anchor}"`),anchor);assert.ok(html.includes(`id="${anchor}"`),anchor);}
 assert.match(html,/aria-pressed="true"[^>]*>.*?Track/);
 assert.equal((html.match(/aria-pressed="false"/g)||[]).length,3);
});

test('sample figures are whole amounts through the shared formatters, and every label is translated',()=>{
 const html=render({bot:'hoggish_bot'});
 assert.ok(html.includes('$84,250'));assert.ok(html.includes('+2.4%'));assert.ok(html.includes('\u2212$96,000'));
 assert.ok(!/\$\d[\d,]*\.\d/.test(html),'no decimal remainders');
 assert.ok(html.includes('Sample data'));
 const source=fs.readFileSync('components/landing-page.tsx','utf8');
 assert.ok(!/toLocaleString|toFixed|new Intl\./.test(source));
 for(const key of seen)assert.ok(key in en,key);
});

test('the Telegram section appears only when the server has a bot, and a failed demo shows its message',()=>{
 assert.ok(!render().includes('Add an expense from a chat'));
 assert.ok(render({bot:'hoggish_bot'}).includes('Add an expense from a chat'));
 assert.match(render({error:'Connection unavailable. Please try again.'}),/role="alert">Connection unavailable\. Please try again\.<\/p>/);
 assert.equal((render({busy:true}).match(/<button type="button" disabled="">/g)||[]).length,2);assert.ok(!render().includes('disabled'));
});

test('signed-out visitors get the tour at the main page and the sign-in card on its own path',()=>{
 const {signInPath,signUpPath}=loadTS('lib/sign-in-path.ts');
 assert.equal(signInPath,'/sign-in');assert.equal(signUpPath,'/auth/access?mode=signup');
 assert.ok(fs.existsSync('app/(workspace)/sign-in/page.tsx'));
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8');
 assert.match(shell,/if \(signedOut && pathname === '\/'\)\s*return <LandingPage /);
 assert.match(shell,/if \(signedOut && pathname === signInPath\)\s*return <SignInScreen /);
 assert.match(shell,/if \(!ready \|\| !signedIn \|\| pathname === signInPath \|\| awaitingSettings/);
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 assert.match(provider,/user \|\| demo \? pathname === signInPath : pathname !== '\/' && pathname !== signInPath\)\) router\.replace\('\/'\)/);
 // A failed Google attempt returns to the sign-in card, where the message is shown; success opens the dashboard.
 const {loginRedirect}=loadTS('lib/google-auth.ts');
 assert.equal(loginRedirect('https://app.example','google_failed').headers.get('location'),'https://app.example/sign-in?auth_error=google_failed');
 assert.equal(loginRedirect('https://app.example').headers.get('location'),'https://app.example/');
 for(const file of ['app/auth/telegram/page.tsx','app/connect/telegram/page.tsx','components/account-access-panel.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes('signInPath'),file);
});

test('the server renders the public pages for visitors without session cookies, in their browser language',()=>{
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8');
 // Before the browser's session check, only the server's cookie hint decides; afterwards the real session does.
 assert.match(shell,/const signedOut = ready \? !signedIn : visitor\.signedOut;/);
 assert.match(shell,/<LanguageProvider initial=\{visitor\.language\}>/);
 const hint=fs.readFileSync('components/visitor-hint.tsx','utf8');
 assert.match(hint,/signedOut: !jar\.has\('hf_access'\) && !jar\.has\('hf_refresh'\)/);
 assert.ok(!hint.includes('use client'),'reads the request, so it stays on the server');
 assert.match(fs.readFileSync('app/(workspace)/layout.tsx','utf8'),/<VisitorHint><Workspace>\{children\}<\/Workspace><\/VisitorHint>/);
 const session=fs.readFileSync('lib/supabase.ts','utf8');
 assert.match(session,/c\.set\('hf_access'/);assert.match(session,/c\.set\('hf_refresh'/);
 const {acceptedLanguages,detectLanguage}=loadTS('lib/i18n.ts');
 assert.deepEqual(acceptedLanguages('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5'),['fr-CH','fr','en','de']);
 assert.deepEqual(acceptedLanguages('en;q=0.4, ru;q=0.9, uz'),['uz','ru','en']);
 assert.deepEqual(acceptedLanguages('de;q=0, ja;q=abc, ko'),['ko']);
 assert.deepEqual(acceptedLanguages(null),[]);assert.deepEqual(acceptedLanguages(''),[]);
 assert.equal(detectLanguage(acceptedLanguages('xx, es-419;q=0.9, en;q=0.8')),'es-MX');
 assert.equal(detectLanguage(acceptedLanguages(undefined)),'en','crawlers that send no language get English');
 const html=render();
 assert.match(html,/^<div lang="en" dir="ltr">/);
});
