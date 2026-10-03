"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { UserRound, Users, ChartNoAxesColumnIncreasing, ShieldCheck, Tags, Database, Briefcase, Tag, Wand2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const sections = [
 {id:'preferences',label:'Profile & preferences',icon:UserRound},
 {id:'household',label:'Household sharing',icon:Users},
 {id:'benchmarks',label:'Investment benchmarks',icon:ChartNoAxesColumnIncreasing},
 {id:'security',label:'Account security',icon:ShieldCheck},
 {id:'categories',label:'Categories',icon:Tags},
 {id:'businesses',label:'Businesses',icon:Briefcase},
 {id:'tags',label:'Tags',icon:Tag},
 {id:'rules',label:'Rules',icon:Wand2},
 {id:'data-tools',label:'Import & backup',icon:Database},
] as const;

export function SettingsLayout({preferences,household,benchmarks,security,categories,businesses,tags,rules,data}:{preferences:ReactNode;household:ReactNode;benchmarks:ReactNode;security:ReactNode;categories:ReactNode;businesses:ReactNode;tags:ReactNode;rules:ReactNode;data:ReactNode}){
 const {t}=useLanguage();
 const [active,setActive]=useState('preferences');
 useEffect(()=>{
  const sync=()=>{const hash=window.location.hash.slice(1);setActive(sections.some(section=>section.id===hash)?hash:'preferences');};
  // Links followed by the router change the address without a hashchange event.
  const followed=(event:MouseEvent)=>{if(event.target instanceof Element&&event.target.closest('a[href*="#"]'))setTimeout(sync,0);};
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);document.addEventListener('click',followed);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);document.removeEventListener('click',followed);};
 },[]);
 // The tab strip scrolls on narrow screens; keep the selected tab fully visible.
 useEffect(()=>{document.querySelector(`.settings-navigation-list [data-state="active"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const panels:Record<string,ReactNode>={preferences,household,benchmarks,security,categories,businesses,tags,rules,'data-tools':data};
 return <div className="settings-layout">
  <PageHeader title={t('Settings')}/>
  <Tabs value={active} onValueChange={value=>{setActive(value);window.history.replaceState(null,'','#'+value);}} className="settings-navigation">
   <TabsList aria-label={t('Settings')} className="settings-navigation-list">{sections.map(({id,label,icon:Icon})=><TabsTrigger key={id} value={id}><Icon size={18}/>{t(label)}</TabsTrigger>)}</TabsList>
   <div className="settings-section-content">{sections.map(({id})=><TabsContent key={id} value={id} forceMount hidden={active!==id}>{panels[id]}</TabsContent>)}</div>
  </Tabs>
 </div>;
}
