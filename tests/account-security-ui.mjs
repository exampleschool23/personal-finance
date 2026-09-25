import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
function render(settings,deletion=false,mode){
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{
  react:{...React,useEffect(){},useState(initial){return [typeof initial==='object'?{signup:false,deletion}:initial==='change_password'&&mode?mode:initial,()=>{}];}},
  'next/navigation':{useRouter:()=>({})},
  'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key})},
  '@/components/ui/button':{Button:props=>React.createElement('button',props)},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
 });
 return renderToStaticMarkup(React.createElement(AccountAccessPanel,{settings}));
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
