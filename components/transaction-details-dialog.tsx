"use client";
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';

export function TransactionDetailsDialog({record,incoming,categoryName,businessName,accountName,editable,onEdit,onClose}:{record:Entry;incoming:boolean;categoryName?:string;businessName?:string;accountName?:string;editable:boolean;onEdit:()=>void;onClose:()=>void}) {
 const {t,locale}=useLanguage();
 const money=(value:number)=>formatMoney(value,record.currency,locale);
 const rows:[string,ReactNode][]=[
  [t('Amount'),<strong key="a" className={incoming?'positive':'negative'}>{`${incoming?'+':'−'}${money(record.amount)}`}</strong>],
  [t('Category'),<span key="c" className="flex flex-wrap gap-1"><CategoryBadge kind={record.kind} label={t(record.payment_type==='bonus'?'Bonus':record.kind)}/>{categoryName&&record.custom_category_id&&<CategoryBadge kind={record.custom_category_id} label={categoryName}/>}</span>],
  [t('Date'),formatDate(record.date,locale)],
  [t('Frequency'),t(record.frequency==='Once'?'One-time record':record.frequency)],
 ];
 if(record.end_date)rows.push([t('Last active date'),formatDate(record.end_date,locale)]);
 if(record.mortgage_payment_id)rows.push([t('Principal'),money(Number(record.payment_principal))],[t('Interest'),money(Number(record.payment_interest))]);
 if(businessName)rows.push([t('Business'),businessName]);
 if(accountName)rows.push([t('Account'),accountName]);
 if(record.account_currency&&record.account_currency!==record.currency&&record.account_exchange_rate)rows.push([t('Exchange rate'),`1 ${record.currency} = ${formatNumber(record.account_exchange_rate,locale)} ${record.account_currency}`]);
 if(record.notes)rows.push([t('Notes'),<span key="n" className="whitespace-pre-wrap break-words">{record.notes}</span>]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent><DialogTitle>{record.name}</DialogTitle><DialogDescription>{t('Transaction details')}</DialogDescription><dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-4 gap-y-3 text-sm">{rows.map(([label,value])=><div key={label} className="contents"><dt className="muted">{label}</dt><dd>{value}</dd></div>)}</dl><div className="record-form-footer"><Button type="button" variant="outline" onClick={onClose}>{t('Close')}</Button>{editable&&<Button type="button" onClick={onEdit}>{t('Edit')}</Button>}</div></DialogContent></Dialog>;
}
