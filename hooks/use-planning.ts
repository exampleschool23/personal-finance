"use client";
import { showSaved } from '@/lib/save-feedback';
import { useOwnerResource } from './use-owner-resource';
import { useCallback } from 'react';
import { emptyPlanning,type Category } from '@/lib/planning';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { normalizeEntry,type Entry } from '@/lib/finance';
export function usePlanning(user:string|null,demo:boolean,rows:Entry[],revision:number,onSaved:()=>void,holdingAccounts:HoldingAccount[]=[],scope:'full'|'review'|'workspace'='full',month?:string){
 const resource=useOwnerResource('/api/planning?scope='+scope+(scope==='review'&&month?'&month='+encodeURIComponent(month):''),user,!demo,revision,emptyPlanning);
 const save=useCallback(async(action:string,payload:unknown)=>{
  if(demo)throw Error('Sign in to save planning changes.');
  const r=await fetch(action==='movement'?'/api/asset-movements':'/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='movement'?payload:{action,data:payload})});
  const data=await r.json() as {error?:string};
  if(!r.ok)throw Object.assign(Error(data.error),{confirmedFailure:r.status<500});
  // A confirmed save supersedes any read that started before it.
  resource.invalidate();
  if((action==='occurrence'||action==='dismiss')&&payload&&typeof payload==='object'&&'id' in payload&&'target_id' in payload&&'date' in payload){
   const {id,target_id,date}=payload;
   if(typeof id==='string'&&typeof target_id==='string'&&typeof date==='string')resource.update(data=>({...data,occurrences:[...data.occurrences.filter(item=>item.record_id!==target_id||item.due_on!==date),{id,record_id:target_id,due_on:date,status:action==='occurrence'?'paid':'dismissed'}]}));
  }
  if(action==='category'){const category=payload as Category;resource.update(data=>({...data,categories:[...data.categories.filter(item=>item.id!==category.id),category]}));}
  showSaved();
  onSaved();
 },[demo,onSaved,resource]);
 return {data:demo?{...emptyPlanning,records:rows,holdingAccounts}:{...resource.data,records:resource.data.records.map(normalizeEntry)},loading:resource.initialLoading,refreshing:resource.loading,error:resource.error,save};
}
