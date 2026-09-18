import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
function render(settings,deletion=false){
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{
  react:{...React,useEffect(){},useState(initial){return [typeof initial==='object'?{signup:false,deletion}:initial,()=>{}];}},
  'next/navigation':{useRouter:()=>({})},
  'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key})},
  '@/components/ui/button':{Button:props=>React.createElement('button',props)},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
 });
 return renderToStaticMarkup(React.createElement(AccountAccessPanel,{settings}));
}
test('password-only settings has one explicit submit action and retains all password fields',()=>{
 const html=render(true);
 assert.equal((html.match(/<button/g)||[]).length,1);
 assert.ok(html.includes('Change password</button>'));
 assert.ok(!html.includes('Continue'));
 assert.equal((html.match(/type="password"/g)||[]).length,3);
});
test('multiple account actions remain selectable when deletion is enabled',()=>{
 const html=render(true,true);
 assert.ok(html.includes('Delete account</button>'));
 assert.equal((html.match(/<button/g)||[]).length,3);
});
test('account recovery remains available without redundant single-mode navigation',()=>{
 const html=render(false);
 assert.ok(html.includes('type="email"'));
 assert.equal((html.match(/<button/g)||[]).length,1);
 assert.ok(html.includes('Continue</button>'));
});
