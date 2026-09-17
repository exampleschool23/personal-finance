"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { emptyPlanning,type PlanningData } from '@/lib/planning';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { normalizeEntry,type Entry } from '@/lib/finance';
export function usePlanning(user:string|null,demo:boolean,rows:Entry[],revision:number,onSaved:()=>void,holdingAccounts:HoldingAccount[]=[]){
 const key=`${user}:${revision}`;
 const request=useRef<AbortController|null>(null);
 const [state,setState]=useState<{key:string;owner:string|null;data:PlanningData;error:string}>({key:'',owner:null,data:emptyPlanning,error:''});
 // Clear owner data on sign-out before another session can render it.
 if((!user||demo)&&state.owner!==null)setState({key:'',owner:null,data:emptyPlanning,error:''});
 useEffect(()=>{
  if(!user||demo)return;
  const controller=new AbortController();request.current=controller;
  fetch('/api/planning',{signal:controller.signal}).then(async r=>{
   const data=await r.json() as PlanningData & {error?:string};if(!r.ok)throw Error(data.error);
   if(!controller.signal.aborted)setState({key,owner:user,data:{...data,records:data.records.map(normalizeEntry)},error:''});
  }).catch(e=>{if(!controller.signal.aborted)setState(previous=>({key,owner:user,data:previous.owner===user?previous.data:emptyPlanning,error:e.message}));});
  return()=>controller.abort();
 },[user,demo,key]);
 const save=useCallback(async(action:string,payload:unknown)=>{
  if(demo)throw Error('Sign in to save planning changes.');
  const r=await fetch(action==='movement'?'/api/asset-movements':'/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='movement'?payload:{action,data:payload})});
  const data=await r.json() as {error?:string};
  if(!r.ok)throw Object.assign(Error(data.error),{confirmedFailure:r.status<500});
  // A confirmed save supersedes any read that started before it.
  request.current?.abort();
  if((action==='occurrence'||action==='dismiss')&&payload&&typeof payload==='object'&&'id' in payload&&'target_id' in payload&&'date' in payload){
   const {id,target_id,date}=payload;
   if(typeof id==='string'&&typeof target_id==='string'&&typeof date==='string')setState(previous=>previous.owner!==user?previous:{...previous,data:{...previous.data,occurrences:[...previous.data.occurrences.filter(item=>item.record_id!==target_id||item.due_on!==date),{id,record_id:target_id,due_on:date,status:action==='occurrence'?'paid':'dismissed'}]}});
  }
  onSaved();
 },[demo,onSaved,user]);
 return {data:demo?{...emptyPlanning,records:rows,holdingAccounts}:user&&state.owner===user?state.data:emptyPlanning,loading:!!user&&!demo&&state.owner!==user,refreshing:!!user&&!demo&&state.key!==key,error:state.key===key?state.error:'',save};
}
