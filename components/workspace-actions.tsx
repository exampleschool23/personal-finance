"use client";
import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronRight, Settings2, Wallet, Landmark, ChartPie, Upload } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import type { ExpensePlan } from '@/lib/expense-plans';
import { depositToday } from '@/lib/deposit-interest';
import { expenses } from '@/lib/finance';
export function WorkspaceActions({data,plans,plansReady,onAddAccount,settingsReady}:{data:PlanningData;plans:ExpensePlan[];plansReady:boolean;onAddAccount:()=>void;settingsReady:boolean}){
 const {t,locale}=useLanguage();const [showSetup,setShowSetup]=useState(false);const accounts=data.records.filter(record=>record.kind==='Cash'||record.kind==='Deposit');const today=depositToday();const due=upcomingPayments(data.records,data.occurrences,today).filter(item=>item.type!=='scheduled'||expenses.includes(item.record.kind));
 const overdue=due.filter(item=>item.overdue);
 const setupSteps=[
  {title:'Choose your language and currencies',icon:Settings2,href:'/settings'},
  {title:'Add a cash account and its opening balance',icon:Wallet,href:accounts.length?'/accounts':undefined,done:!!accounts.length},
  {title:'Check opening balances against your bank',icon:Landmark,href:'/accounts',description:'Use the balance from the day before your imported transactions.'},
  {title:'Create your first monthly budget',icon:ChartPie,href:'/income-expenses',done:plansReady&&!!plans.length},
  {title:'Import transactions or add them manually',icon:Upload,href:'/settings#data-tools'},
 ];
 return <Dialog open={showSetup} onOpenChange={setShowSetup}><section className="panel tools-panel action-panel"><h2>{t('Your next steps')}</h2><div className="review-grid"><article><h3>{t('Upcoming obligations')}</h3><strong>{formatNumber(due.length,locale,0)}</strong><p>{t('{count} overdue',{count:formatNumber(overdue.length,locale,0)})}</p>{due.slice(0,3).map(item=><p key={item.key}>{item.record.name} · {formatDate(item.date,locale)} · {formatMoney(item.record.amount,item.record.currency,locale)}</p>)}<Link href="/upcoming">{t('Review and record payments')}</Link></article><article><h3>{t('Needs attention')}</h3><p>{overdue.length?t('Review overdue items before recording payments.'):t('No overdue obligations.')}</p>{!settingsReady&&<Link href="/settings">{t('Retry loading settings')}</Link>}<DialogTrigger asChild><Button variant="outline">{t('Setup checklist')}</Button></DialogTrigger></article></div></section>
 <DialogContent className="setup-checklist max-h-[85dvh] overflow-y-auto sm:max-w-xl" showCloseButton={false}>
  <DialogHeader className="setup-checklist-header">
   <DialogTitle>{t('Set up your workspace')}</DialogTitle>
   <DialogDescription>{t('Follow these steps to make your balances and budget useful.')}</DialogDescription>
  </DialogHeader>
  <ol>{setupSteps.map(step=>{
   const Icon=step.icon;
   const content=<><span className="setup-step-icon"><Icon size={20} aria-hidden="true"/></span><span className="setup-step-copy"><span className="setup-step-title">{t(step.title)}</span>{step.description&&<span className="setup-step-description">{t(step.description)}</span>}{step.done&&<span className="setup-step-done"><Check size={13} aria-hidden="true"/>{t('Done')}</span>}</span><ChevronRight className="setup-step-arrow" size={18} aria-hidden="true"/></>;
   return <li key={step.title}><DialogClose asChild>{step.href?<Link className="setup-step" href={step.href}>{content}</Link>:<button type="button" className="setup-step" onClick={onAddAccount}>{content}</button>}</DialogClose></li>;
  })}</ol>
  <div className="setup-checklist-footer"><DialogClose asChild><Button variant="outline">{t('Close')}</Button></DialogClose></div>
 </DialogContent></Dialog>;
}
