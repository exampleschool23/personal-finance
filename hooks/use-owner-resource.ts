"use client";
import { showSaved } from '@/lib/save-feedback';
import { useEffect,useRef,useState } from 'react';
import { refreshRead } from '@/lib/refresh-read';

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
  refreshRead(url,{signal:controller.signal}).then(async response=>{
   const result=await response.json() as T & {error?:string};
   if(!response.ok)throw Error(result.error??'Could not load data.');
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
export async function saveOwnerResource(url:string,action:string,data:unknown){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});const result=await response.json() as {error?:string};if(!response.ok)throw Object.assign(Error(result.error??'Could not save changes.'),{confirmedFailure:response.status<500});showSaved();return result;}
