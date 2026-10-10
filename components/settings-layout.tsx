"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { PageHeader } from '@/components/presentation-foundation/page-header';

// Settings is a sub-navigation of two groups beside one section at a time, like the reference app's settings. Each
// section keeps its own anchor (#rules, #tags, #security…), and the old view anchors (#account) still open the right one.
const groups = [
 {label:'Personal',sections:[
  {id:'preferences',label:'Profile & preferences'},
  {id:'telegram',label:'Telegram'},
  {id:'security',label:'Account access'},
 ]},
 {label:'Workspace',sections:[
  {id:'household',label:'Household sharing'},
  {id:'categories',label:'Categories'},
  {id:'tags',label:'Tags'},
  {id:'rules',label:'Rules'},
  {id:'businesses',label:'Businesses'},
  {id:'benchmarks',label:'Investment benchmarks'},
  {id:'data-tools',label:'Import & backup'},
 ]},
] as const;
type Section = (typeof groups)[number]['sections'][number]['id'];
const sections = groups.flatMap(group => group.sections.map(section => section.id)) as Section[];
export const sectionOf = (hash: string): Section => (sections as string[]).includes(hash) ? hash as Section : 'preferences';

export function SettingsLayout({actions,...panels}:{actions?:ReactNode}&Record<Section,ReactNode>){
 const {t}=useLanguage();
 const [active,setActive]=useState<Section>('preferences');
 useEffect(()=>{
  const sync=()=>setActive(sectionOf(window.location.hash.slice(1)));
  // Links followed by the router change the address without a hashchange event.
  const followed=(event:MouseEvent)=>{if(event.target instanceof Element&&event.target.closest('a[href*="#"]'))setTimeout(sync,0);};
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);document.addEventListener('click',followed);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);document.removeEventListener('click',followed);};
 },[]);
 const open=(section:Section)=>{setActive(section);window.history.replaceState(null,'','#'+section);};
 return <div className="settings-layout">
  <PageHeader title={t('Settings')}>{actions}</PageHeader>
  <div className="settings-columns">
   <nav className="settings-nav" aria-label={t('Settings')}>
    {groups.map(group=><div key={group.label} className="settings-nav-group">
     <h2>{t(group.label)}</h2>
     <ul>{group.sections.map(section=><li key={section.id}><button type="button" aria-current={active===section.id?'page':undefined} onClick={()=>open(section.id)}>{t(section.label)}</button></li>)}</ul>
    </div>)}
   </nav>
   {/* Every section stays mounted so unsaved fields survive switching. */}
   <div className="settings-sections">{sections.map(section=><section key={section} id={`settings-${section}`} className="settings-area" hidden={active!==section}>{panels[section]}</section>)}</div>
  </div>
 </div>;
}
