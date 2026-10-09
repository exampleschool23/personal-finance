"use client";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { useLanguage } from '@/components/language-provider';
import { assetRecordKinds, assets, income, expenses, type Entry } from '@/lib/finance';
import type { RecordDialogProps } from '../record-dialog';

type Translate=ReturnType<typeof useLanguage>['t'];
type Heading={props:RecordDialogProps;saved:boolean;existing:boolean;assetRecord:boolean;liability:boolean};
const isAccount=(editing:Entry|null)=>editing?.kind==='Cash'||editing?.kind==='Deposit';
const isHolding=(editing:Entry|null)=>editing?.kind==='Stock'||editing?.kind==='Crypto';

/** An asset's title: an account, a holding, or anything else owned. */
const assetTitle=(editing:Entry|null,t:Translate)=>isAccount(editing)?t("Add account"):isHolding(editing)?t("Add holding"):t("Add asset");
/** What adding an asset does, and that it moves no money. */
const assetDescription=(editing:Entry|null,t:Translate)=>isAccount(editing)?t("Record an existing account balance. This adds to your assets; it does not record income or transfer money.")
 :isHolding(editing)?t("Record units you already own and their price. This adds a holding without withdrawing cash from an account."):t("Record the value of something you own. This adds to your assets; it does not record a purchase or withdraw cash.");

/** The dialog's title: Edit record once it is saved, otherwise what is being added. */
function title({props,saved,assetRecord}:Heading,t:Translate){
 const {accountMode=false,editing,editingCashFlow}=props;
 if(saved)return t("Edit record");
 // Investments' Add asset lets the person pick any kind, so the dialog keeps the button's name.
 if(assetRecord)return props.recordKinds.length===assetRecordKinds.length&&assetRecordKinds.every(kind=>props.recordKinds.includes(kind))?t("Add asset"):assetTitle(editing,t);
 if(accountMode)return isHolding(editing)?t("Add holding"):t("Add account");
 if(editingCashFlow)return income.includes(editing!.kind)?t("Add income"):editing!.frequency!=='Once'?t("Recurring bill"):t("Add expense");
 return editing?.kind==='Money lent'?t("Add money lent"):t("Add a record");
}
/** The dialog's one-line description, for the kind of record and whether it is saved already. */
function description({props,existing,assetRecord,liability}:Heading,t:Translate){
 const {accountMode=false,editing,editingCashFlow,recordKinds}=props;
 if(assetRecord)return existing?t("Keep a current balance for this record."):assetDescription(editing,t);
 if(accountMode)return t("Cash and deposits hold a balance. Stocks and crypto are holdings within an account.");
 if(editing?.kind==='Money lent')return t("Keep track of who owes you, how much, and when.");
 if(editing&&expenses.includes(editing.kind))return t(editing.frequency==='Once'?"Choose a category and enter an expense amount. Add notes if needed.":"Enter an amount and choose how often it repeats.");
 if(editingCashFlow)return t(editing?.frequency==='Once'&&props.earningSources?"Choose an income source and record the amount received.":"Enter an amount and choose how often it repeats.");
 return recordKinds===assets||liability?t("Keep a current balance for this record."):t("Keep a current balance or record income and expenses.");
}
/** The dialog's title, with its description behind the ⓘ (and read to screen readers), so the form itself leads. */
export function RecordDialogHeading(heading:Heading){
 const {t}=useLanguage();
 const text=description(heading,t);
 return <><DialogTitle>{title(heading,t)}<InfoHint>{text}</InfoHint></DialogTitle>
  <DialogDescription className="sr-only">{text}</DialogDescription></>;
}
