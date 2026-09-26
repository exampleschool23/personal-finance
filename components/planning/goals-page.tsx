"use client";
import { isInstrumentAccount } from '@/lib/holding-accounts';
import {useGoalLayoutAnimation} from '@/hooks/use-goal-layout-animation';
import { GoalDragHandle } from './goal-drag-handle';
import { GoalCard } from './goal-card';
import { useGoalOrder } from '@/hooks/use-goal-order';
import { CurrencyValue } from '@/components/currency-value';
import { useDraftDialog } from '@/components/discard-changes';
import { useEffect, useId, useRef, useState } from 'react';
import { Bitcoin, CalendarDays, ChartNoAxesCombined, Check, Pencil, Target, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoalInvestmentEditor } from './goal-investment-editor';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber,calendarIso,parseCalendarDate } from '@/lib/format';
import { type Goal,type PlanningData } from '@/lib/planning';
import { investmentGoalItems, investmentGoalTargets, investmentGoalCompletion } from '@/lib/investment-goals';
import { InvestmentGoalPlan } from './investment-goal-plan';
import { goalFinancials } from '@/lib/goal-projection';
import { depositToday } from '@/lib/deposit-interest';
import type { ExpensePlan } from '@/lib/expense-plans';
import type { MarketData } from '@/lib/market';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { GoalFundingPanel } from './goal-funding-panel';
import { fundingRoom } from '@/lib/goal-funding';
import {GoalScenarios} from './goal-scenarios';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import { GoalForecast } from './goal-forecast';

type Props={preferences:PreferenceResource;owner:string|null;demo:boolean;revision:number;onSaved:()=>void;data:PlanningData;save:(action:string,data:unknown)=>Promise<void>;currencies:string[];currency:string;market:MarketData|null;plans:ExpensePlan[];plansReady:boolean;snapshots:PortfolioSnapshot[];historyError:string};
export function GoalsPage({preferences,owner,demo,revision,onSaved,data,save,currencies,currency,market,plans,plansReady,snapshots,historyError}:Props){
 const {t,locale}=useLanguage();
 const plannerId=useId(),plannerRef=useRef<HTMLDivElement>(null);
 const [plannerVisit,setPlannerVisit]=useState(0);
 const [dragTarget,setDragTarget]=useState<string|null>(null);
 useEffect(()=>{
  if(!plannerVisit||!plannerRef.current)return;
  plannerRef.current.focus({preventScroll:true});
  plannerRef.current.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 },[plannerVisit]);
 const [draft,setDraft]=useState<Goal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState('');
 const guard=useDraftDialog(draft,()=>setDraft(null),busy);
 const investmentAccounts=(data.holdingAccounts??[]).filter(isInstrumentAccount);
 const accounts=data.records.filter(record=>record.kind==='Cash'),today=depositToday();
 const maxDate=calendarIso(new Date(parseCalendarDate(today)!.getFullYear()+100,parseCalendarDate(today)!.getMonth(),parseCalendarDate(today)!.getDate()));
 const goalCurrency=(goal:Goal)=>goal.kind==='investment'?investmentAccounts.find(account=>account.id===goal.holding_account_id)?.currency??goal.currency??currency:goal.kind==='net_worth'?goal.currency??currency:accounts.find(account=>account.id===goal.account_id)?.currency??goal.currency??currency;
 const open=(goal?:Goal)=>{setError('');setDraft(goal?{...goal,kind:goal.kind??'savings',currency:goalCurrency(goal),investment_targets:investmentGoalTargets(goal)}:{id:crypto.randomUUID(),name:'',kind:'net_worth',currency:currency,account_id:null,target:0,allocated:0,target_date:null,archived:false,monthly_contribution:null,annual_return:0});};
 const order=useGoalOrder(data.goals,preferences,owner,demo);
 const visible=order.goals.filter(goal=>archived||!goal.archived),active=visible.find(goal=>goal.id===selected)??visible[0];
 const cardsRef=useGoalLayoutAnimation(JSON.stringify(visible.map(goal=>goal.id)));
 const totals=new Map([...new Set([...currencies,...data.goals.map(goalCurrency)])].map(currency=>[currency,goalFinancials(data.records,plans,today.slice(0,7),currency,market,plansReady)]));
 const financials=active?totals.get(goalCurrency(active)):null;
 return <>
  <div className="page-heading"><div><h1>{t('Savings goals')}</h1><p className="muted">{t('Plan your future net worth and the savings that matter to you.')}</p></div><Button onClick={()=>open()}>{t('Add goal')}</Button></div>
  {!accounts.length&&<p className="panel">{t('Net-worth and investment goals do not need a cash account. Cash savings goals reserve money in a cash account.')} <Link href="/accounts">{t('Accounts')}</Link></p>}
  <GoalFundingPanel data={data} currency={currency} surplus={totals.get(currency)?.surplus??null} today={today} rates={market?.rates} owner={owner} demo={demo} revision={revision} onSaved={onSaved}/>
  {order.error&&<p className="error" role="alert">{t(order.error)}</p>}
  {preferences.error&&!demo&&<p className="error" role="alert">{t('Load saved preferences before making changes.')} <Button onClick={preferences.retry}>{t('Retry')}</Button></p>}
  <div className="goal-list-toolbar">{visible.length>1&&<p className="muted">{t(demo?'Drag the handles to reorder goals. Demo changes last for this visit.':'Drag the handles to reorder goals. Your order is saved automatically.')}</p>}<label className="planning-check"><Checkbox aria-label={t('Show archived goals')} checked={archived} onCheckedChange={checked=>setArchived(checked===true)}/>{t('Show archived goals')}</label></div>
  {!visible.length&&<section className="panel goal-empty"><h2>{t('What are you working toward?')}</h2><p>{t('Set a target amount and date, then explore how monthly investments can get you there.')}</p><Button onClick={()=>open()}>{t('Add goal')}</Button></section>}
  <div ref={cardsRef} className="planning-cards goal-cards goal-cards-compact">{visible.map(goal=>{
   const investment=goal.kind==='investment',holdingItems=investmentGoalItems(goal,data);
   const currency=goalCurrency(goal),account=accounts.find(account=>account.id===goal.account_id),current=goal.kind==='net_worth'?totals.get(currency)?.netWorth??null:Number(goal.allocated),money=(n:number)=>formatMoney(n,currency,locale);
   const percent=investment?investmentGoalCompletion(goal,data):current===null?null:Math.max(0,Math.min(100,current/goal.target*100));
   const reserved=data.goals.filter(item=>item.account_id===goal.account_id&&!item.archived).reduce((sum,item)=>sum+Number(item.allocated),0);
   const isSelected=active?.id===goal.id;
   const showPlan=()=>{setSelected(goal.id);setPlannerVisit(visit=>visit+1);};
   const GoalIcon=investment?(holdingItems.every(item=>item.target.asset_kind==='Crypto')?Bitcoin:ChartNoAxesCombined):goal.kind==='net_worth'?Target:Wallet;
   return <GoalCard data-goal-id={goal.id} data-drop-target={dragTarget===goal.id} aria-controls={plannerId} onOpen={showPlan} className={'panel goal-card'+(isSelected?' goal-card-selected':'')} key={goal.id} aria-label={goal.name}>
    <header className="goal-card-header">
     <div className="goal-card-identity"><span className="goal-card-icon"><GoalIcon size={24} aria-hidden="true" /></span><div><p className="goal-card-kind">{t(investment?'Stock / crypto accumulation':goal.kind==='net_worth'?'Net-worth goal':'Savings goal')}{goal.archived&&<span className="goal-card-archived">{t('Archived')}</span>}</p><h2>{goal.name}</h2>{account&&<p className="goal-card-account">{account.name}</p>}</div></div>
     <div className="goal-card-actions"><GoalDragHandle name={goal.name} disabled={order.disabled||visible.length<2} onTarget={setDragTarget} onMove={direction=>{setSelected(active?.id??'');void order.move(goal.id,direction,visible.map(item=>item.id));}} onDrop={target=>{setSelected(active?.id??'');void order.reorder(goal.id,target,visible.map(item=>item.id));}}/><Button variant="ghost" size="icon" onClick={()=>open(goal)} aria-label={t('Edit goal')+': '+goal.name}><Pencil size={17} aria-hidden="true" /></Button></div>
    </header>
    {investment?<details className="goal-holdings-details"><summary>{t('Holdings')} · {formatNumber(holdingItems.length,locale,0)}</summary><div className="investment-target-summaries">{holdingItems.map(({target,progress},index)=><div className="investment-target-summary" key={index}><div><strong>{target.asset_symbol}</strong><span className="muted">{progress?.account.name??t('Progress unavailable')}</span></div><p>{t('{current} of {target}',{current:progress?formatNumber(progress.current,locale,8):'—',target:`${formatNumber(target.target,locale,8)} ${target.asset_symbol}`})}</p><progress value={progress?.percent??0} max={100} aria-label={target.asset_symbol} aria-valuetext={progress?t('{percent}% complete',{percent:formatNumber(progress.percent,locale,0)}):t('Progress unavailable')}/></div>)}</div>{holdingItems.length>1&&<p className="goal-help">{t('Overall progress averages each holding’s completion, capped at its target. Every holding must reach its target to complete this goal.')}</p>}</details>:<dl className="goal-card-values">
     <div className="goal-card-current"><dt>{t(investment?'Currently held':goal.kind==='net_worth'?'Current net worth':'Allocated amount')}</dt><dd>{current===null?'—':money(current)}</dd></div>
     <div><dt>{t(investment?'Target quantity':'Target amount')}</dt><dd>{money(goal.target)}</dd></div>
     <div><dt>{t('Remaining')}</dt><dd>{current===null?'—':money(Math.max(0,goal.target-current))}</dd></div>
    </dl>}
    <div className="goal-card-progress"><div><strong>{percent===null?t('Progress unavailable'):t('{percent}% complete',{percent:formatNumber(percent,locale,0)})}</strong>{isSelected&&<span><Check size={16} aria-hidden="true" />{t('Plan shown below')}</span>}</div><progress value={percent??0} max={100} aria-label={goal.name} aria-valuetext={percent===null?t('Progress unavailable'):t('{percent}% complete',{percent:formatNumber(percent,locale,0)})} /></div>
    {account&&reserved>account.amount&&!goal.archived&&<p role="alert" className="negative">{t('Your goal allocations exceed the current account balance. Update the allocations.')}</p>}
    <footer className="goal-card-footer"><div className="goal-card-deadline"><CalendarDays size={21} aria-hidden="true" /><div><span>{t('Target date')}</span><strong>{goal.target_date?formatDate(goal.target_date,locale):t('No target date')}</strong></div></div></footer>
   </GoalCard>;
  })}</div>
  {active&&<div id={plannerId} ref={plannerRef} className="goal-planner-destination" tabIndex={-1} role="region" aria-label={t('Goal planner')}>{active.kind==='investment'?<InvestmentGoalPlan currency={currency} market={market} key={JSON.stringify(active)} goal={active} data={data} today={today} save={save} onEdit={()=>open(active)}/>:<GoalForecast key={JSON.stringify([active,goalCurrency(active)])} goal={active} starting={active.kind==='net_worth'?financials?.netWorth??null:active.allocated} surplus={fundingRoom(data.goals,active,financials?.surplus??null,goalCurrency(active),today,market?.rates)} currency={goalCurrency(active)} today={today} snapshots={snapshots} historyError={historyError} save={save} onEdit={()=>open(active)}/>}</div>}
  {active&&active.kind!=='investment'&&<GoalScenarios key={active.id} goal={active} starting={active.kind==='net_worth'?financials?.netWorth??null:Number(active.allocated)} currency={goalCurrency(active)} today={today} preferences={preferences}/>}
  <Dialog open={!!draft} onOpenChange={next=>{if(!next&&!busy)guard.close();}}><DialogContent className="record-dialog goal-dialog" showCloseButton={!busy}><DialogTitle>{t('Goal')}</DialogTitle><DialogDescription>{t('Set a net-worth target, reserve cash, or accumulate coins and shares.')}</DialogDescription>{draft&&<form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save('goal',draft);setSelected(draft.id);setDraft(null);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><div className="goal-dialog-scroll"><fieldset className="tracker-fields" disabled={busy}>
   <label>{t('Goal type')}<NativeSelect value={draft.kind} onChange={event=>{const kind=event.target.value as Goal['kind'];const investmentAccount=investmentAccounts[0];setDraft({...draft,kind,account_id:kind==='savings'?accounts[0]?.id??null:null,allocated:0,target:0,monthly_contribution:null,annual_return:0,holding_account_id:kind==='investment'?investmentAccount?.id??null:null,asset_kind:kind==='investment'?investmentAccount?.kind??null:null,asset_symbol:null,investment_targets:kind==='investment'&&investmentAccount?[{holding_account_id:investmentAccount.id,asset_kind:investmentAccount.kind,asset_symbol:'',target:0,monthly_contribution:null}]:[],currency:kind==='investment'?investmentAccount?.currency??currency:kind==='savings'?accounts[0]?.currency??currency:currency});}}><option value="net_worth">{t('Net-worth goal')}</option><option value="savings" disabled={!accounts.length}>{t('Savings goal')}</option><option value="investment">{t('Stock / crypto accumulation')}</option></NativeSelect></label>
   <label>{t('Name')}<Input required maxLength={120} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
   {draft.kind==='investment'?<GoalInvestmentEditor targets={investmentGoalTargets(draft)} accounts={investmentAccounts} busy={busy} onChange={investment_targets=>{const first=investment_targets[0];setDraft({...draft,...first,investment_targets,currency:investmentAccounts.find(account=>account.id===first?.holding_account_id)?.currency??draft.currency});}}/>:draft.kind==='savings'?<><label>{t('Cash account')}<NativeSelect required value={draft.account_id??''} onChange={event=>setDraft({...draft,account_id:event.target.value,currency:accounts.find(account=>account.id===event.target.value)!.currency,allocated:0})}>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</NativeSelect></label><label>{t('Allocated amount')}<FormattedNumberInput required={false} value={draft.allocated} max={draft.target||1e15} onValueChange={allocated=>setDraft({...draft,allocated})}/></label><p className="muted">{t('Allocated money stays in the selected account.')}</p></>:<CurrencyValue currency={draft.currency??currency}/>}
   {draft.kind!=='investment'&&<label>{t('Target amount')}<FormattedNumberInput max={1e15} value={draft.target} onValueChange={target=>setDraft({...draft,target})}/></label>}
   <label>{t('Target date')}<DatePicker required={draft.kind==='net_worth'} value={draft.target_date??''} min={data.goals.some(goal=>goal.id===draft.id)?undefined:today} max={maxDate} onChange={date=>setDraft({...draft,target_date:date||null})}/></label>
  <label className="planning-check"><Checkbox checked={draft.archived} onCheckedChange={checked=>setDraft({...draft,archived:checked===true})}/><span>{t('Archived')}</span></label>
  </fieldset></div><div className="goal-dialog-actions">{error&&<p className="error" role="alert">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||draft.target<=0||draft.allocated>draft.target||(draft.kind==='net_worth'&&!draft.target_date)||(draft.kind==='savings'&&!draft.account_id)||(draft.kind==='investment'&&(!investmentGoalTargets(draft).length||investmentGoalTargets(draft).some(item=>!item.holding_account_id||!item.asset_symbol||item.target<=0)||new Set(investmentGoalTargets(draft).map(item=>item.holding_account_id+':'+item.asset_symbol)).size!==investmentGoalTargets(draft).length))}>{t(busy?'Saving…':'Save')}</Button></div></div></form>}</DialogContent></Dialog>{guard.confirmation}
 </>;
}
