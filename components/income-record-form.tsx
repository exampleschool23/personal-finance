"use client";
import { IncomeSourcePicker } from '@/components/income-source-picker';
import Link from 'next/link';
import { Settings2, ArrowRight, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { RecordIcon } from '@/components/record-icon';
import { RecordNameInput } from '@/components/record-name-input';
import { AmountCurrencyFields } from '@/components/amount-currency-fields';
import { DatePicker } from '@/components/date-picker';
import { CashAccountField } from '@/components/cash-account-field';
import { earningSourcePaymentStatus, selectEarningSource } from '@/lib/earning-sources';
import { income, type Entry } from '@/lib/finance';
import { incomeSources, selectIncomeSource, changeIncomeKind } from '@/lib/income-sources';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';
import type { RecordDialogProps } from '@/components/record-dialog';

function ScheduledPaymentSummary({date,label}:{date:string;label:string}){
 const {t,locale}=useLanguage();
 return <div className="scheduled-payment-summary">
  <span className="scheduled-payment-icon" aria-hidden="true"><CalendarDays size={21}/></span>
  <div className="scheduled-payment-details"><div className="scheduled-payment-heading"><span>{label}</span><span className="scheduled-payment-auto">{t('Automatic')}</span></div>
   <strong>{formatDate(date,locale)}</strong>
   <p>{t('From your income plan. Enter the date received below.')}</p>
  </div>
 </div>;
}

export function IncomeRecordForm({editing,setEditing,busy,save,rows,currencies,planning,error,demo,earningSources,onNavigateToSources}:RecordDialogProps & {onNavigateToSources?:()=>void}){
 const {t,locale}=useLanguage();
 const original=rows.find(row=>row.id===editing?.id);
 const [salaryPlan,setSalaryPlan]=useState(()=>editing?.kind==='Salary'&&editing.frequency!=='Once');
 if(!editing)return null;
 const update=(patch:Partial<Entry>)=>setEditing({...editing,...patch});
 const sources=incomeSources(editing.kind,planning.data.records,editing.id);
 const sourceId=editing.kind==='Business income'?editing.business_id:editing.income_source_id;
 const source=sources.find(row=>row.id===sourceId);
 const reusable=earningSources?.sources.find(item=>item.id===editing.earning_source_id);
 const simple=!!earningSources&&editing.frequency==='Once';
 const retained=!!original&&!original.earning_source_id&&original.kind!=='Other income'&&!editing.earning_source_id&&editing.kind===original.kind;
 const named=!reusable&&(editing.kind==='Other income'||salaryPlan);
 const legacy=!!original&&!original.income_source_id&&!original.business_id&&original.kind===editing.kind&&!sourceId;
 const missing=editing.earning_source_id?!reusable:!named&&!source&&!legacy;
 const sourceLabel=editing.kind==='Salary'?'Linked salary':editing.kind==='Rent income'?'Linked rental':'Linked business';
 const sourcePlaceholder=editing.kind==='Salary'?'Choose a salary plan':editing.kind==='Rent income'?'Choose a rental':'Choose a business';
 return <form className="record-form" onSubmit={save}>
  {simple&&earningSources&&<div><IncomeSourcePicker value={editing.earning_source_id??(retained?'saved':editing.kind==='Other income'?'':'choose')} disabled={busy||earningSources.loading||!!earningSources.error} options={[
   {id:'',name:t('Other income'),kind:'Other income'},
   ...(original&&!original.earning_source_id&&original.kind!=='Other income'?[{id:'saved',name:original.name,kind:original.kind}]:[]),
   ...(editing.earning_source_id&&!reusable?[{id:editing.earning_source_id,name:editing.name,kind:editing.kind,disabled:true}]:[]),
   ...earningSources.sources.filter(item=>!item.archived||item.id===original?.earning_source_id).map(item=>({id:item.id,name:item.name,kind:item.kind,estimate:item.mode==='fixed'?item.amount:null,currency:item.currency,frequency:item.frequency,payment:planning.loading||planning.error?null:earningSourcePaymentStatus(item,editing.date,planning.data.occurrences)}))
  ]} onChange={id=>{
   const item=earningSources.sources.find(source=>source.id===id);
   setSalaryPlan(false);
   if(item)update(selectEarningSource(editing,item));
   else if(id==='saved'&&original)update({kind:original.kind,name:original.name,business_id:original.business_id,income_source_id:original.income_source_id,income_due_on:original.income_due_on,earning_source_id:null,earning_due_on:null,payment_type:'regular'});
   else setEditing({...changeIncomeKind(editing,'Other income'),earning_source_id:null,earning_due_on:null,payment_type:'regular'});
  }}/>
  <Button asChild variant="outline" className="mt-3 min-h-11 w-full" disabled={busy}><Link href="/income-expenses#income-sources" aria-disabled={busy} onNavigate={event=>{if(busy){event.preventDefault();return;}(onNavigateToSources??(()=>setEditing(null)))();}}><Settings2 aria-hidden="true"/>{t('Manage income sources')}<ArrowRight aria-hidden="true"/></Link></Button>
   {earningSources.loading&&<p className="muted" role="status">{t('Loading income sources…')}</p>}
   {earningSources.error&&<div className="error" role="alert">{t(earningSources.error)} <Button type="button" variant="outline" disabled={busy} onClick={earningSources.retry}>{t('Retry')}</Button></div>}
  </div>}
  {reusable&&<label>{t('Payment type')}<NativeSelect value={editing.payment_type??'regular'} disabled={busy} onChange={event=>update(selectEarningSource(editing,reusable,event.target.value==='bonus'))}><option value="regular">{t('Regular income')}</option><option value="bonus">{t('Bonus')}</option></NativeSelect></label>}
  {reusable&&editing.payment_type!=='bonus'&&reusable.mode==='fixed'&&<ScheduledPaymentSummary label={t('Scheduled payment date')} date={editing.earning_due_on??''}/>}
  {salaryPlan&&<p className="muted">{t('Set up the recurring salary plan you will select when recording payments.')}</p>}
  {!simple&&<label>{t('Category')}<NativeSelect value={editing.kind} disabled={busy||!!reusable} leadingIcon={<RecordIcon record={editing}/>} onChange={event=>{setSalaryPlan(false);setEditing(changeIncomeKind(editing,event.target.value as Entry['kind']));}}>{income.map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}</NativeSelect></label>}
  {!reusable&&(named?<RecordNameInput label={salaryPlan?t('Salary plan name'):t('Name')} entry={editing} rows={planning.data.records} original={original} placeholder={t(salaryPlan?'e.g. Monthly salary':'e.g. Freelance payment')} onChange={name=>update({name})}/>:!simple&&<div><label>{t(sourceLabel)}<NativeSelect required={!legacy} value={sourceId??''} disabled={busy||planning.loading||!!planning.error} onChange={event=>{const selected=sources.find(row=>row.id===event.target.value);if(selected)update(selectIncomeSource(editing,selected));else update({name:'',business_id:null,income_source_id:null});}}><option value="">{legacy?original.name:t(sourcePlaceholder)}</option>{sources.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</NativeSelect></label>
   {!planning.loading&&!planning.error&&!sources.length&&<p className="muted">{t(editing.kind==='Salary'?'Add a salary plan before recording its income.':editing.kind==='Rent income'?'Add a property in Assets & investments first.':'Add a business in Assets & investments first.')}</p>}
   {editing.kind==='Salary'?earningSources?<Link href="/income-expenses#income-sources">{t('Add income source')}</Link>:!original&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setSalaryPlan(true);update({name:'',income_source_id:null,income_due_on:null,business_id:null,frequency:'Monthly',end_date:null,account_id:null});}}>{t('Add salary plan')}</Button>:<Link href="/assets">{t('Assets & investments')}</Link>}
  </div>)}
  {editing.kind==='Salary'&&source&&<ScheduledPaymentSummary label={t('Salary due date')} date={editing.income_due_on??''}/>}
  <AmountCurrencyFields amountPlaceholder={reusable?.mode==='fixed'&&editing.payment_type!=='bonus'&&reusable.currency===editing.currency&&reusable.amount!==null?formatNumber(reusable.amount,locale,0):undefined} amount={editing.amount} currency={editing.currency} currencies={currencies} savedCurrency={original?.currency} disabled={busy} label={t(salaryPlan?'Amount per occurrence':'Amount')} onAmountChange={amount=>update({amount})} onCurrencyChange={currency=>update({currency,account_exchange_rate:null,account_rate_date:null,account_currency:null})}/>
  <div className="form-grid"><label>{t(editing.frequency==='Once'?'Record date':'Start date')}<DatePicker value={editing.date} min={editing.kind==='Salary'&&source?source.date:undefined} max={editing.kind==='Salary'&&source?source.end_date??undefined:undefined} onChange={date=>update({date})}/></label>
  {!simple&&!reusable&&(editing.kind!=='Salary'||salaryPlan)&&<label>{t('Repeats')}<NativeSelect disabled={busy} value={editing.frequency} onChange={event=>update({frequency:event.target.value as Entry['frequency'],account_id:null,end_date:event.target.value==='Once'?null:editing.end_date})}>{!salaryPlan&&<option value="Once">{t('One time')}</option>}<option value="Monthly">{t('Every month')}</option><option value="Yearly">{t('Every year')}</option></NativeSelect></label>}</div>
  {editing.frequency!=='Once'&&<><label>{t('End date (optional)')}<DatePicker value={editing.end_date??''} required={false} min={editing.date} onChange={date=>update({end_date:date||null})}/></label><p className="muted">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.',{amount:formatMoney(editing.amount,editing.currency,locale),frequency:t(editing.frequency==='Monthly'?'every month':'every year'),date:formatDate(editing.date,locale)})}</p></>}
  {!salaryPlan&&<CashAccountField entry={editing} records={planning.data.records} loading={planning.loading} error={planning.error} busy={busy} onChange={account_id=>update({account_id})}/>}
  {planning.error&&<p className="error" role="alert">{t(planning.error)}</p>}
  <label>{t('Notes (optional)')}<textarea value={editing.notes} maxLength={2000} rows={2} onChange={event=>update({notes:event.target.value})}/></label>
  {error&&<p className="error" role="alert">{t(error)}</p>}
  <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>{t('Cancel')}</Button><Button className="primary" disabled={busy||missing||(!named&&(planning.loading||!!planning.error))|| (!!editing.earning_source_id&&(earningSources?.loading||!!earningSources?.error))}>{t(busy?'Saving…':salaryPlan?'Save salary plan':demo?'Save in demo':'Save income')}</Button></div>
 </form>;
}
