"use client";
import { useCallback,useEffect,useMemo,useState } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import type { MarketData } from '@/lib/market';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';

const noSnapshots:{snapshots:PortfolioSnapshot[]}={snapshots:[]};
// One point per day; the most recently updated version of a day wins.
function mergeByDate(...lists:PortfolioSnapshot[][]){
 const byDate=new Map<string,PortfolioSnapshot>();
 for(const point of lists.flat()){const saved=byDate.get(point.occurred_on);if(!saved||point.updated_at>=saved.updated_at)byDate.set(point.occurred_on,point);}
 return [...byDate.values()].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on));
}
/** The owner's saved daily totals, plus today's, recorded once prices and records have loaded. */
export function usePortfolioSnapshots(account:string|null,market:MarketData|null,ready:boolean,revision:number){
 const [attempt,setAttempt]=useState(0);
 const refresh=useCallback(()=>setAttempt(value=>value+1),[]);
 const remote=useOwnerResource('/api/portfolio-snapshots',account,true,attempt,noSnapshots);
 const [recorded,setRecorded]=useState<{account:string|null;snapshots:PortfolioSnapshot[];error:string}>({account:null,snapshots:[],error:''});
 useEffect(()=>{
  if(!account||!ready||!market)return;const controller=new AbortController();
  requestJson<{snapshot:PortfolioSnapshot}>('/api/portfolio-snapshots',{body:{},signal:controller.signal}).then(data=>{
   if(!controller.signal.aborted)setRecorded(previous=>({account,snapshots:mergeByDate(previous.account===account?previous.snapshots:[],[data.snapshot]),error:''}));
  }).catch(reason=>{if(!controller.signal.aborted)setRecorded(previous=>({...(previous.account===account?previous:{snapshots:[]}),account,error:reason.message}));});
  return()=>controller.abort();
 },[account,market,ready,revision,attempt]);
 if(!account&&recorded.account!==null)setRecorded({account:null,snapshots:[],error:''});
 const own=recorded.account===account,posted=own?recorded.snapshots:noSnapshots.snapshots,saved=remote.data.snapshots;
 const snapshots=useMemo(()=>posted.length?mergeByDate(saved,posted):saved,[saved,posted]);
 return {snapshots:account?snapshots:[],error:remote.error||(own?recorded.error:''),retry:refresh};
}
