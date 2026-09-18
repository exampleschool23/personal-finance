"use client";
import { useEffect,useRef,useState } from 'react';
export function useOwnerResource<T>(url:string,owner:string|null,enabled:boolean,revision:number,empty:T){
 const request=useRef<AbortController|null>(null);const [retryCount,setRetry]=useState(0);
 const key=`${owner}:${revision}:${retryCount}`;
 const [state,setState]=useState<{owner:string|null;key:string;data:T;error:string}>({owner:null,key:'',data:empty,error:''});
 useEffect(()=>{if(!owner||!enabled)return;const controller=new AbortController();request.current=controller;fetch(url,{signal:controller.signal}).then(async response=>{const result=await response.json() as T & {error?:string};if(!response.ok)throw Error(result.error??'Could not load data.');if(!controller.signal.aborted)setState({owner,key,data:result,error:''});}).catch(error=>{if(!controller.signal.aborted)setState(previous=>({owner,key,data:previous.owner===owner?previous.data:empty,error:error.message}));});return()=>controller.abort();},[url,owner,enabled,key,empty]);
 if(!owner&&state.owner!==null)setState({owner:null,key:'',data:empty,error:''});
 return {data:enabled&&state.owner===owner?state.data:empty,error:state.key===key?state.error:'',loading:enabled&&!!owner&&state.key!==key,retry:()=>setRetry(count=>count+1),invalidate:()=>{request.current?.abort();setRetry(count=>count+1);}};
}
export async function saveOwnerResource(url:string,action:string,data:unknown){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});const result=await response.json() as {error?:string};if(!response.ok)throw Object.assign(Error(result.error??'Could not save changes.'),{confirmedFailure:response.status<500});return result;}
