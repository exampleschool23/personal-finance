"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber,calendarIso,parseCalendarDate } from '@/lib/format';
import { type Goal,type PlanningData } from '@/lib/planning';
import { goalFinancials } from '@/lib/goal-projection';
import { currencyLabel } from '@/lib/currencies';
import { depositToday } from '@/lib/deposit-interest';
import type { ExpensePlan } from '@/lib/expense-plans';
import type { MarketData } from '@/lib/market';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { GoalForecast } from './goal-forecast';

type Props={data:PlanningData;save:(action:string,data:unknown)=>Promise<void>;currencies:string[];market:MarketData|null;plans:ExpensePlan[];plansReady:boolean;snapshots:PortfolioSnapshot[];historyError:string};
export function GoalsPage({data,save,currencies,market,plans,plansReady,snapshots,historyError}:Props){
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState<Goal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState('');
 const accounts=data.records.filter(record=>record.kind==='Cash'),today=depositToday();
 const maxDate=calendarIso(new Date(parseCalendarDate(today)!.getFullYear()+100,parseCalendarDate(today)!.getMonth(),parseCalendarDate(today)!.getDate()));
 const goalCurrency=(goal:Goal)=>goal.kind==='net_worth'?goal.currency??currencies[0]:accounts.find(account=>account.id===goal.account_id)?.currency??goal.currency??currencies[0];
 const open=(goal?:Goal)=>{setError('');setDraft(goal?{...goal,kind:goal.kind??'savings',currency:goalCurrency(goal)}:{id:crypto.randomUUID(),name:'',kind:'net_worth',currency:currencies[0],account_id:null,target:0,allocated:0,target_date:null,archived:false,monthly_contribution:null,annual_return:0});};
 const visible=data.goals.filter(goal=>archived||!goal.archived),active=visible.find(goal=>goal.id===selected)??visible[0];
 const totals=new Map([...new Set([...currencies,...data.goals.map(goalCurrency)])].map(currency=>[currency,goalFinancials(data.records,plans,today.slice(0,7),currency,market,plansReady)]));
 const financials=active?totals.get(goalCurrency(active)):null;
 return <>
  <div className="page-heading"><div><h1>{t('Savings goals')}</h1><p className="muted">{t('Plan your future net worth and the savings that matter to you.')}</p></div><Button onClick={()=>open()}>{t('Add goal')}</Button></div>
  {!accounts.length&&<p className="panel">{t('Net-worth goals work without a cash account. Add an account when you want to reserve cash for a savings goal.')} <Link href="/accounts">{t('Accounts')}</Link></p>}
  <label className="planning-check"><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)}/>{t('Show archived goals')}</label>
  {!visible.length&&<section className="panel goal-empty"><h2>{t('What are you working toward?')}</h2><p>{t('Set a target amount and date, then explore how monthly investments can get you there.')}</p><Button onClick={()=>open()}>{t('Add goal')}</Button></section>}
  <div className="planning-cards">{visible.map(goal=>{
   const currency=goalCurrency(goal),account=accounts.find(account=>account.id===goal.account_id),current=goal.kind==='net_worth'?totals.get(currency)?.netWorth??null:Number(goal.allocated),money=(n:number)=>formatMoney(n,currency,locale);
   const percent=current===null?null:Math.max(0,Math.min(100,current/goal.target*100));
   const reserved=data.goals.filter(item=>item.account_id===goal.account_id&&!item.archived).reduce((sum,item)=>sum+Number(item.allocated),0);
   return <article className={'panel goal-card'+(active?.id===goal.id?' goal-card-selected':'')} key={goal.id}><div className="panel-title"><div><p className="eyebrow">{t(goal.kind==='net_worth'?'Net-worth goal':'Savings goal')}</p><h2>{goal.name}</h2></div><Button variant="ghost" onClick={()=>open(goal)}>{t('Edit')}</Button></div>{account&&<p>{account.name}</p>}<strong className="planning-value">{current===null?'—':money(current)} / {money(goal.target)}</strong><progress value={percent??0} max={100} aria-label={goal.name}/><p>{percent===null?'—':formatNumber(percent,locale,1)+'%'} · {t('Remaining')}: {current===null?'—':money(Math.max(0,goal.target-current))}</p>{goal.target_date&&<p>{t('Target date')}: {formatDate(goal.target_date,locale)}</p>}{account&&reserved>account.amount&&!goal.archived&&<p role="alert" className="negative">{t('Your goal allocations exceed the current account balance. Update the allocations.')}</p>}{goal.archived&&<p>{t('Archived')}</p>}<Button variant={active?.id===goal.id?'default':'outline'} aria-pressed={active?.id===goal.id} onClick={()=>setSelected(goal.id)}>{t('Explore plan')}</Button></article>;
  })}</div>
  {active&&<GoalForecast key={JSON.stringify([active,goalCurrency(active)])} goal={active} starting={active.kind==='net_worth'?financials?.netWorth??null:active.allocated} surplus={financials?.surplus??null} currency={goalCurrency(active)} today={today} snapshots={snapshots} historyError={historyError} save={save} onEdit={()=>open(active)}/>}
  <Dialog open={!!draft} onOpenChange={next=>{if(!next&&!busy)setDraft(null);}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Goal')}</DialogTitle><DialogDescription>{t('Choose a net-worth target or reserve cash for a savings goal.')}</DialogDescription>{draft&&<form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save('goal',draft);setSelected(draft.id);setDraft(null);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><fieldset className="tracker-fields" disabled={busy}>
   <label>{t('Goal type')}<NativeSelect value={draft.kind} onChange={event=>{const kind=event.target.value as Goal['kind'];setDraft({...draft,kind,account_id:kind==='savings'?accounts[0]?.id??null:null,allocated:0,currency:kind==='savings'?accounts[0]?.currency??currencies[0]:currencies[0]});}}><option value="net_worth">{t('Net-worth goal')}</option><option value="savings" disabled={!accounts.length}>{t('Savings goal')}</option></NativeSelect></label>
   <label>{t('Name')}<Input required maxLength={120} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
   {draft.kind==='savings'?<><label>{t('Cash account')}<NativeSelect required value={draft.account_id??''} onChange={event=>setDraft({...draft,account_id:event.target.value,currency:accounts.find(account=>account.id===event.target.value)!.currency,allocated:0})}>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</NativeSelect></label><label>{t('Allocated amount')}<FormattedNumberInput required={false} value={draft.allocated} max={draft.target||1e15} onValueChange={allocated=>setDraft({...draft,allocated})}/></label><p className="muted">{t('Allocated money stays in the selected account.')}</p></>:<label>{t('Currency')}<NativeSelect value={draft.currency} onChange={event=>setDraft({...draft,currency:event.target.value})}>{[...new Set([...currencies,...(draft.currency?[draft.currency]:[])])].map(currency=><option key={currency} value={currency}>{currencyLabel(currency,locale)}</option>)}</NativeSelect></label>}
   <label>{t('Target amount')}<FormattedNumberInput value={draft.target} onValueChange={target=>setDraft({...draft,target})}/></label>
   <label>{t('Target date')}<DatePicker required={draft.kind==='net_worth'} value={draft.target_date??''} min={data.goals.some(goal=>goal.id===draft.id)?undefined:today} max={maxDate} onChange={date=>setDraft({...draft,target_date:date||null})}/></label>
   <label className="planning-check"><input type="checkbox" checked={draft.archived} onChange={event=>setDraft({...draft,archived:event.target.checked})}/>{t('Archived')}</label>
  </fieldset>{error&&<p className="error" role="alert">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={()=>setDraft(null)}>{t('Cancel')}</Button><Button disabled={busy||draft.target<=0||draft.allocated>draft.target||(draft.kind==='net_worth'&&!draft.target_date)||(draft.kind==='savings'&&!draft.account_id)}>{t(busy?'Saving…':'Save')}</Button></div></form>}</DialogContent></Dialog>
 </>;
}
