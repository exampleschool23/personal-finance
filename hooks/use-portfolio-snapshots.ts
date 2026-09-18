"use client";
import { useCallback,useEffect,useState } from 'react';
import type { MarketData } from '@/lib/market';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';

export function usePortfolioSnapshots(account:string|null,market:MarketData|null,ready:boolean,revision:number){
 const [state,setState]=useState<{account:string|null;snapshots:PortfolioSnapshot[]}>({account:null,snapshots:[]});
 const [failure,setFailure]=useState<{account:string;message:string}|null>(null);
 const [retry,setRetry]=useState(0);
 const refresh=useCallback(()=>setRetry(value=>value+1),[]);
 const merge=useCallback((owner:string,incoming:PortfolioSnapshot[])=>setState(previous=>{
  const byDate=new Map((previous.account===owner?previous.snapshots:[]).map(point=>[point.occurred_on,point]));
  for(const point of incoming){const saved=byDate.get(point.occurred_on);if(!saved||point.updated_at>=saved.updated_at)byDate.set(point.occurred_on,point);}
  return {account:owner,snapshots:[...byDate.values()].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on))};
 }),[]);
 useEffect(()=>{
  if(!account)return;const controller=new AbortController();
  fetch('/api/portfolio-snapshots',{signal:controller.signal,cache:'no-store'}).then(async response=>{
   const data=await response.json() as {snapshots:PortfolioSnapshot[];error:string};if(!response.ok)throw Error(data.error);
   if(!controller.signal.aborted){merge(account,data.snapshots);setFailure(null);}
  }).catch(reason=>{if(!controller.signal.aborted)setFailure({account,message:reason.message});});
  return()=>controller.abort();
 },[account,retry,merge]);
 useEffect(()=>{
  if(!account||!ready||!market)return;const controller=new AbortController();
  fetch('/api/portfolio-snapshots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({}),signal:controller.signal}).then(async response=>{
   const data=await response.json() as {snapshot:PortfolioSnapshot;error:string};if(!response.ok)throw Error(data.error);
   if(!controller.signal.aborted){merge(account,[data.snapshot]);setFailure(null);}
  }).catch(reason=>{if(!controller.signal.aborted)setFailure({account,message:reason.message});});
  return()=>controller.abort();
 },[account,market,ready,revision,retry,merge]);
 if(!account&&state.account!==null){setState({account:null,snapshots:[]});setFailure(null);}
 return {snapshots:state.account===account?state.snapshots:[],error:failure?.account===account?failure?.message??'':'',retry:refresh};
}
