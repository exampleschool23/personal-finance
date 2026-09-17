"use client";
import { useEffect,useState } from 'react';
import type { DatedExchangeRate } from '@/lib/dated-exchange-rate';
export function useDatedExchangeRate(from:string|undefined,to:string|undefined,date:string){
 const key=from&&to&&from!==to&&date?`${from}:${to}:${date}`:'';
 const [state,setState]=useState<{key:string;quote?:DatedExchangeRate;error?:string}>({key:''});
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!key)return;
  const controller=new AbortController();
  fetch('/api/exchange-rate?'+new URLSearchParams({from:from!,to:to!,date}),{signal:controller.signal}).then(async response=>{
   const data=await response.json() as DatedExchangeRate & {error?:string};if(!response.ok)throw Error(data.error);
   if(!Number.isFinite(data.rate)||data.rate<=0||data.from!==from||data.to!==to||data.date!==date)throw Error('Historical exchange rates are unavailable.');
   if(!controller.signal.aborted)setState({key,quote:data});
  }).catch(error=>{if(!controller.signal.aborted)setState({key,error:error.message});});
  return()=>controller.abort();
 },[key,from,to,date,revision]);
 const current=state.key===key?state:null;
 return {rate:!key&&from&&to&&from===to?1:current?.quote?.rate??null,quote:current?.quote,error:current?.error,loading:!!key&&!current,retry:()=>{setState({key:''});setRevision(value=>value+1);}};
}
