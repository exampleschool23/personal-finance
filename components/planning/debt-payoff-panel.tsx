"use client";
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {useUnsavedNavigation} from '@/components/discard-changes';
import {formatMoney,formatNumber,formatDate} from '@/lib/format';
import {debtPayoff,type PayoffMethod} from '@/lib/debt-payoff';
import {liabilities,type Entry} from '@/lib/finance';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import type {WorkspacePreference} from '@/lib/workspace-preferences';
type Plan=Extract<WorkspacePreference,{key:'debt_plan'}>['data'];
export function DebtPayoffPanel({records,currency,today,preferences}:{records:Entry[];currency:string;today:string;preferences:PreferenceResource}){
 const {t}=useLanguage();const saved=preferences.data.preferences.find(p=>p.key==='debt_plan');
 return <section className="panel tools-panel"><h2>{t('Debt payoff planner')}</h2><p className="muted">{t('Compare fixed-rate monthly scenarios. Minimum payments are planning assumptions; this does not record payments. Fees, new borrowing and rate changes are excluded.')}</p>{preferences.loading?<p>{t('Loading records…')}</p>:preferences.error?<p role="alert">{t(preferences.error)} <Button onClick={preferences.retry}>{t('Retry')}</Button></p>:<PayoffEditor key={JSON.stringify(saved)+currency} records={records} currency={currency} today={today} initial={saved?.data.currency===currency?saved.data:{currency,extra:0,method:'avalanche',payments:{}}} save={preferences.save}/>}</section>;
}
function PayoffEditor({records,currency,today,initial,save}:{records:Entry[];currency:string;today:string;initial:Plan;save:PreferenceResource['save']}){
 const {t,locale}=useLanguage();const [draft,setDraft]=useState(initial),[saved,setSaved]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');const guard=useUnsavedNavigation(JSON.stringify(draft)!==JSON.stringify(saved));
 const debts=records.filter(r=>liabilities.includes(r.kind)&&r.currency===currency&&r.amount>0);
 const inputs=debts.map(r=>({id:r.id,balance:r.amount,annualRate:r.rate,minimum:draft.payments[r.id]??r.estimated_monthly_payment??0}));
 const result=debtPayoff(inputs,draft.extra,draft.method),baseline=debtPayoff(inputs,0,draft.method);
 const alternative=debtPayoff(inputs,draft.extra,draft.method==='snowball'?'avalanche':'snowball');
 const money=(n:number)=>formatMoney(n,currency,locale);
 // A month-end projection avoids promising an exact contractual payment day.
 const date=result?.months===null||result?.months===undefined?'':new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1+result.months+1,0)).toISOString().slice(0,10);
 return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save({key:'debt_plan',data:draft});setSaved(draft);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <p>{t('Only debts in {currency} are included.',{currency})}</p><fieldset disabled={busy} className="tracker-fields"><label>{t('Payoff method')}<NativeSelect value={draft.method} onChange={event=>setDraft({...draft,method:event.target.value as PayoffMethod})}><option value="avalanche">{t('Highest interest first')}</option><option value="snowball">{t('Smallest balance first')}</option></NativeSelect></label><label>{t('Extra monthly payment')}<FormattedNumberInput value={draft.extra} required={false} onValueChange={extra=>setDraft({...draft,extra})}/></label>{debts.map(debt=><label key={debt.id}>{debt.name} · {t('Minimum monthly payment')}<FormattedNumberInput value={draft.payments[debt.id]??debt.estimated_monthly_payment??0} required={false} onValueChange={minimum=>setDraft({...draft,payments:{...draft.payments,[debt.id]:minimum}})}/></label>)}</fieldset>
 {result&&debts.length>0?<div className="review-grid"><article><h3>{t('Monthly payment budget')}</h3><strong>{money(result.budget)}</strong></article><article><h3>{t('Estimated debt-free date')}</h3><strong>{date?formatDate(date,locale):t('Not repaid within 50 years')}</strong></article><article><h3>{t('Estimated interest')}</h3><strong>{result.months===null?'—':money(result.interest)}</strong></article><article><h3>{t('Interest saved by extra payments')}</h3><strong>{baseline?.months!=null&&result.months!==null?money(baseline.interest-result.interest):'—'}</strong></article></div>:<p>{t('Add a debt to compare payoff strategies.')}</p>}
 {alternative?.months!=null&&<p>{t('Alternative method: {months} months, {interest} interest.',{months:formatNumber(alternative.months,locale,0),interest:money(alternative.interest)})}</p>}
 <Button disabled={busy||!debts.length}>{t('Save plan')}</Button>{error&&<p role="alert">{t(error)}</p>}{guard}</form>;
}
