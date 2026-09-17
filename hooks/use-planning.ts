"use client";
import { useCallback,useEffect,useState } from 'react';
import { emptyPlanning,type PlanningData } from '@/lib/planning';
import { normalizeEntry,type Entry } from '@/lib/finance';
export function usePlanning(user:string|null,demo:boolean,rows:Entry[],revision:number,onSaved:()=>void){
 const key=`${user}:${revision}`;
 const [state,setState]=useState<{key:string;owner:string|null;data:PlanningData;error:string}>({key:'',owner:null,data:emptyPlanning,error:''});
 useEffect(()=>{
  if(!user||demo)return;
  const controller=new AbortController();
  fetch('/api/planning',{signal:controller.signal}).then(async r=>{
   const data=await r.json() as PlanningData & {error?:string};if(!r.ok)throw Error(data.error);
   if(!controller.signal.aborted)setState({key,owner:user,data:{...data,records:data.records.map(normalizeEntry)},error:''});
  }).catch(e=>{if(!controller.signal.aborted)setState({key,owner:user,data:emptyPlanning,error:e.message});});
  return()=>controller.abort();
 },[user,demo,key]);
 const save=useCallback(async(action:string,payload:unknown)=>{
  if(demo)throw Error('Sign in to save planning changes.');
  const r=await fetch('/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:payload})});
  const data=await r.json() as {error?:string};
  if(!r.ok)throw Object.assign(Error(data.error),{confirmedFailure:r.status<500});
  onSaved();
 },[demo,onSaved]);
 return {data:demo?{...emptyPlanning,records:rows}:state.owner===user?state.data:emptyPlanning,loading:!!user&&!demo&&state.key!==key,error:state.key===key?state.error:'',save};
}
