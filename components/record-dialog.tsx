"use client";
import { RecordDialogHeading } from './record-dialog/heading';
import { RecordForm } from './record-dialog/record-form';
import { ExpenseRecordForm } from './record-dialog/expense-form';
import { RecordEditHistory } from '@/components/record-edit-history';
import { type MortgagePayment } from '@/components/mortgage-payment-dialog';
import { IncomeRecordForm } from '@/components/income-record-form';
import { useDiscardChanges } from '@/components/discard-changes';
import { useState } from 'react';
import type { Dispatch, SetStateAction, FormEvent } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';
import { formatDate as sharedFormatDate } from '@/lib/format';
import { assetRecordKinds, liabilities, income, expenses, type Entry } from '@/lib/finance';
import { type HouseholdState } from '@/lib/household';
import { type ExpensePlan } from '@/lib/expense-plans';
import type { PlanningData } from '@/lib/planning';
export type RecordDialogProps={navigate?:(path:string)=>void;/** Follows a link out of the dialog: closes it, or asks first when there are unsaved changes. */onLeave?:(event:{preventDefault:()=>void},path:string)=>void;onDebtSaved?:()=>void;onMortgageSave?:(payment:MortgagePayment)=>Promise<void>;onMortgageDone?:()=>void;onPaymentDraftState?:(dirty:boolean,busy:boolean)=>void;requestPaymentSwitch?:(action:()=>void)=>void;onDebtPayment?:(record:Entry)=>void;earningSources?:import('@/hooks/use-earning-sources').EarningSourcesController;currencies:string[];accountMode?:boolean;/** The open household: a transaction moved to another account follows that account's owner. */household?:HouseholdState|null;editing:Entry|null;setEditing:Dispatch<SetStateAction<Entry|null>>;busy:boolean;rows:Entry[];save:(e:FormEvent)=>void;editingCashFlow:boolean;recordKinds:readonly string[];demo:boolean;summary:Entry[];field:(key:keyof Entry,value:string|number)=>void;linkedExpensePlan?:ExpensePlan;availableBusinesses:Array<{id:string;name:string}>;expensePlans:{plans:ExpensePlan[];month:string;loading:boolean;error:string;save?:(plan:ExpensePlan)=>Promise<void>};money:(n:number,c?:string)=>string;fetchingPrice:boolean;fetchPrice:()=>void;priceMessage:string;error:string;planning:{loading:boolean;error:string;data:PlanningData}};
type Props=RecordDialogProps;
// A transaction moved to another account takes that account's business and, in a household, its owner.
/** The record dialog: the expense form, the income form, or the record form for everything else, with the record's edit history. */
export function RecordDialog(props:Props){
 const {accountMode=false,editing,setEditing,busy,rows,demo,planning}=props;
 const {t,locale}=useLanguage();const formatDate=(date:string)=>sharedFormatDate(date,locale);
 const existing=!!editing&&[...rows,...planning.data.records].some(row=>row.id===editing.id);
 // A saved record carries a revision, also one saved after the planning list loaded; a new draft has none.
 const saved=existing||!!editing?.revision;
 const [paymentState,setPaymentState]=useState({dirty:false,busy:false});
 const [initial]=useState(()=>JSON.stringify(editing));
 const dirty=!!editing&&(JSON.stringify(editing)!==initial||paymentState.dirty);
 const guard=useDiscardChanges(dirty,()=>setEditing(null),busy||paymentState.busy);
 const assetRecord=!!editing&&assetRecordKinds.includes(editing.kind);
 const liability=!!editing&&liabilities.includes(editing.kind);
 const leave=(event:{preventDefault:()=>void},path:string)=>{if(!dirty){setEditing(null);return;}event.preventDefault();guard.request(()=>{setEditing(null);props.navigate?.(path);});};
 return <><Dialog open={!!editing} onOpenChange={open => { if (!open && !busy)
        guard.close(); }}><DialogContent className={editing&&expenses.includes(editing.kind)?"record-dialog expense-dialog":"record-dialog"} showCloseButton={false} onOpenAutoFocus={event=>{const amount=(event.currentTarget as HTMLElement).querySelector<HTMLInputElement>('.expense-form .amount-value-field input:not([disabled])');if(amount){event.preventDefault();amount.focus();}}}><DialogClose className="absolute top-4 right-4" aria-label={t('Close')} disabled={busy}><X size={18}/></DialogClose><RecordDialogHeading props={props} saved={saved} existing={existing} assetRecord={assetRecord} liability={liability}/>{editing && (expenses.includes(editing.kind)?<ExpenseRecordForm key={editing.id} {...props} onLeave={leave} busy={busy||paymentState.busy} onMortgageDone={()=>setEditing(null)} onPaymentDraftState={(dirty,paymentBusy)=>setPaymentState(previous=>previous.dirty===dirty&&previous.busy===paymentBusy?previous:{dirty,busy:paymentBusy})} requestPaymentSwitch={action=>{if(paymentState.dirty)guard.request(action);else action();}} onDebtPayment={props.onDebtPayment?record=>guard.request(()=>props.onDebtPayment!(record)):undefined} setEditing={update=>update===null?guard.close():setEditing(update)}/>:income.includes(editing.kind)?<IncomeRecordForm key={editing.id} {...props} onLeave={leave} setEditing={update=>update===null?guard.close():setEditing(update)}/>:<RecordForm form={{...props,editing,accountMode,existing,assetRecord,liability,formatDate,onCancel:guard.close}}/>)}{existing&&!demo&&editing&&<RecordEditHistory key={'history:'+editing.id} record={editing}/>}</DialogContent></Dialog>{guard.confirmation}</>;
}
