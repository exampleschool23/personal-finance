"use client";
import { refreshRead } from '@/lib/refresh-read';
import { useEffect,useRef,useState } from 'react';
import { earningSourceSchema,type EarningSource } from '@/lib/earning-sources';
export type EarningSourcesController={sources:EarningSource[];loading:boolean;error:string;retry:()=>void;save:(source:EarningSource)=>Promise<void>};
export function useEarningSources(user:string|null,demo:boolean,revision:number,onSaved:()=>void,onDemoSave:(source:EarningSource,original?:EarningSource)=>void,demoSeeds:EarningSource[]=[]):EarningSourcesController{
 const owner=demo?'demo':user;
 const current=useRef(owner);
 useEffect(()=>{current.current=owner;return()=>{current.current=null;};},[owner]);
 const [state,setState]=useState<{owner:string|null;sources:EarningSource[];error:string}>({owner:null,sources:[],error:''});
 if(state.owner&&state.owner!==owner)setState({owner:null,sources:[],error:''});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!owner||demo)return;
  const controller=new AbortController();
  refreshRead('/api/income-sources',{signal:controller.signal}).then(async response=>{
   const body=await response.json() as EarningSource[] & {error:string};if(!response.ok)throw Error(body.error);
   if(!controller.signal.aborted)setState({owner,sources:body.map((source:EarningSource)=>({...source,amount:source.amount===null?null:Number(source.amount)})),error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState({owner,sources:[],error:error.message});});
  return()=>controller.abort();
 },[owner,demo,revision,retry]);
 // Rendering never exposes the previous account's sources.
 const saved=state.owner===owner?state.sources:[];
 const sources=demo?[...saved,...demoSeeds.filter(source=>!saved.some(row=>row.id===source.id))]:saved;
 async function save(source:EarningSource){
  const result=earningSourceSchema.safeParse(source);if(!result.success)throw Error('Check the income source fields.');
  const parsed=result.data,scope=owner;
  if(!scope)throw Error('Please sign in again.');
  if(demo){const saved={...parsed,schedule_id:source.schedule_id??(source.mode==='fixed'?source.id:null)};onDemoSave(saved,sources.find(source=>source.id===saved.id));setState({owner:scope,sources:[...sources.filter(row=>row.id!==source.id),saved],error:''});}
  else{
   const response=await fetch('/api/income-sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed)});
   const body=await response.json() as EarningSource & {error:string};if(!response.ok)throw Error(body.error);body.amount=body.amount===null?null:Number(body.amount);
   if(current.current===scope){setState(previous=>({owner:scope,sources:[...(previous.owner===scope?previous.sources:[]).filter(row=>row.id!==body.id),body],error:''}));setRetry(value=>value+1);}
  }
  if(current.current===scope)onSaved();
 }
 return {sources,loading:!!owner&&!demo&&state.owner!==owner,error:state.owner===owner?state.error:'',retry:()=>setRetry(value=>value+1),save};
}
