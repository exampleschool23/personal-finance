"use client";
import { offeredKinds } from '@/lib/removed-categories';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { ScheduleFields } from '@/components/presentation-foundation/schedule-fields';
import { MonthDayField } from '@/components/presentation-foundation/month-day-field';
import { RecordNameInput } from '@/components/record-name-input';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { ScheduledPaymentField } from '@/components/presentation-foundation/scheduled-payment-field';
import { chooseSchedule, paymentSchedules } from '@/lib/planning';
import { frequencyLabels } from '@/lib/finance';
import { selectTransactionCategory } from '@/lib/transaction-categories';
import { InvestmentTracker } from '@/components/investment-tracker-lazy';
import { MortgagePaymentDialog } from '@/components/mortgage-payment-dialog';
import { AmountCurrencyFields } from '@/components/presentation-foundation/amount-currency-fields';
import Link from 'next/link';
import { useState } from 'react';
import { CashAccountField } from '@/components/cash-account-field';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate as sharedFormatDate } from '@/lib/format';
import { liabilities, type Entry } from '@/lib/finance';
import { depositToday as today } from '@/lib/deposit-interest';
import type { RecordDialogProps } from '../record-dialog';
import { withAccountAndOwner } from './record-form';

/** The expense form: an expense in a category, or a payment on a debt. */
/** What every part of the expense form reads: the dialog's props with the expense being entered, and the form's own state. */
type ExpenseContext=Pick<RecordDialogProps,'onLeave'|'onDebtSaved'|'onMortgageSave'|'onMortgageDone'|'onPaymentDraftState'|'requestPaymentSwitch'|'onDebtPayment'|'household'|'setEditing'|'busy'|'save'|'planning'|'error'|'demo'|'currencies'|'rows'|'original'>&{schedule:boolean;editing:Entry;locale:string;paymentId:string;setPaymentId:(id:string)=>void;debts:Entry[];selectedDebt?:Entry;mode:'expense'|'debt';setMode:(mode:'expense'|'debt')=>void;update:(patch:Partial<Entry>)=>void;savedCurrency?:string};

/** A payment on a loan, debt or mortgage, chosen from the outstanding debts. */
function DebtPayment({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,busy,planning,demo,locale,paymentId,setPaymentId,debts,selectedDebt}=form;
 return <>    <p className="muted">{t('Choose a debt to record a payment.')}</p>
    {planning.loading?<LoadingPlaceholder label={t('Loading records…')} rows={2}/>:planning.error?<p role="alert" className="error">{t(planning.error)}</p>:debts.length?<>
     <label>{t('Loans & debts')}<NativeSelect value={paymentId} disabled={busy} onChange={event=>{const id=event.target.value;const change=()=>{onPaymentDraftState?.(false,false);setPaymentId(id);};if(requestPaymentSwitch)requestPaymentSwitch(change);else change();}}><option value="">{t('Choose a debt')}</option>{debts.map(record=><option key={record.id} value={record.id}>{record.name} · {t(record.kind)} · {formatMoney(record.amount,record.currency,locale)}</option>)}</NativeSelect></label>
     {demo&&selectedDebt&&selectedDebt.kind!=='Mortgage'&&<p className="muted">{t('Debt repayments are available in your signed-in workspace.')}</p>}
     {selectedDebt?.kind==='Mortgage'&&onMortgageSave?<MortgagePaymentDialog inline key={selectedDebt.id} mortgage={selectedDebt} accounts={planning.data.records} onClose={()=>onMortgageDone?.()} onSave={onMortgageSave} onDraftState={onPaymentDraftState}/>:selectedDebt&&!demo?<InvestmentTracker inline key={selectedDebt.id} initialType="withdrawal" record={selectedDebt} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.error} onClose={()=>onMortgageDone?.()} onSaved={()=>onDebtSaved?.()} onPayment={()=>{}} onDraftState={onPaymentDraftState}/>:<Button type="button" disabled={busy||!selectedDebt||(demo&&selectedDebt.kind!=='Mortgage')} onClick={()=>{if(selectedDebt)onDebtPayment?.(selectedDebt);}}>{t('Record payment')}</Button>}
    </>:<p className="muted">{t('No outstanding debts. Add one in Loans & debts first.')}</p>}</>;
}
/** The category of a plain expense, and the amount spent in its currency. */
function CategoryAmount({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {editing,setEditing,busy,planning,currencies,mode,update,savedCurrency,onLeave,schedule,original}=form;
 const removed=planning.data.removedKinds??[];
 return <>   {schedule&&<RecordNameInput label={t('Name')} entry={editing} rows={planning.data.records} original={original} placeholder={t('e.g. Rent or internet subscription')} onChange={name=>update({name})}/>}
   {mode==='expense'&&<div><label>{t('Category')}<NativeSelect disabled={busy||planning.loading||!!planning.error} value={editing.custom_category_id??editing.kind} onChange={event=>{
    const selected=event.target.value;
    setEditing(selectTransactionCategory(editing,selected,planning.data.categories,'expense'));
   }}>{offeredKinds('expense',removed,editing.kind).map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}{planning.data.categories.filter(category=>category.direction==='expense').map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</NativeSelect></label><Link className="panel-link" href="/settings#categories" onNavigate={event=>{if(busy){event.preventDefault();return;}if(onLeave)onLeave(event,'/settings#categories');else setEditing(null);}}>{t('Manage categories in Settings')}</Link></div>}
   {/* A one-time expense may pay a recurring bill, named by its id, also a saved one that named none yet. Otherwise nothing is offered and a choice made earlier is cleared; a saved payment keeps its schedule. */}
   <ScheduledPaymentField schedules={mode==='expense'&&editing.frequency==='Once'&&(savedCurrency===undefined||!original?.occurrence_record_id)?paymentSchedules(planning.data.records,editing):[]} value={editing.occurrence_record_id} saved={!!original?.occurrence_record_id} disabled={busy||planning.loading} onChange={schedule=>update(chooseSchedule(editing,schedule))}/>
   <AmountCurrencyFields amount={editing.amount} currency={editing.currency} currencies={currencies} savedCurrency={savedCurrency} disabled={busy} onAmountChange={amount=>update({amount})} onCurrencyChange={currency=>update({currency,account_exchange_rate:null,account_rate_date:null,account_currency:null})}/></>;
}
/** The day, and for a plain expense the optional details: how it repeats, a business, an end date and notes. */
function DateDetails({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {household,editing,setEditing,busy,planning,locale,mode,update,schedule,original}=form;
 // A saved schedule keeps its start date; an every-month one may move to another day of its month.
 const started=schedule&&!!original&&original.frequency!=='Once';
 return <>   <div className="form-grid"><label>{t(editing.frequency==='Once'?'Record date':'Start date')}<DatePicker value={editing.date} disabled={started} max={editing.frequency==='Once'?today():undefined} onChange={date=>update({date})}/></label>{schedule?<><ScheduleFields frequency={editing.frequency} days={editing.recurrence_days} disabled={busy} onChange={(frequency,recurrence_days)=>update({frequency,recurrence_days})}/>{editing.frequency==='Monthly'&&<MonthDayField date={editing.date} disabled={busy} onChange={date=>update({date})}/>}</>:<CashAccountField entry={editing} records={planning.data.records} loading={planning.loading} error={planning.error} busy={busy} onChange={account_id=>setEditing(withAccountAndOwner(editing,account_id,planning.data.records,household))}/>}</div>
   {planning.error&&<p className="error" role="alert">{t(planning.error)}</p>}
   {mode==='expense'&&<section className="expense-optional-details"><h3>{t('Optional details')}</h3><div className="expense-optional-fields">
    <label>{t('Linked business (optional)')}<NativeSelect value={editing.business_id||''} onChange={event=>update({business_id:event.target.value||null})}><option value="">{t('No linked business')}</option>{planning.data.records.filter(record=>record.kind==='Business').map(business=><option key={business.id} value={business.id}>{business.name}</option>)}</NativeSelect></label>
    {editing.frequency!=='Once'&&<label>{t('End date (optional)')}<DatePicker value={editing.end_date||''} required={false} min={editing.date} onChange={end_date=>update({end_date:end_date||null})}/></label>}
    <label>{t('Notes (optional)')}<textarea value={editing.notes} maxLength={2000} rows={2} onChange={event=>update({notes:event.target.value})}/></label>
   </div></section>}
   {editing.frequency!=='Once'&&<p className="muted">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.',{amount:formatMoney(editing.amount,editing.currency,locale),frequency:t(frequencyLabels[editing.frequency]),date:sharedFormatDate(editing.date,locale)})}</p>}</>;
}
/** The error and the Save and Cancel buttons; a debt payment that saves on its own shows none. */
function ExpenseActions({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {onMortgageSave,setEditing,busy,error,demo,selectedDebt,mode}=form;
 return <>  {!(mode==='debt'&&selectedDebt&&((selectedDebt.kind==='Mortgage'&&onMortgageSave)||(!demo&&selectedDebt.kind!=='Mortgage')))&&<div className="expense-form-actions"><ErrorPopup message={error}/><FormFooter busy={busy} onCancel={()=>setEditing(null)}>{mode!=='debt'&&<Button className="primary" disabled={busy}>{t(busy?'Saving…':demo?'Save in demo':'Save expense')}</Button>}</FormFooter></div>}</>;
}

export function ExpenseRecordForm({onLeave,onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,household,editing,setEditing,busy,save,planning,error,demo,currencies,rows,original}:RecordDialogProps){
 const {t,locale}=useLanguage();
 const [paymentId,setPaymentId]=useState('');
 const debts=planning.data.records.filter(record=>liabilities.includes(record.kind)&&record.amount>0);
 const selectedDebt=debts.find(record=>record.id===paymentId);
 const [mode,setMode]=useState<'expense'|'debt'>('expense');
 // A bill opened as a schedule (Recurring's Add recurring, or editing one) sets how it repeats and takes no cash account;
 // every other expense form records one payment.
 const [schedule]=useState(()=>!!editing&&editing.frequency!=='Once');
 if(!editing)return null;
 const update=(patch:Partial<Entry>)=>setEditing({...editing,...patch});
 const savedCurrency=original?.currency;
 const form:ExpenseContext={schedule,onLeave,onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,household,editing,setEditing,busy,save,planning,error,demo,currencies,rows,original,locale,paymentId,setPaymentId,debts,selectedDebt,mode,setMode,update,savedCurrency};
 return <form className="record-form expense-form" onSubmit={event=>{if(mode==='debt'){event.preventDefault();return;}save(event);}}>
  <Tabs className="expense-mode-tabs" value={mode} onValueChange={next=>{const change=()=>{onPaymentDraftState?.(false,false);setMode(next as 'expense'|'debt');};if(requestPaymentSwitch)requestPaymentSwitch(change);else change();}}>
   {!schedule&&onDebtPayment&&<TabsList aria-label={t('Expense type')}><TabsTrigger value="expense" disabled={busy}>{t('Expense')}</TabsTrigger><TabsTrigger value="debt" disabled={busy}>{t('Debt / mortgage')}</TabsTrigger></TabsList>}
    <TabsContent value="debt" className="expense-form-scroll"><DebtPayment form={form}/></TabsContent>
   <TabsContent value={mode==='debt'?'expense':mode} className="expense-form-scroll">
    <CategoryAmount form={form}/><DateDetails form={form}/>
  </TabsContent></Tabs>
   <ExpenseActions form={form}/>
 </form>;
}
