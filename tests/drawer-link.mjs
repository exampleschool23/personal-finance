import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {DrawerLink}=loadTS('components/drawer-link.tsx',{'next/link':{default:'a',__esModule:true}});
test('Shift-click opens the drawer destination in a new tab without navigating the current tab',()=>{
 const calls=[];
 const previous=globalThis.window;
 globalThis.window={open:(...args)=>calls.push(args)};
 try{
  const link=DrawerLink({href:'/accounts',children:'Accounts'});
  let prevented=false;
  link.props.onClick({shiftKey:true,button:0,defaultPrevented:false,currentTarget:{href:'https://example.test/accounts'},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.deepEqual(calls,[['https://example.test/accounts','_blank','noopener,noreferrer']]);
  for(const modifiers of [{shiftKey:false,button:0},{shiftKey:false,button:0,ctrlKey:true},{shiftKey:false,button:0,metaKey:true},{shiftKey:true,button:1},{shiftKey:true,button:0,defaultPrevented:true}]){
   link.props.onClick({...modifiers,currentTarget:{href:'https://example.test/accounts'},preventDefault(){assert.fail('Preserve native link behavior');}});
  }
  assert.equal(calls.length,1);
 }finally{globalThis.window=previous;}
});
