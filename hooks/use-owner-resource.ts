"use client";
import { showSaved } from '@/lib/feedback';
import { useEffect,useRef,useState } from 'react';
import { refreshRead } from '@/lib/refresh-read';
import { requestJson } from '@/lib/api-client';

type SharedRead={url:string;controller:AbortController;readers:number;reply:Promise<{ok:boolean;text:string}>};
const sharedReads=new Map<string,SharedRead>();
/** Identical reads share one request while it is under way, and each reader parses its own copy of the reply. The key
 * names the owner, the URL and the revision the reader asks for, so two cards of one screen share a read whenever they
 * start, while a read started after a save (a new revision, a retry, or a save to the same URL) asks again. The request
 * is cancelled once every reader has let go of it, and forgotten when it answers. */
export function sharedRead(key:string,url:string,signal:AbortSignal):Promise<{ok:boolean;text:string}>{
 let read=sharedReads.get(key);
 if(!read){
  const controller=new AbortController(),started:SharedRead={url,controller,readers:0,reply:refreshRead(url,{signal:controller.signal}).then(async response=>({ok:response.ok,text:await response.text()}))};
  sharedReads.set(key,started);read=started;
  const forget=()=>{if(sharedReads.get(key)===started)sharedReads.delete(key);};
  started.reply.then(forget,forget);
 }
 const joined=read;joined.readers++;
 const leave=()=>{if(--joined.readers>0)return;joined.controller.abort();if(sharedReads.get(key)===joined)sharedReads.delete(key);};
 signal.addEventListener('abort',leave,{once:true});
 return joined.reply;
}
/** A save to an address makes the reads of it already under way, whatever their query, out of date: later readers ask again. */
function forgetReads(url:string){const path=url.split('?')[0];for(const [key,read] of sharedReads)if(read.url.split('?')[0]===path)sharedReads.delete(key);}
export function useOwnerResource<T>(url:string,owner:string|null,enabled:boolean,revision:number,empty:T){
 const request=useRef<AbortController|null>(null);
 const current=useRef('');
 const scope=`${owner}:${url}`;
 useEffect(()=>{current.current=enabled&&owner?scope:'';return()=>{current.current='';};},[scope,enabled,owner]);
 const [retryCount,setRetry]=useState(0);
 const key=`${scope}:${revision}:${retryCount}`;
 const [state,setState]=useState<{scope:string;key:string;data:T;error:string}>({scope:'',key:'',data:empty,error:''});
 useEffect(()=>{
  if(!owner||!enabled)return;
  const controller=new AbortController();request.current=controller;
  sharedRead(key,url,controller.signal).then(reply=>{
   const result=JSON.parse(reply.text) as T & {error?:string};
   if(!reply.ok)throw Error(result.error??'Could not load data.');
   if(!controller.signal.aborted)setState({scope,key,data:result,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState(previous=>({scope,key,data:previous.scope===scope?previous.data:empty,error:error.message}));});
  return()=>controller.abort();
 },[url,owner,enabled,key,scope,empty]);
 if((!owner||!enabled)&&state.scope)setState({scope:'',key:'',data:empty,error:''});
 return {
  data:enabled&&state.scope===scope?state.data:empty,
  error:enabled&&state.key===key?state.error:'',
  loading:enabled&&!!owner&&state.key!==key,
  initialLoading:enabled&&!!owner&&state.scope!==scope,
  retry:()=>setRetry(count=>count+1),
  update:(change:(data:T)=>T)=>{if(current.current===scope)setState(previous=>({scope,key,data:change(previous.scope===scope?previous.data:empty),error:''}));},
  invalidate:()=>{if(current.current===scope){request.current?.abort();setRetry(count=>count+1);}},
 };
}
/** Posts `{action,data}` and confirms the save; a failure keeps `confirmedFailure` from `requestJson`. */
export async function saveOwnerResource<T=Record<string,never>>(url:string,action:string,data:unknown){const result=await requestJson<T>(url,{body:{action,data},fallback:'Could not save changes.'});forgetReads(url);showSaved();return result;}
