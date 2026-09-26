"use client";
import { ExpensePlanChart } from '@/components/expense-plan-chart';
import { CurrencySelect } from '@/components/currency-select';
import { useDraftDialog } from '@/components/discard-changes';
import { StopScheduleDialog } from '@/components/stop-schedule-dialog';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { DatePicker } from '@/components/date-picker';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate, formatMonthYear } from '@/lib/format';
import { expensePlanCategories, expensePlanTotals, type ExpensePlan } from '@/lib/expense-plans';

type Props={plans:ExpensePlan[];month:string;currency:string;loading:boolean;error:string;save:(plan:ExpensePlan)=>Promise<void>;remove:(id:string)=>Promise<void>;onSpend:(plan:ExpensePlan)=>void;onRetry:()=>void;currencies:string[]};
export function ExpensePlans({plans,month,currency,currencies,loading,error,save,remove,onSpend,onRetry}:Props) {
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState<ExpensePlan|null>(null),[deleting,setDeleting]=useState<ExpensePlan|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 const guard=useDraftDialog(draft,()=>setDraft(null),busy);
 const [stopping,setStopping]=useState<ExpensePlan|null>(null);
 const money=(amount:number,currency:string)=>formatMoney(amount,currency,locale);
 const open=(plan?:ExpensePlan)=>{setFailure('');setDraft(plan?{...plan,amount:plan.amount||plan.base_amount||0}:{id:crypto.randomUUID(),name:'',category:'Groceries',currency,amount:0,start_date:month+'-01',end_date:null});};
 async function submit(e:React.FormEvent){e.preventDefault();if(!draft||!draft.amount)return;setBusy(true);setFailure('');try{await save(draft);setDraft(null);}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel expense-plans">
  <div className="panel-title"><div><h2>{t('Monthly expense plans')}</h2><p className="muted">{formatMonthYear(month,locale)}</p></div><Button variant="outline" disabled={loading||!!error} onClick={()=>open()}><Plus size={16}/>{t('Add monthly plan')}</Button></div>
  <p className="muted">{t('Plan groceries and support for each family member. Record spending against a plan to track what remains.')}</p>
  {error?<div role="alert" className="error">{t(error)} <Button variant="outline" onClick={onRetry}>{t('Retry')}</Button></div>:loading?<LoadingPlaceholder label={t('Loading plans…')}/>:!plans.length?<p className="expense-plans-empty">{t('No monthly plans yet. Add groceries, Mum’s allowance or another regular expense.')}</p>:<div className="table-scroll"><table><thead><tr><th>{t('Plan')}</th><th>{t('Planned')}</th><th>{t('Spent')}</th><th>{t('Remaining')}</th><th>{t('Budget used')}</th><th>{t('Actions')}</th></tr></thead><tbody>
   {[...plans].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name)).map(plan=>{const totals=expensePlanTotals(plan,month);return <tr key={plan.id}>
    <td><div className="expense-plan-name"><strong>{plan.name}</strong><div className="expense-plan-meta"><CategoryBadge kind={plan.category} label={t(plan.category)}/><small className="muted">{formatDate(plan.start_date,locale)}{plan.end_date?` – ${formatDate(plan.end_date,locale)}`:''}</small></div>{!totals.active&&<small className="muted">{t('Not active in the selected month')}</small>}</div></td>
    <td>{money(totals.planned,plan.currency)}{Number(plan.carryover)>0&&<small className="block">{t('Carried over')}: {money(Number(plan.carryover),plan.currency)}</small>}</td><td>{money(totals.spent,plan.currency)}</td><td className={totals.remaining<0?'negative':''}>{totals.remaining<0?t('Over budget by {amount}',{amount:money(-totals.remaining,plan.currency)}):money(totals.remaining,plan.currency)}</td>
    <td><ExpensePlanChart name={plan.name} category={plan.category} planned={totals.planned} spent={totals.spent}/></td>
    <td><div className="row-actions">{!plan.end_date&&<Button size="sm" variant="outline" onClick={()=>setStopping(plan)}>{t('Stop')}</Button>}<Button size="sm" variant="outline" onClick={()=>onSpend(plan)}>{t('Record spending')}</Button><Button size="icon" variant="ghost" aria-label={t('Edit {name}',{name:plan.name})} onClick={()=>open(plan)}><Pencil size={15}/></Button><Button size="icon" variant="ghost" aria-label={t('Delete {name}',{name:plan.name})} onClick={()=>{setFailure('');setDeleting(plan);}}><Trash2 size={15}/></Button></div></td>
   </tr>;})}
  </tbody></table></div>}
  <p className="muted tracker-help">{t('The forecast uses the higher of planned or spent. Optional rollover carries positive unused amounts forward. Plans do not move money.')}</p>
  <p className="muted tracker-help">{t('If a plan replaces an existing recurring expense, remove that recurring entry to avoid counting both.')}</p>
  {stopping&&<StopScheduleDialog name={stopping.name} start={stopping.start_date} onClose={()=>setStopping(null)} onSave={end_date=>save({...stopping,end_date})}/>}
  <Dialog open={!!draft} onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t(draft&&plans.some(p=>p.id===draft.id)?'Edit monthly plan':'Add monthly plan')}</DialogTitle><DialogDescription>{t('Keep each person or purpose as a separate plan. The amount repeats every month.')}</DialogDescription>
   {draft&&<form className="record-form" onSubmit={submit}><fieldset className="tracker-fields" disabled={busy}>
    <label>{t('Plan name')}<Input required maxLength={120} value={draft.name} placeholder={t('e.g. Groceries or Mum’s allowance')} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <div className="form-grid"><label>{t('Category')}<NativeSelect value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as ExpensePlan['category']})}>{expensePlanCategories.map(category=><option key={category} value={category}>{t(category)}</option>)}</NativeSelect></label><CurrencySelect value={draft.currency} currencies={currencies} savedCurrency={plans.find(plan=>plan.id===draft.id)?.currency} onChange={currency=>setDraft({...draft,currency})}/></div>
    <label>{t('Monthly amount')}<FormattedNumberInput value={draft.amount} onValueChange={amount=>setDraft({...draft,amount})}/></label>
    <label className="planning-check"><Checkbox checked={draft.rollover??false} disabled={busy} onCheckedChange={checked=>setDraft({...draft,rollover:checked===true})}/><span>{t('Carry unused budget into the next month')}</span></label><p className="muted">{t('Amount changes apply from the selected forecast month. Earlier months keep their budgets.')}</p><div className="form-grid"><label>{t('Start date')}<DatePicker value={draft.start_date} onChange={start_date=>setDraft({...draft,start_date})}/></label><label>{t('End date (optional)')}<DatePicker value={draft.end_date||''} required={false} min={draft.start_date} onChange={end_date=>setDraft({...draft,end_date:end_date||null})}/></label></div>
   </fieldset>{failure&&<p role="alert" className="error">{t(failure)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!draft.amount||!draft.name.trim()||!!(draft.end_date&&draft.end_date<draft.start_date)}>{t(busy?'Saving…':'Save plan')}</Button></div></form>}
  </DialogContent></Dialog>{guard.confirmation}
  <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><AlertDialogContent><AlertDialogTitle>{t('Delete monthly plan?')}</AlertDialogTitle><AlertDialogDescription>{t('This moves the plan to Recently deleted and removes it from all planning months. You can restore it there. Plans with recorded spending cannot be deleted; choose Stop to end future planning.')}</AlertDialogDescription>{failure&&<p role="alert" className="error">{t(failure)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async e=>{e.preventDefault();if(!deleting)return;setBusy(true);setFailure('');try{await remove(deleting.id);setDeleting(null);}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}}>{t('Delete plan')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
