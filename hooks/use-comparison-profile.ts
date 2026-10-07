"use client";
import { useEffect,useState } from 'react';
import { showSaved } from '@/lib/feedback';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import type { ComparisonProfile } from '@/lib/comparison-profile';

/** Stores the day portfolio tracking begins; null returns to the first investment activity. */
export async function saveTrackingStartRequest(date:string|null){
 await requestJson('/api/comparison-profile',{method:'PATCH',body:{tracking_start:date},fallback:'Could not save the tracking start date.'});
}
const noProfile:ComparisonProfile|null=null;
// The owner's benchmark choices and tracking start, shared by the Overview chart and its figures.
// Sample workspaces cannot save, so their tracking start lasts for the visit.
// The profile belongs to the signed-in session, so it reads again when settings are saved or the window regains focus.
export function useComparisonProfile(demo:boolean){
 const [revision,setRevision]=useState(0);
 const remote=useOwnerResource('/api/comparison-profile','session',!demo,revision,noProfile);
 const [demoStart,setDemoStart]=useState<string|null>(null);
 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);window.addEventListener('comparison-settings-saved',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('comparison-settings-saved',refresh);window.removeEventListener('focus',refresh);};},[]);
 async function saveTrackingStart(date:string|null){
  if(demo){setDemoStart(date);showSaved();return;}
  await saveTrackingStartRequest(date);
  remote.update(current=>current&&{...current,tracking_start:date});
  showSaved();
 }
 return {profile:remote.data,error:remote.error,retry:remote.retry,trackingStart:demo?demoStart:remote.data?.tracking_start??null,saveTrackingStart};
}
