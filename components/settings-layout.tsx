"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { UserRound, ChartNoAxesColumnIncreasing, ShieldCheck, Tags, Database } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const sections = [
 {id:'preferences',label:'Profile & preferences',icon:UserRound},
 {id:'benchmarks',label:'Investment benchmarks',icon:ChartNoAxesColumnIncreasing},
 {id:'security',label:'Account security',icon:ShieldCheck},
 {id:'categories',label:'Categories',icon:Tags},
 {id:'data-tools',label:'Import & backup',icon:Database},
] as const;

export function SettingsLayout({preferences,benchmarks,security,categories,data}:{preferences:ReactNode;benchmarks:ReactNode;security:ReactNode;categories:ReactNode;data:ReactNode}){
 const {t}=useLanguage();
 const [active,setActive]=useState('preferences');
 useEffect(()=>{
  const sync=()=>{const hash=window.location.hash.slice(1);setActive(sections.some(section=>section.id===hash)?hash:'preferences');};
  sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
 },[]);
 // The tab strip scrolls on narrow screens; keep the selected tab fully visible.
 useEffect(()=>{document.querySelector(`.settings-navigation-list [data-state="active"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const panels:Record<string,ReactNode>={preferences,benchmarks,security,categories,'data-tools':data};
 return <div className="settings-layout">
  <header className="page-heading"><div><h1>{t('Settings')}</h1><p className="muted">{t('Manage your preferences, security, and financial data.')}</p></div></header>
  <Tabs value={active} onValueChange={value=>{setActive(value);window.history.replaceState(null,'','#'+value);}} className="settings-navigation">
   <TabsList aria-label={t('Settings')} className="settings-navigation-list">{sections.map(({id,label,icon:Icon})=><TabsTrigger key={id} value={id}><Icon size={18}/>{t(label)}</TabsTrigger>)}</TabsList>
   <div className="settings-section-content">{sections.map(({id})=><TabsContent key={id} value={id} forceMount hidden={active!==id}>{panels[id]}</TabsContent>)}</div>
  </Tabs>
 </div>;
}
