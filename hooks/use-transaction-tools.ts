"use client";
import { useEffect, useRef, useState } from 'react';
import { emptyTransactionTools, type TransactionTools, type TransactionSplit, type ForecastAssignment } from '@/lib/transaction-tools';
export function useTransactionTools(user:string|null,demo:boolean,revision:number,onSaved:()=>void){
 const request=useRef<AbortController|null>(null);
 const key=`${user}:${demo}:${revision}`;
 const [state,setState]=useState<{key:string;owner:string|null;data:TransactionTools;error:string}>({key:'',owner:null,data:emptyTransactionTools,error:''});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!user||demo)return;
  const controller=new AbortController();request.current=controller;
  fetch('/api/transaction-tools',{signal:controller.signal}).then(async response=>{const data=await response.json() as TransactionTools & {error?:string};if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setState({key,owner:user,data,error:''});}).catch(error=>{if(!controller.signal.aborted)setState(previous=>({key,owner:user,data:previous.owner===user?previous.data:emptyTransactionTools,error:error.message}));});
  return()=>controller.abort();
 },[user,demo,key,retry]);
 if(!user&&!demo&&state.owner!==null)setState({key:'',owner:null,data:emptyTransactionTools,error:''});
 function applyChange(action:string,data:unknown){
  const owner=demo?'demo':user;
  setState(previous=>{
   const next={...(previous.owner===owner?previous.data:emptyTransactionTools)};
   if(action==='split'){const payload=data as {record_id:string;splits:TransactionSplit[]};next.splits=[...next.splits.filter(item=>item.record_id!==payload.record_id),...payload.splits.map((part,position)=>({...part,position,record_id:payload.record_id}))];}
   if(action==='forecast'){const payload=data as ForecastAssignment;next.assignments=[...next.assignments.filter(item=>item.record_id!==payload.record_id),...(payload.account_id?[payload]:[])];}
   return {key,owner,data:next,error:''};
  });
 }
 async function save(action:string,data:unknown){
  if(demo){applyChange(action,data);return;}
  const response=await fetch('/api/transaction-tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
  const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);request.current?.abort();applyChange(action,data);setRetry(value=>value+1);onSaved();
 }
 return {data:state.owner===(demo?'demo':user)?state.data:emptyTransactionTools,error:state.key===key?state.error:'',loading:!!user&&!demo&&state.owner!==user,save,retry:()=>setRetry(value=>value+1)};
}
