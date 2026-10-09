import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,host,hostModule,language,text} from './helpers/component-tree.mjs';

// RES-002: leaving the Assistant stops the paid question in flight; a stopped question is no error.
function setup(answer){
 const asked=[];
 const previous={fetch:globalThis.fetch,frame:globalThis.requestAnimationFrame};
 globalThis.requestAnimationFrame=()=>0;
 globalThis.fetch=async(url,init={})=>{
  if((init.method??'GET')==='GET')return Response.json({available:true});
  asked.push(init);return answer(init);
 };
 const renderer=createRenderer();
 const {AssistantScreen}=renderer.load('components/workspace/screens/assistant-screen.tsx',{
  '@/components/language-provider':language(),
  '@/components/workspace/workspace-provider':{useWorkspace:()=>({user:'owner',demo:false,currency:'USD',market:null})},
  '@/components/presentation-foundation/empty-state':{EmptyState:host('empty-state')},
  '@/components/presentation-foundation/page-header':{PageHeader:host('header')},
  '@/components/ui/button':{Button:host('button')},
  'lucide-react':hostModule(),
 });
 renderer.mount(renderer.react.createElement(AssistantScreen));
 const restore=()=>{globalThis.fetch=previous.fetch;globalThis.requestAnimationFrame=previous.frame;};
 const ask=async question=>{
  renderer.find(node=>node.type==='textarea').props.onChange({currentTarget:{value:question}});renderer.update();
  renderer.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});renderer.update();
 };
 const alert=()=>renderer.all(node=>node.props?.role==='alert').map(text);
 return {renderer,asked,ask,alert,restore};
}
/** A request that never answers until it is aborted, as fetch does. */
const hanging=init=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));

test('leaving the assistant aborts the question in flight without an error or a rewound conversation',async()=>{
 const view=setup(hanging);
 try{
  await view.renderer.flush();
  await view.ask('Where did my money go?');
  assert.equal(view.asked.length,1);assert.ok(view.asked[0].signal instanceof AbortSignal,'the question carries a signal');
  assert.equal(view.asked[0].signal.aborted,false);
  view.renderer.unmount();
  assert.equal(view.asked[0].signal.aborted,true,'unmounting stops the paid call');
  await view.renderer.flush();
  assert.deepEqual(view.alert(),[],'no error for a question stopped on purpose');
  assert.equal(view.renderer.find(node=>node.type==='textarea').props.value,'','the question is not put back in the box');
 }finally{view.restore();}
});

test('a question that really fails still shows its error and gives the question back',async()=>{
 const view=setup(async()=>Response.json({error:'The assistant could not answer. Please try again.'},{status:502}));
 try{
  await view.renderer.flush();
  await view.ask('How much did I spend?');
  await view.renderer.flush();
  assert.deepEqual(view.alert(),['The assistant could not answer. Please try again.']);
  assert.equal(view.renderer.find(node=>node.type==='textarea').props.value,'How much did I spend?');
 }finally{view.restore();}
});
