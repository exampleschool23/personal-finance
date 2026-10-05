import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
import {workspaceSource} from './helpers/workspace-source.mjs';

const en=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
const seen=new Set();
function render({bot=null,error='',busy=false}={}){
 const {LandingPage}=loadTS('components/landing-page.tsx',{
  './landing-page.module.css':{},'./app-preview.module.css':{},
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
 assert.ok(html.includes('\u2212$96,000'));
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
 const provider=workspaceSource();
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

test('the hero and the pillars show the real app in its sample workspace, not a drawing of it',()=>{
 assert.match(render(),/Compare your returns with other investments/);
 const source=fs.readFileSync('components/landing-page.tsx','utf8');
 assert.match(source,/<AppPreview eager tour=\{heroTour\}\/>/,'the hero steps through the app like a video');
 assert.match(source,/<AppPreview path=\{pillarPaths\[active\.key\]\}\/>/,'each pillar opens its own screen');
 assert.match(source,/const pillarPaths: Record<Pillar, string> = \{ track: '\/', budget: '\/budget', plan: '\/goals', invest: '\/assets' \};/);
 const {sections}=loadTS('components/workspace/navigation.ts');
 const paths=new Set(sections.map(section=>section.path));
 for(const path of [...source.matchAll(/'(\/[a-z-]*)'/g)].map(match=>match[1]).filter(path=>!['/terms','/privacy'].includes(path)))assert.ok(paths.has(path),`a real screen: ${path}`);
 assert.ok(!fs.existsSync('components/landing-replay.tsx')&&!fs.existsSync('components/landing-dashboard.tsx'),'no hand-drawn copy of the dashboard');
 // The server sends no frame: the preview loads in the browser, and never inside another preview.
 assert.ok(!render().includes('<iframe'));
});

test('an app preview opens only the sample workspace and only drawer screens',()=>{
 const {isPreviewFrame,previewPath,isPreviewReady,previewOpen,previewReady,previewSource}=loadTS('lib/app-preview.ts');
 assert.equal(previewSource,'/?preview=1');
 assert.equal(isPreviewFrame('?preview=1',true),true);
 assert.equal(isPreviewFrame('?preview=1',false),false,'a visit to the address itself is a normal visit');
 assert.equal(isPreviewFrame('',true),false);
 assert.equal(previewPath(previewOpen('/budget')),'/budget');
 for(const bad of ['/settings?x','https://evil.example','javascript:alert(1)','/api/backup'])assert.equal(previewPath(previewOpen(bad)),null,bad);
 assert.equal(previewPath({type:'open',path:'/budget'}),null,'other senders are ignored');
 assert.equal(previewPath(null),null);
 assert.equal(isPreviewReady(previewReady),true);assert.equal(isPreviewReady({type:'ready'}),false);
 const provider=workspaceSource();
 assert.match(provider,/if \(preview && ready && !user && !demo\) void startDemo\(\);/,'it starts the sample workspace, never an account');
 assert.match(provider,/event\.origin === window\.location\.origin \? previewPath\(event\.data\) : null/,'only this site can move it');
 assert.match(provider,/window\.parent\.postMessage\(previewReady, window\.location\.origin\)/);
 assert.match(fs.readFileSync('components/workspace/workspace-shell.tsx','utf8'),/if \(preview && user\) return null;/,'a signed-in account never shows in a preview');
 const preview=fs.readFileSync('components/app-preview.tsx','utf8');
 assert.match(preview,/if \(window\.self === window\.top\) (?:queueMicrotask\(\(\) => )?setShow\(true\)/,'previews never nest');
 assert.match(preview,/aria-hidden="true"/);assert.match(preview,/tabIndex=\{-1\}/);
 assert.match(preview,/prefers-reduced-motion: reduce/,'the tour stands still for reduced motion');
 assert.match(fs.readFileSync('components/app-preview.module.css','utf8'),/\.frame\{[^}]*pointer-events:none/);
 // This site may frame its own pages for the preview; no other site may frame them.
 const config=fs.readFileSync('next.config.ts','utf8');
 assert.match(config,/\{key:'X-Frame-Options',value:'SAMEORIGIN'\}/);assert.match(config,/frame-ancestors 'self'/);assert.doesNotMatch(config,/frame-ancestors[^;]*(\*|https?:)/);
});
