"use client";
import { useEffect,useState } from 'react';
import { refreshRead } from '@/lib/refresh-read';
import { showSaved } from '@/lib/feedback';
import type { ComparisonProfile } from '@/lib/comparison-profile';

// The owner's benchmark choices and tracking start, shared by the Overview chart and its figures.
// Sample workspaces cannot save, so their tracking start lasts for the visit.
export function useComparisonProfile(demo:boolean){
 const [profile,setProfile]=useState<ComparisonProfile|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [demoStart,setDemoStart]=useState<string|null>(null);
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();
  refreshRead('/api/comparison-profile',{signal:controller.signal}).then(async response=>{const result=await response.json() as ComparisonProfile&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setProfile(result);setError('');}}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
  return()=>controller.abort();
 },[demo,retry]);
 useEffect(()=>{const refresh=()=>setRetry(value=>value+1);window.addEventListener('comparison-settings-saved',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('comparison-settings-saved',refresh);window.removeEventListener('focus',refresh);};},[]);
 async function saveTrackingStart(date:string|null){
  if(demo){setDemoStart(date);return;}
  const response=await fetch('/api/comparison-profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracking_start:date})});
  if(!response.ok){const result=await response.json() as {error?:string};throw Error(result.error??'Could not save the tracking start date.');}
  setProfile(current=>current&&{...current,tracking_start:date});
  showSaved();
 }
 return {profile,error,retry:()=>setRetry(value=>value+1),trackingStart:demo?demoStart:profile?.tracking_start??null,saveTrackingStart};
}
