"use client";
import { isInstrumentAccount } from '@/lib/holding-accounts';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { GoalDetail } from './goal-detail';
import { useGoalOrder } from '@/hooks/use-goal-order';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { useDraftDialog } from '@/components/discard-changes';
import { useState } from 'react';
import { MoreHorizontal, Plus, Target } from 'lucide-react';
import { goalEmoji } from '@/lib/goal-emoji';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoalInvestmentEditor } from './goal-investment-editor';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption,formatDate,formatMoney,formatNumber,formatPercent,calendarIso,parseCalendarDate } from '@/lib/format';
import { type Goal,type PlanningData } from '@/lib/planning';
import { investmentGoalItems, investmentGoalTargets, investmentGoalCompletion } from '@/lib/investment-goals';
import { InvestmentGoalPlan } from './investment-goal-plan';
import { goalCurrency as measuredIn, goalCurrentValue, goalFinancials, goalStatus, goalSummary } from '@/lib/goal-projection';
import { GoalSummaryRow } from './goal-summary-row';
import { GoalSetupFlow } from './goal-setup-flow';
import { savingsDefaults } from '@/lib/goal-setup';
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
 // The page's three views, switched from the top bar: the goals, the chosen goal's planner, and cash goal history.
 const [view,setView]=useState<'overview'|'planner'|'history'>('overview');
 const [setup,setSetup]=useState(false);
 const [draft,setDraft]=useState<Goal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState(''),[deleting,setDeleting]=useState(false);
 const guard=useDraftDialog(draft,()=>setDraft(null),busy);
 const investmentAccounts=(data.holdingAccounts??[]).filter(isInstrumentAccount);
 const accounts=data.records.filter(record=>record.kind==='Cash'),today=depositToday();
 // New goals start in the primary currency, not the currency shown in the top bar.
 const primary=currencies[0]??currency;
 const maxDate=calendarIso(new Date(parseCalendarDate(today)!.getFullYear()+100,parseCalendarDate(today)!.getMonth(),parseCalendarDate(today)!.getDate()));
 const goalCurrency=(goal:Goal)=>measuredIn(goal,{records:accounts,holdingAccounts:investmentAccounts},currency);
 const open=(goal?:Goal)=>{setError('');setDraft(goal?{...goal,kind:goal.kind??'savings',currency:goalCurrency(goal),investment_targets:investmentGoalTargets(goal)}:{id:crypto.randomUUID(),name:'',kind:'net_worth',currency:primary,account_id:null,target:0,allocated:0,target_date:null,archived:false,monthly_contribution:null,annual_return:0});};
 // A new stock or crypto goal skips the add-goal flow and opens the holdings editor directly.
 const openInvestment=()=>{const account=investmentAccounts[0];setSetup(false);setError('');setDraft({id:crypto.randomUUID(),name:'',kind:'investment',currency:account?.currency??currency,account_id:null,target:0,allocated:0,target_date:null,archived:false,monthly_contribution:null,annual_return:0,holding_account_id:account?.id??null,asset_kind:account?.kind??null,asset_symbol:null,investment_targets:account?[{holding_account_id:account.id,asset_kind:account.kind,asset_symbol:'',target:0,monthly_contribution:null}]:[]});};
 const order=useGoalOrder(data.goals,preferences,owner,demo);
 const visible=order.goals.filter(goal=>!!goal.archived===archived),active=visible.find(goal=>goal.id===selected)??visible[0];
 const totals=new Map([...new Set([...currencies,...data.goals.map(goalCurrency)])].map(currency=>[currency,goalFinancials(data.records,plans,today.slice(0,7),currency,market,plansReady)]));
 const financials=active?totals.get(goalCurrency(active)):null;
 const archivedCount=order.goals.filter(goal=>goal.archived).length;
 // Goals page: one list in the person's own order (drag the six dots) with the chosen goal and what is free for goals;
 // the planner and the cash moved in and out of goals are their own views.
 const plannerFor=(id:string)=>{setSelected(id);setView('planner');};
 return <>
  <PageHeader title={t('Goals')} tabs={<Segmented className="page-tabs" as="nav" label={t('Goals')} options={[{value:'overview',label:t('Overview')},{value:'planner',label:t('Goal planner')},{value:'history',label:t('History')}]} value={view} onChange={setView}/>}><Button onClick={()=>setSetup(true)}><Plus size={17} aria-hidden="true"/>{t('Add goal')}</Button></PageHeader>
  <ErrorPopup message={order.error}/>
  {preferences.error&&!demo&&<InlineError message={t('Load saved preferences before making changes.')} onRetry={preferences.retry}/>}
  {view==='overview'&&<>
  <section className="panel goals-list" aria-label={t('Savings goals')}>
   <PanelTitle title={t(archived?'Archived':'Goals')} count={<Count value={visible.length}/>} hint={accounts.length?undefined:<>{t('Net-worth and investment goals do not need a cash account. Cash savings goals reserve money in a cash account.')} <Link href="/accounts">{t('Accounts')}</Link></>}>
    {(archivedCount>0||archived)&&<Segmented label={t('Show archived goals')} options={[{value:'active',label:t('Active')},{value:'archived',label:t('Archived')}]} value={archived?'archived':'active'} onChange={value=>{setArchived(value==='archived');setSelected('');}}/>}
   </PanelTitle>
   {!visible.length?<EmptyState icon={<Target aria-hidden="true"/>} title={t('What are you working toward?')} description={t('Set a target amount and date, then explore how monthly investments can get you there.')}><Button onClick={()=>setSetup(true)}><Plus size={17} aria-hidden="true"/>{t('Add goal')}</Button></EmptyState>
   :<SortableList id="goal-order" items={visible.map(goal=>goal.id)} disabled={order.disabled} nameOf={id=>visible.find(goal=>goal.id===id)?.name??''} onMove={(id,target)=>{setSelected(active?.id??'');void order.reorder(id,target,visible.map(goal=>goal.id));}}><ul className="goal-rows">{visible.map(goal=>{
    const investment=goal.kind==='investment',holdingItems=investmentGoalItems(goal,data);
    const currency=goalCurrency(goal),account=accounts.find(account=>account.id===goal.account_id),current=goalCurrentValue(goal,totals.get(currency)?.netWorth??null),money=(n:number)=>formatMoney(n,currency,locale);
    const percent=investment?investmentGoalCompletion(goal,data):current===null?null:Math.max(0,Math.min(100,current/goal.target*100));
    const status=investment?(percent!==null&&percent>=100?'completed':null):goalStatus(goalSummary(goal,current,today));
    return <SortableItem key={goal.id} id={goal.id} label={goal.name} as="li" className={'goal-row'+(active?.id===goal.id?' is-selected':'')}>
     <button type="button" className="goal-row-main" aria-current={active?.id===goal.id||undefined} onClick={()=>setSelected(goal.id)}>
      <GoalSummaryRow emoji={goalEmoji(goal,investment&&holdingItems.every(item=>item.target.asset_kind==='Crypto'))} name={goal.name} status={status} percent={percent} amount={investment?(percent===null?'—':formatPercent(percent,locale,0)):current===null?'—':money(current)} meta={<>{goal.target_date?formatDate(goal.target_date,locale):t('No target date')}{account&&<> · {account.name}</>}</>} detail={investment?`${t('Holdings')} · ${formatNumber(holdingItems.length,locale,0)}`:t('{percent} of {amount}',{percent:percent===null?'—':formatPercent(percent,locale,0),amount:money(goal.target)})}/>
     </button>
     <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="goal-row-menu" aria-label={t('Actions for {name}',{name:goal.name})}><MoreHorizontal size={18} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>plannerFor(goal.id)}>{t('Goal planner')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>open(goal)}>{t('Edit goal')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </SortableItem>;
   })}</ul></SortableList>}
  </section>
  {/* The chosen goal beside what is free for goals; the two end together. */}
  <div className="goals-split">
   {active&&active.kind!=='investment'&&<GoalDetail goal={active} current={active.kind==='net_worth'?financials?.netWorth??null:Number(active.allocated)} currency={goalCurrency(active)} today={today}/>}
   <GoalFundingPanel data={data} currency={currency} surplus={totals.get(currency)?.surplus??null} today={today} rates={market?.rates} owner={owner} demo={demo} revision={revision} onSaved={onSaved} part="funding"/>
  </div>
  </>}
  {view==='planner'&&(active?<>
   {/* The planner works on the goal chosen in Overview; with several goals it is switched here too. */}
   {visible.length>1&&<label className="goal-planner-pick">{t('Goal')}<NativeSelect value={active.id} onChange={event=>setSelected(event.target.value)}>{visible.map(goal=><option key={goal.id} value={goal.id}>{goal.name}</option>)}</NativeSelect></label>}
   <div className="goal-planner-destination" role="region" aria-label={t('Goal planner')}>{active.kind==='investment'?<InvestmentGoalPlan currency={currency} market={market} key={JSON.stringify(active)} goal={active} data={data} today={today} save={save} onEdit={()=>open(active)}/>:<GoalForecast key={JSON.stringify([active,goalCurrency(active)])} goal={active} starting={active.kind==='net_worth'?financials?.netWorth??null:active.allocated} surplus={fundingRoom(data.goals,active,financials?.surplus??null,goalCurrency(active),today,market?.rates)} currency={goalCurrency(active)} today={today} snapshots={snapshots} historyError={historyError} save={save} onEdit={()=>open(active)}/>}</div>
   {active&&active.kind!=='investment'&&<GoalScenarios key={active.id} goal={active} starting={active.kind==='net_worth'?financials?.netWorth??null:Number(active.allocated)} currency={goalCurrency(active)} today={today} preferences={preferences}/>}
  </>:<section className="panel"><EmptyState icon={<Target aria-hidden="true"/>} title={t('What are you working toward?')} description={t('Set a target amount and date, then explore how monthly investments can get you there.')}><Button onClick={()=>setSetup(true)}><Plus size={17} aria-hidden="true"/>{t('Add goal')}</Button></EmptyState></section>)}
  {view==='history'&&<GoalFundingPanel data={data} currency={currency} surplus={totals.get(currency)?.surplus??null} today={today} rates={market?.rates} owner={owner} demo={demo} revision={revision} onSaved={onSaved} part="activity"/>}
  {setup&&<GoalSetupFlow goals={data.goals} accounts={accounts} currency={primary} currencies={currencies} netWorth={code=>totals.get(code)?.netWorth??null} today={today} maxDate={maxDate} save={save} onClose={()=>setSetup(false)} onInvestment={openInvestment} onCreated={ids=>{void order.append(ids);setSetup(false);setArchived(false);plannerFor(ids[0]);}}/>}
  <Dialog open={!!draft} onOpenChange={next=>{if(!next&&!busy)guard.close();}}><DialogContent className="record-dialog goal-dialog" showCloseButton={!busy}><DialogTitle>{t('Goal')}</DialogTitle><DialogDescription>{t('Set a net-worth target, reserve cash, or accumulate coins and shares.')}</DialogDescription>{draft&&<form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const created=!data.goals.some(goal=>goal.id===draft.id);await save('goal',draft);if(created)void order.append([draft.id]);setSelected(draft.id);setDraft(null);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><div className="goal-dialog-scroll"><fieldset className="tracker-fields" disabled={busy}>
   <label>{t('Goal type')}<NativeSelect value={draft.kind} onChange={event=>{const kind=event.target.value as Goal['kind'];const investmentAccount=investmentAccounts[0];setDraft({...draft,kind,account_id:kind==='savings'?savingsDefaults(accounts,primary).account_id:null,allocated:0,target:0,monthly_contribution:null,annual_return:0,holding_account_id:kind==='investment'?investmentAccount?.id??null:null,asset_kind:kind==='investment'?investmentAccount?.kind??null:null,asset_symbol:null,investment_targets:kind==='investment'&&investmentAccount?[{holding_account_id:investmentAccount.id,asset_kind:investmentAccount.kind,asset_symbol:'',target:0,monthly_contribution:null}]:[],currency:kind==='investment'?investmentAccount?.currency??primary:kind==='savings'?savingsDefaults(accounts,primary).currency:primary});}}><option value="net_worth">{t('Net-worth goal')}</option><option value="savings" disabled={!accounts.length}>{t('Savings goal')}</option><option value="investment">{t('Stock / crypto accumulation')}</option></NativeSelect></label>
   <label>{t('Name')}<Input required maxLength={120} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
   {draft.kind==='investment'?<GoalInvestmentEditor targets={investmentGoalTargets(draft)} accounts={investmentAccounts} busy={busy} onChange={investment_targets=>{const first=investment_targets[0];setDraft({...draft,...first,investment_targets,currency:investmentAccounts.find(account=>account.id===first?.holding_account_id)?.currency??draft.currency});}}/>:draft.kind==='savings'?<><label>{t('Cash account')}<NativeSelect required value={draft.account_id??''} onChange={event=>setDraft({...draft,account_id:event.target.value,currency:accounts.find(account=>account.id===event.target.value)!.currency,allocated:0})}>{accounts.map(account=><option key={account.id} value={account.id}>{formatAccountOption(account,locale)}</option>)}</NativeSelect></label><label>{t('Allocated amount')}<FormattedNumberInput required={false} value={draft.allocated} max={draft.target||1e15} onValueChange={allocated=>setDraft({...draft,allocated})}/></label><p className="muted">{t('Allocated money stays in the selected account.')}</p></>:<CurrencySelect value={draft.currency??currency} savedCurrency={draft.currency??undefined} currencies={currencies} disabled={busy} onChange={next=>setDraft({...draft,currency:next})}/>}
   {draft.kind!=='investment'&&<label>{t('Target amount')}<FormattedNumberInput max={1e15} value={draft.target} onValueChange={target=>setDraft({...draft,target})}/></label>}
   <label>{t('Target date')}<DatePicker required={draft.kind==='net_worth'} value={draft.target_date??''} min={data.goals.some(goal=>goal.id===draft.id)?undefined:today} max={maxDate} onChange={date=>setDraft({...draft,target_date:date||null})}/></label>
  <label className="planning-check"><Checkbox checked={draft.archived} onCheckedChange={checked=>setDraft({...draft,archived:checked===true})}/><span>{t('Archived')}</span></label>
  </fieldset></div><div className="goal-dialog-actions"><ErrorPopup message={error}/><div className="record-form-footer">{!demo&&data.goals.some(goal=>goal.id===draft.id)&&<Button type="button" variant="destructive" className="goal-delete" disabled={busy} onClick={()=>setDeleting(true)}>{t('Delete goal')}</Button>}<Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||draft.target<=0||draft.allocated>draft.target||(draft.kind==='net_worth'&&!draft.target_date)||(draft.kind==='savings'&&!draft.account_id)||(draft.kind==='investment'&&(!investmentGoalTargets(draft).length||investmentGoalTargets(draft).some(item=>!item.holding_account_id||!item.asset_symbol||item.target<=0)||new Set(investmentGoalTargets(draft).map(item=>item.holding_account_id+':'+item.asset_symbol)).size!==investmentGoalTargets(draft).length))}>{t(busy?'Saving…':'Save')}</Button></div></div></form>}</DialogContent></Dialog><ConfirmDialog open={deleting} onClose={()=>setDeleting(false)} busy={busy} title={t('Delete {name}?',{name:draft?.name??''})} description={t('The goal and its activity move to Recently deleted. Money stays in your accounts, and you can restore the goal later.')} confirmLabel={t(busy?'Deleting…':'Delete goal')} destructive error={error} onConfirm={async()=>{if(!draft)return;setBusy(true);setError('');try{await save('delete_goal',{id:draft.id});if(selected===draft.id)setSelected('');setDeleting(false);setDraft(null);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}/>{guard.confirmation}
 </>;
}
