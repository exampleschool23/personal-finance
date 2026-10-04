"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';

// Nine settings areas grouped into five views, switched from tabs beside the title. Each area keeps its own anchor
// (#rules, #tags, #security…) so older links still open the right view and land on the area.
const views = [
 {id:'account',label:'Account',areas:['preferences','benchmarks','security']},
 {id:'household',label:'Household',areas:['household']},
 {id:'categories',label:'Categories',areas:['categories','tags','rules']},
 {id:'businesses',label:'Businesses',areas:['businesses']},
 {id:'data-tools',label:'Import & backup',areas:['data-tools']},
] as const;
type View = (typeof views)[number]['id'];
export const viewOf = (hash: string) => views.find(view => view.id === hash || (view.areas as readonly string[]).includes(hash))?.id ?? 'account';

export function SettingsLayout({preferences,household,benchmarks,security,categories,businesses,tags,rules,data,actions}:{actions?:ReactNode;preferences:ReactNode;household:ReactNode;benchmarks:ReactNode;security:ReactNode;categories:ReactNode;businesses:ReactNode;tags:ReactNode;rules:ReactNode;data:ReactNode}){
 const {t}=useLanguage();
 const [active,setActive]=useState<View>('account');
 useEffect(()=>{
  const sync=()=>{
   const hash=window.location.hash.slice(1);
   setActive(viewOf(hash));
   // A link to one area of a view scrolls to it once the view shows.
   if(hash&&!views.some(view=>view.id===hash))requestAnimationFrame(()=>document.getElementById(`settings-${hash}`)?.scrollIntoView({block:'start'}));
  };
  // Links followed by the router change the address without a hashchange event.
  const followed=(event:MouseEvent)=>{if(event.target instanceof Element&&event.target.closest('a[href*="#"]'))setTimeout(sync,0);};
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);document.addEventListener('click',followed);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);document.removeEventListener('click',followed);};
 },[]);
 const panels:Record<string,ReactNode>={preferences,household,benchmarks,security,categories,businesses,tags,rules,'data-tools':data};
 return <div className="settings-layout">
  <PageHeader title={t('Settings')} tabs={<Segmented className="page-tabs" as="nav" label={t('Settings')} options={views.map(view=>({value:view.id,label:t(view.label)}))} value={active} onChange={view=>{setActive(view);window.history.replaceState(null,'','#'+view);}}/>}>{actions}</PageHeader>
  {/* Every view stays mounted so unsaved fields survive switching tabs. */}
  {views.map(view=><div key={view.id} className="settings-view" hidden={active!==view.id}>{view.areas.map(area=><section key={area} id={`settings-${area}`} className="settings-area">{panels[area]}</section>)}</div>)}
 </div>;
}
