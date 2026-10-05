"use client";
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { useState, type ReactNode } from 'react';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { BusinessPicker } from '@/components/transactions/pickers';
import { TagSelector } from '@/components/transactions/tags';
import { showError } from '@/lib/feedback';
import { canAssignBusiness } from '@/lib/business';
import { canTag, type Tag } from '@/lib/tags';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';

type TagProps={tags:readonly Tag[];tagIds:readonly string[];onTags:(add:string[],remove:string[])=>Promise<unknown>;onCreateTag:(name:string)=>Promise<string>};
/** A transaction at a glance. Its business, tags and receipts change right here, as on the transaction drawer. */
export function TransactionDetailsDialog({record:initial,incoming,categoryName,businesses,onBusiness,tagging,accountName,attachments,editable,onEdit,onClose}:{record:Entry;incoming:boolean;categoryName?:string;businesses:readonly BusinessOption[];onBusiness:(business:string|null)=>Promise<number>;tagging:TagProps;accountName?:string;attachments?:ReactNode;editable:boolean;onEdit:()=>void;onClose:()=>void}) {
 const {t,locale}=useLanguage();
 const [record,setRecord]=useState(initial),[tagIds,setTagIds]=useState<readonly string[]>(tagging.tagIds);
 const business=businesses.find(item=>item.id===record.business_id);
 async function changeBusiness(next:string|null){try{if(await onBusiness(next))setRecord({...record,business_id:next});}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 async function toggleTag(id:string){const has=tagIds.includes(id);try{await tagging.onTags(has?[]:[id],has?[id]:[]);setTagIds(has?tagIds.filter(item=>item!==id):[...tagIds,id]);}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 const money=(value:number)=>formatMoney(value,record.currency,locale);
 const rows:[string,ReactNode][]=[
  [t('Amount'),<strong key="a" className={incoming?'positive':undefined}>{`${incoming?'+':'−'}${money(record.amount)}`}</strong>],
  [t('Category'),<span key="c" className="flex flex-wrap gap-1"><CategoryBadge kind={record.kind} label={t(record.payment_type==='bonus'?'Bonus':record.kind)}/>{categoryName&&record.custom_category_id&&<CategoryBadge kind={record.custom_category_id} label={categoryName}/>}</span>],
  [t('Date'),formatDate(record.date,locale)],
  [t('Frequency'),t(record.frequency==='Once'?'One-time record':record.frequency)],
 ];
 if(record.end_date)rows.push([t('Last active date'),formatDate(record.end_date,locale)]);
 if(record.mortgage_payment_id)rows.push([t('Principal'),money(Number(record.payment_principal))],[t('Interest'),money(Number(record.payment_interest))]);
 const businessEditable=businesses.length>0&&(canAssignBusiness(record,null)||businesses.some(item=>canAssignBusiness(record,item.id)));
 if(businessEditable)rows.push([t('Business'),<BusinessPicker key="b" record={record} businesses={businesses} onChange={next=>void changeBusiness(next)}/>]);
 else if(business)rows.push([t('Business'),business.name]);
 if(canTag(record))rows.push([t('Tags'),<TagSelector key="t" tags={tagging.tags} selected={tagIds} onToggle={id=>void toggleTag(id)} onCreate={tagging.onCreateTag}/>]);
 if(accountName)rows.push([t('Account'),accountName]);
 if(record.account_currency&&record.account_currency!==record.currency&&record.account_exchange_rate)rows.push([t('Exchange rate'),`1 ${record.account_currency} = ${formatNumber(record.account_exchange_rate,locale)} ${record.currency}`]);
 if(record.notes)rows.push([t('Notes'),<span key="n" className="whitespace-pre-wrap break-words">{record.notes}</span>]);
 if(attachments)rows.push([t('Attachments'),attachments]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent><DialogTitle>{record.name}</DialogTitle><DialogDescription>{t('Transaction details')}</DialogDescription><dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-4 gap-y-3 text-sm">{rows.map(([label,value])=><div key={label} className="contents"><dt className="muted">{label}</dt><dd>{value}</dd></div>)}</dl><FormFooter onCancel={onClose} cancelLabel={t('Close')}>{editable&&<Button type="button" onClick={onEdit}>{t('Edit')}</Button>}</FormFooter></DialogContent></Dialog>;
}
