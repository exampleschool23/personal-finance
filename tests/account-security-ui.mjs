import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
function render(settings,deletion=false,mode,intent,sent=null){
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{
  react:{...React,useEffect(){},useState(initial){return [initial===null?sent:typeof initial==='object'?{signup:false,deletion}:initial==='change_password'&&mode?mode:initial,()=>{}];}},
  'next/navigation':{useRouter:()=>({})},
  'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  '@/components/language-provider':{useLanguage:()=>({t:(key,values={})=>key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name)})},
  'lucide-react':{MailCheck:()=>React.createElement('svg',{className:'mail'})},
  '@/components/ui/button':{Button:props=>React.createElement('button',props)},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
 });
 return renderToStaticMarkup(React.createElement(AccountAccessPanel,{settings,intent}));
}
test('security settings always exposes permanent deletion and retains all password fields',()=>{
 const html=render(true);
 assert.equal((html.match(/<button/g)||[]).length,2);
 assert.ok(html.includes('Delete account</button>'));
 assert.ok(html.includes('This permanently deletes'));
 assert.ok(html.includes('Change password</button>'));
 assert.ok(!html.includes('Continue'));
 assert.equal((html.match(/type="password"/g)||[]).length,3);
});
test('multiple account actions remain selectable when deletion is enabled',()=>{
 const html=render(true,true);
 assert.ok(html.includes('Delete account</button>'));
 assert.equal((html.match(/<button/g)||[]).length,2);
});
test('account recovery remains available without redundant single-mode navigation',()=>{
 const html=render(false);
 assert.ok(html.includes('type="email"'));
 assert.equal((html.match(/<button/g)||[]).length,1);
 assert.ok(html.includes('Continue</button>'));
});

test('deletion requires credentials and explicit confirmation and offers cancellation',()=>{
 const html=render(true,true,'delete_account');
 assert.ok(html.includes('Type DELETE to confirm'));
 assert.ok(html.includes('pattern="DELETE"'));
 assert.ok(html.includes('type="password"'));
 assert.ok(html.includes('Download complete backup'));
 assert.ok(html.includes('Cancel</button>'));
 assert.ok(html.includes('disabled=""'));
 assert.ok(!html.includes('New password'));
 assert.ok(!html.includes('Account deletion is awaiting server setup.'));
});
test('unconfigured deletion stays visible but cannot submit',()=>{
 const html=render(true,false,'delete_account');
 assert.ok(html.includes('Account deletion is awaiting server setup.'));
 assert.ok(html.includes('<fieldset disabled=""'));
 assert.match(html, /<button[^>]*disabled=""[^>]*>Permanently delete account/);
 assert.ok(html.includes('Cancel</button>'));
});

test('creating an account never offers the forgot password form, and recovery never offers sign-up',()=>{
 const signup=render(false,false,undefined,'signup');
 assert.ok(signup.includes('<h2>Create account</h2>'));
 assert.ok(!signup.includes('Forgot password'));
 assert.equal((signup.match(/type="password"/g)||[]).length,2);
 assert.ok(signup.includes('type="email"'));
 assert.ok(signup.includes('Back to sign in'));
 assert.equal((signup.match(/<button/g)||[]).length,1);
 for(const html of [render(false),render(false,false,undefined,'recover')]){
  assert.ok(html.includes('<h2>Forgot password</h2>'));
  assert.ok(!html.includes('Create account'));
  assert.ok(!html.includes('type="password"'));
  assert.ok(!html.includes('unique password'));
  assert.equal((html.match(/<button/g)||[]).length,1);
 }
 assert.ok(signup.includes('unique password'));
});
test('the sign-in links open the matching account page',()=>{
 const source=fs.readFileSync('components/sign-in-screen.tsx','utf8');
 assert.match(source,/href="\/auth\/access\?mode=recover">\{t\('Forgot password\?'\)\}/);
 assert.match(source,/href="\/auth\/access\?mode=signup">\{t\('Create an account'\)/);
 const page=fs.readFileSync('app/auth/access/page.tsx','utf8');
 assert.match(page,/intent=\{query\.get\('mode'\)==='signup'\?'signup':'recover'\}/);
});

test('after sign-up the form gives way to a Check your email screen with the address, a spam note and a way back',()=>{
 const html=render(false,false,undefined,'signup',{mode:'signup',email:'new@example.com'});
 assert.ok(html.includes('<h2>Check your email</h2>'));
 assert.ok(html.includes('We sent a confirmation link to new@example.com. Press it to finish creating your account.'));
 assert.ok(html.includes('check your spam or junk folder'));
 assert.ok(html.includes('Use a different email</button>'));
 assert.ok(html.includes('Back to sign in'));
 assert.ok(!html.includes('<form'));
 assert.ok(!html.includes('type="password"'));
});
test('recovery reveals nothing about whether the account exists',()=>{
 const html=render(false,false,undefined,'recover',{mode:'recover',email:'someone@example.com'});
 assert.ok(html.includes('If an account exists for someone@example.com, we sent a link to reset your password.'));
 assert.ok(!html.includes('<form'));
});
test('results are shown as popups, never as inline text, and the sent screen is translated',()=>{
 const source=fs.readFileSync('components/account-access-panel.tsx','utf8');
 assert.ok(source.includes('showNotice(result.message)'));
 assert.ok(!source.includes('role="status">{t(message)}'));
 for(const language of ['en','ru','uz']){
  const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
  for(const [,,key] of source.matchAll(/\bt\((["'])((?:(?!\1).)+)\1[,)]/g))assert.ok(labels[key],`${language}: ${key}`);
  for(const key of ['We sent a confirmation link to {email}. Press it to finish creating your account.','If an account exists for {email}, we sent a link to reset your password.']){assert.ok(labels[key].includes('{email}'),`${language}: ${key}`);}
 }
});
