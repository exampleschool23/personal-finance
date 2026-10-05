"use client";
import { showSaved } from '@/lib/feedback';
import { requestJson } from '@/lib/api-client';
import { useOwnerResource } from './use-owner-resource';
import { useCallback } from 'react';
import { emptyPlanning,type Category,type PlanningData } from '@/lib/planning';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { normalizeEntry,type Entry } from '@/lib/finance';
export function usePlanning(user:string|null,demo:boolean,rows:Entry[],revision:number,onSaved:()=>void,holdingAccounts:HoldingAccount[]=[],scope:'full'|'review'|'workspace'='full',month?:string,demoSeed:Pick<PlanningData,'goals'|'occurrences'>&Partial<Pick<PlanningData,'categories'>>=emptyPlanning){
 const resource=useOwnerResource('/api/planning?scope='+scope+(scope==='review'&&month?'&month='+encodeURIComponent(month):''),user,!demo,revision,emptyPlanning);
 const save=useCallback(async(action:string,payload:unknown)=>{
  if(demo)throw Error('Sign in to save planning changes.');
  await requestJson(action==='movement'?'/api/asset-movements':'/api/planning',{body:action==='movement'?payload:{action,data:payload}});
  // A confirmed save supersedes any read that started before it.
  resource.invalidate();
  if((action==='occurrence'||action==='dismiss')&&payload&&typeof payload==='object'&&'id' in payload&&'target_id' in payload&&'date' in payload){
   const {id,target_id,date}=payload;
   if(typeof id==='string'&&typeof target_id==='string'&&typeof date==='string')resource.update(data=>({...data,occurrences:[...data.occurrences.filter(item=>item.record_id!==target_id||item.due_on!==date),{id,record_id:target_id,due_on:date,status:action==='occurrence'?'paid':'dismissed',...(action==='occurrence'&&'amount' in payload&&typeof payload.amount==='number'?{transaction_id:id,transaction:{amount:payload.amount,date:'paid_on' in payload&&typeof payload.paid_on==='string'?payload.paid_on:date}}:{})}]}));
  }
  if(action==='category'){const category=payload as Category;resource.update(data=>({...data,categories:[...data.categories.filter(item=>item.id!==category.id),category]}));}
  showSaved();
  onSaved();
 },[demo,onSaved,resource]);
 return {data:demo?{...emptyPlanning,...demoSeed,records:rows,holdingAccounts}:{...resource.data,records:resource.data.records.map(normalizeEntry)},loading:resource.initialLoading,refreshing:resource.loading,error:resource.error,save};
}
