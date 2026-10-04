// A tiny DOM-free renderer for component coverage tests. It expands function components into a tree of host nodes,
// keeps hook state per component position, runs effects after each render and lets tests call event handlers.
// UI-kit modules are replaced by `hostModule`, whose members render as named host nodes that keep their props.
import {loadTS} from './load-ts.mjs';

const Fragment=Symbol.for('fake.fragment');
const element=(type,props,key)=>({$$fake:true,type,props:props??{},key:key??null});

/** A module whose every export is a host node named after it (Button, Popover, ...). */
export const hostModule=(extra={})=>new Proxy(extra,{get:(target,name)=>name in target?target[name]:name==='__esModule'||typeof name==='symbol'?undefined:String(name)});
/** A CSS module whose class names are their keys. */
export const cssModule=()=>new Proxy({},{get:(_,name)=>name==='__esModule'||typeof name==='symbol'?undefined:name==='default'?cssModule():String(name)});
/** English-like translator that fills {placeholders}. */
export const translate=(text,values={})=>String(text).replace(/\{(\w+)\}/g,(match,key)=>key in values?String(values[key]):match);
export const language=(locale='en')=>({useLanguage:()=>({t:translate,locale,language:locale})});

export function createRenderer(){
 const instances=new Map();let current=null,cursor=0,dirty=false;const pending=[];let rendered=new Set();
 const slot=()=>{const index=cursor++;return [current,index];};
 const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const react={
  Fragment,
  createElement:(type,props,...children)=>element(type,{...props,...(children.length?{children:children.length===1?children[0]:children}:{})},props?.key),
  useState(initial){const [instance,index]=slot();if(!(index in instance.hooks))instance.hooks[index]=typeof initial==='function'?initial():initial;
   return [instance.hooks[index],value=>{const next=typeof value==='function'?value(instance.hooks[index]):value;if(!Object.is(next,instance.hooks[index])){instance.hooks[index]=next;dirty=true;}}];},
  useRef(initial){const [instance,index]=slot();return instance.hooks[index]??(instance.hooks[index]={current:initial});},
  useMemo(factory,deps){const [instance,index]=slot();const old=instance.hooks[index];if(changed(old?.deps,deps))instance.hooks[index]={deps,value:factory()};return instance.hooks[index].value;},
  useCallback(callback,deps){return react.useMemo(()=>callback,deps);},
  useEffect(effect,deps){const [instance,index]=slot();const old=instance.hooks[index];if(changed(old?.deps,deps)){instance.hooks[index]={deps,cleanup:old?.cleanup};pending.push(()=>{const hook=instance.hooks[index];hook.cleanup?.();hook.cleanup=effect();});}},
  useId(){const [instance,index]=slot();return instance.hooks[index]??(instance.hooks[index]=':r'+index+':');},
  forwardRef:render=>props=>render(props,props.ref),
  memo:component=>component,
 };
 react.useLayoutEffect=react.useEffect;
 const runtime={Fragment,jsx:element,jsxs:element,jsxDEV:element};
 function expand(node,path){
  if(node===null||node===undefined||typeof node==='boolean')return null;
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(Array.isArray(node))return node.map((child,i)=>expand(child,path+'.'+(child?.key??i))).flat().filter(child=>child!==null);
  if(!node.$$fake)return null;
  const {type,props}=node;
  if(type===Fragment)return expand(props.children,path+'~');
  if(typeof type==='function'){
   const id=path+':'+(type.name||'anon');rendered.add(id);
   const instance=instances.get(id)??{hooks:[]};instances.set(id,instance);
   const previous=[current,cursor];current=instance;cursor=0;
   let output;try{output=type(props);}finally{[current,cursor]=previous;}
   return expand(output,id+'>');
  }
  const host={type,props,children:[]};
  host.children=[expand(props.children,path+'/'+String(type))].flat().filter(child=>child!==null);
  return host;
 }
 let root=null,tree=null;
 function update(){
  for(let pass=0;pass<50;pass++){
   dirty=false;rendered=new Set();tree=expand(root,'root');
   for(const [id,instance] of instances)if(!rendered.has(id)){for(const hook of instance.hooks)hook?.cleanup?.();instances.delete(id);}
   while(pending.length)pending.shift()();
   if(!dirty)return tree;
  }
  throw Error('Render loop did not settle');
 }
 const api={
  react,runtime,
  overrides:extra=>({react:react,'react/jsx-runtime':runtime,...extra}),
  load:(file,extra={})=>loadTS(file,api.overrides(extra)),
  render(next){root=next;return update();},
  update,
  get tree(){return tree;},
  async flush(times=6){for(let i=0;i<times;i++){await new Promise(resolve=>setImmediate(resolve));update();}return tree;},
  unmount(){root=null;update();},
  all:(predicate,node=tree)=>collect(node,predicate),
  find(predicate,node=tree){const found=collect(node,predicate);if(!found.length)throw Error('No matching node');return found[0];},
  /** Calls a handler and re-renders; returns the handler's result. */
  fire(node,handler,...args){const result=node.props[handler](...args);update();return result;},
  async fireAsync(node,handler,...args){const result=await node.props[handler](...args);await api.flush();return result;},
 };
 return api;
}
export function collect(node,predicate,out=[]){
 if(!node)return out;
 if(Array.isArray(node)){for(const child of node)collect(child,predicate,out);return out;}
 if(typeof node!=='object')return out;
 if(predicate(node))out.push(node);
 for(const child of node.children)collect(child,predicate,out);
 return out;
}
export const text=node=>!node?'':typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node.children.map(text).join('');
export const byType=type=>node=>node.type===type;
export const byLabel=label=>node=>node.props?.['aria-label']===label;
export const byText=(type,content)=>node=>(!type||node.type===type)&&text(node)===content;
export const event=(extra={})=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra});
