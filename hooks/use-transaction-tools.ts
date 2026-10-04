"use client";
import { showSaved } from '@/lib/feedback';
import { useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import { emptyTransactionTools, type TransactionTools, type TransactionSplit, type ForecastAssignment } from '@/lib/transaction-tools';
// What a confirmed save does to the loaded tools, so the change shows before the next read.
function applyChange(previous:TransactionTools,action:string,data:unknown):TransactionTools{
 const next={...previous};
 if(action==='split'){const payload=data as {record_id:string;splits:TransactionSplit[]};next.splits=[...next.splits.filter(item=>item.record_id!==payload.record_id),...payload.splits.map((part,position)=>({...part,position,record_id:payload.record_id}))];}
 if(action==='forecast'){const payload=data as ForecastAssignment;next.assignments=[...next.assignments.filter(item=>item.record_id!==payload.record_id),...(payload.account_id?[payload]:[])];}
 return next;
}
/** Splits and forecast assignments. The sample workspace keeps its changes in memory. */
export function useTransactionTools(user:string|null,demo:boolean,revision:number,onSaved:()=>void){
 const remote=useOwnerResource('/api/transaction-tools',user,!demo,revision,emptyTransactionTools);
 const [sample,setSample]=useState(emptyTransactionTools);
 if(!demo&&sample!==emptyTransactionTools)setSample(emptyTransactionTools);
 async function save(action:string,data:unknown){
  if(demo){setSample(previous=>applyChange(previous,action,data));showSaved();return;}
  await requestJson('/api/transaction-tools',{body:{action,data}});
  // A confirmed save supersedes any read that started before it.
  remote.update(previous=>applyChange(previous,action,data));remote.invalidate();showSaved();onSaved();
 }
 return {data:demo?sample:remote.data,error:demo?'':remote.error,loading:remote.initialLoading,save,retry:remote.retry};
}
