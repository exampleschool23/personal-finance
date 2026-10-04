"use client";
import { showSaved } from '@/lib/feedback';
import { useEffect,useMemo,useRef,useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import { earningSourceSchema,type EarningSource } from '@/lib/earning-sources';
export type EarningSourcesController={sources:EarningSource[];loading:boolean;error:string;retry:()=>void;save:(source:EarningSource)=>Promise<void>};
const noSources:EarningSource[]=[];
// Amounts arrive as text from numeric columns.
const normalize=(source:EarningSource):EarningSource=>({...source,amount:source.amount===null?null:Number(source.amount),approx_monthly:source.approx_monthly==null?null:Number(source.approx_monthly)});
export function useEarningSources(user:string|null,demo:boolean,revision:number,onSaved:()=>void,onDemoSave:(source:EarningSource,original?:EarningSource)=>void,demoSeeds:EarningSource[]=[]):EarningSourcesController{
 const owner=demo?'demo':user;
 const current=useRef(owner);
 useEffect(()=>{current.current=owner;return()=>{current.current=null;};},[owner]);
 const remote=useOwnerResource('/api/income-sources',user,!demo,revision,noSources);
 const [sample,setSample]=useState(noSources);
 if(!demo&&sample!==noSources)setSample(noSources);
 // Rendering never exposes the previous account's sources.
 const saved=useMemo(()=>remote.data.map(normalize),[remote.data]);
 const sources=demo?[...sample,...demoSeeds.filter(source=>!sample.some(row=>row.id===source.id))]:saved;
 async function save(source:EarningSource){
  const result=earningSourceSchema.safeParse(source);if(!result.success)throw Error('Check the income source fields.');
  const parsed=result.data,scope=owner;
  if(!scope)throw Error('Please sign in again.');
  if(demo){const saved={...parsed,schedule_id:source.schedule_id??(source.mode==='fixed'?source.id:null)};onDemoSave(saved,sources.find(source=>source.id===saved.id));setSample([...sources.filter(row=>row.id!==source.id),saved]);}
  else{
   const body=await requestJson<EarningSource>('/api/income-sources',{body:parsed});
   remote.update(previous=>[...previous.filter(row=>row.id!==body.id),body]);remote.invalidate();
  }
  if(current.current===scope){showSaved();onSaved();}
 }
 return {sources,loading:remote.initialLoading,error:remote.error,retry:remote.retry,save};
}
