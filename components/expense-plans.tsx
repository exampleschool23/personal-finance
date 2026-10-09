"use client";
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { ExpensePlanChart } from '@/components/expense-plan-chart';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { useDraftDialog } from '@/components/discard-changes';
import { StopScheduleDialog } from '@/components/stop-schedule-dialog';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { useState } from 'react';
import { Plus, ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate } from '@/lib/format';
import { expensePlanCategories, expensePlanTotals, type ExpensePlan } from '@/lib/expense-plans';

type Props={plans:ExpensePlan[];month:string;currency:string;loading:boolean;error:string;save:(plan:ExpensePlan)=>Promise<void>;remove:(id:string)=>Promise<void>;onSpend:(plan:ExpensePlan)=>void;onRetry:()=>void;currencies:string[]};
export function ExpensePlans({plans,month,currency,currencies,loading,error,save,remove,onSpend,onRetry}:Props) {
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState<ExpensePlan|null>(null),[deleting,setDeleting]=useState<ExpensePlan|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 const [stopping,setStopping]=useState<ExpensePlan|null>(null);
 // Listed in the display currency; the plan dialog keeps the plan's own.
 const {show:money}=useDisplayMoney();
 const open=(plan?:ExpensePlan)=>setDraft(plan?{...plan,amount:plan.amount||plan.base_amount||0}:newExpensePlan(currency,month));
 return <section className="panel expense-plans">
  <PanelTitle title={t('Monthly expense plans')} hint={<>
   <p>{t('Plan groceries and support for each family member. Record spending against a plan to track what remains.')}</p>
   <p>{t('The forecast uses the higher of planned or spent. Optional rollover carries positive unused amounts forward. Plans do not move money.')}</p>
   <p>{t('If a plan replaces an existing recurring expense, remove that recurring entry to avoid counting both.')}</p>
  </>}><Button variant="outline" disabled={loading||!!error} onClick={()=>open()}><Plus size={16}/>{t('Add monthly plan')}</Button></PanelTitle>
  {error?<InlineError as="div" message={t(error)} onRetry={onRetry}/>:loading?<LoadingPlaceholder label={t('Loading plans…')}/>:!plans.length?<EmptyState icon={<ShoppingBasket aria-hidden="true"/>} description={t('No monthly plans yet. Add groceries, Mum’s allowance or another regular expense.')}/>:<div className="table-scroll"><table className="expense-plan-table"><thead><tr><th>{t('Plan')}</th><th>{t('Planned')}</th><th>{t('Spent')}</th><th>{t('Remaining')}</th><th>{t('Budget used')}</th><th>{t('Actions')}</th></tr></thead><tbody>
   {[...plans].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name)).map(plan=>{const totals=expensePlanTotals(plan,month);return <tr key={plan.id}>
    <td><div className="expense-plan-name"><strong>{plan.name}</strong><div className="expense-plan-meta"><CategoryBadge kind={plan.category} label={t(plan.category)}/><small className="muted">{formatDate(plan.start_date,locale)}{plan.end_date?` – ${formatDate(plan.end_date,locale)}`:''}</small></div>{!totals.active&&<small className="muted">{t('Not active in the selected month')}</small>}</div></td>
    <td>{money(totals.planned,plan.currency)}{Number(plan.carryover)>0&&<small className="block">{t('Carried over')}: {money(Number(plan.carryover),plan.currency)}</small>}</td><td data-label={t('Spent')}>{money(totals.spent,plan.currency)}</td><td data-label={t('Remaining')} className={totals.remaining<0?'negative':''}>{totals.remaining<0?t('Over budget by {amount}',{amount:money(-totals.remaining,plan.currency)}):money(totals.remaining,plan.currency)}</td>
    <td><ExpensePlanChart name={plan.name} category={plan.category} planned={totals.planned} spent={totals.spent}/></td>
    <td><div className="row-actions"><Button size="sm" variant="outline" onClick={()=>onSpend(plan)}>{t('Record spending')}</Button><RowMenu label={t('Actions for {name}',{name:plan.name})} items={[{label:t('Edit'),onSelect:()=>open(plan)},!plan.end_date&&{label:t('Stop'),onSelect:()=>setStopping(plan)},{label:t('Delete'),deletes:true,onSelect:()=>{setFailure('');setDeleting(plan);}}]}/></div></td>
   </tr>;})}
  </tbody></table></div>}
  {stopping&&<StopScheduleDialog name={stopping.name} start={stopping.start_date} onClose={()=>setStopping(null)} onSave={end_date=>save({...stopping,end_date})}/>}
  {draft&&<ExpensePlanDialog plan={draft} editing={plans.some(p=>p.id===draft.id)} savedCurrency={plans.find(plan=>plan.id===draft.id)?.currency} currencies={currencies} save={save} onClose={()=>setDraft(null)}/>}
  <ConfirmDialog deletes open={!!deleting} onClose={()=>setDeleting(null)} busy={busy} title={t('Delete monthly plan?')} description={t('This moves the plan to Recently deleted and removes it from all planning months. You can restore it there. Plans with recorded spending cannot be deleted; choose Stop to end future planning.')} error={failure} confirmLabel={t('Delete plan')} onConfirm={async()=>{if(!deleting)return;setBusy(true);setFailure('');try{await remove(deleting.id);setDeleting(null);}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}}/>
 </section>;
}

/** A new plan for the month: groceries by default, in the person's currency. */
export const newExpensePlan=(currency:string,month:string):ExpensePlan=>({id:crypto.randomUUID(),name:'',category:'Groceries',currency,amount:0,start_date:month+'-01',end_date:null});

/** Add or edit one monthly expense plan. Cash flow's plan list and the expense form's Plan tab share it. */
export function ExpensePlanDialog({plan,editing=false,savedCurrency,currencies,save,onClose,onSaved}:{plan:ExpensePlan;editing?:boolean;savedCurrency?:string;currencies:string[];save:(plan:ExpensePlan)=>Promise<void>;onClose:()=>void;onSaved?:(plan:ExpensePlan)=>void}){
 const {t}=useLanguage();
 const [draft,setDraft]=useState(plan),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 const guard=useDraftDialog(draft,onClose,busy);
 async function submit(e:React.FormEvent){e.preventDefault();e.stopPropagation();if(!draft.amount)return;setBusy(true);setFailure('');try{await save(draft);onSaved?.(draft);onClose();}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}
 return <>
  <Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t(editing?'Edit monthly plan':'Add monthly plan')}<InfoHint>{t('Keep each person or purpose as a separate plan. The amount repeats every month.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Keep each person or purpose as a separate plan. The amount repeats every month.')}</DialogDescription>
   <form className="record-form" onSubmit={submit}><fieldset className="tracker-fields" disabled={busy}>
    <label>{t('Plan name')}<Input required maxLength={120} value={draft.name} placeholder={t('e.g. Groceries or Mum’s allowance')} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <div className="form-grid"><label>{t('Category')}<NativeSelect value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as ExpensePlan['category']})}>{expensePlanCategories.map(category=><option key={category} value={category}>{t(category)}</option>)}</NativeSelect></label><CurrencySelect value={draft.currency} currencies={currencies} savedCurrency={savedCurrency} onChange={currency=>setDraft({...draft,currency})}/></div>
    <label>{t('Monthly amount')}<FormattedNumberInput value={draft.amount} onValueChange={amount=>setDraft({...draft,amount})}/></label>
    <label className="planning-check"><Checkbox checked={draft.rollover??false} disabled={busy} onCheckedChange={checked=>setDraft({...draft,rollover:checked===true})}/><span>{t('Carry unused budget into the next month')}</span></label><p className="muted">{t('Amount changes apply from the selected forecast month. Earlier months keep their budgets.')}</p><div className="form-grid"><label>{t('Start date')}<DatePicker value={draft.start_date} onChange={start_date=>setDraft({...draft,start_date})}/></label><label>{t('End date (optional)')}<DatePicker value={draft.end_date||''} required={false} min={draft.start_date} onChange={end_date=>setDraft({...draft,end_date:end_date||null})}/></label></div>
   </fieldset><ErrorPopup message={failure}/><FormFooter busy={busy} onCancel={guard.close}><Button disabled={busy||!draft.amount||!draft.name.trim()||!!(draft.end_date&&draft.end_date<draft.start_date)}>{t(busy?'Saving…':'Save plan')}</Button></FormFooter></form>
  </DialogContent></Dialog>{guard.confirmation}
 </>;
}
