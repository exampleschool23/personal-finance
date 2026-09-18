"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { CategoryBadge } from '@/components/category-badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDiscardChanges, useUnsavedNavigation } from '@/components/discard-changes';
import { formatMoney } from '@/lib/format';
import { decimalTotalEquals } from '@/lib/decimal-amounts';
import type { Category } from '@/lib/planning';
import { income, expenses, type Entry } from '@/lib/finance';
import type { TransactionTools } from '@/lib/transaction-tools';
export type ToolsController={data:TransactionTools;loading:boolean;error:string;save:(action:string,data:unknown)=>Promise<void>;retry:()=>void};
export function TransactionToolsPanel({categories,saveCategory,loading,error,onRetry}:{categories:Category[];saveCategory:(name:string,direction:Category['direction'])=>Promise<void>;loading:boolean;error:string;onRetry:()=>void}){
 const {t}=useLanguage();
 return <section id="categories" className="panel tools-panel category-settings"><h2>{t('Categories')}</h2><p className="muted">{t('Add income and expense categories to use when recording transactions.')}</p>
 {error&&<p role="alert" className="error">{t(error)} <Button onClick={onRetry}>{t('Retry')}</Button></p>}
 {(['income','expense'] as const).map(direction=><CategoryGroup key={direction} direction={direction} categories={categories.filter(category=>category.direction===direction)} saveCategory={saveCategory} disabled={loading||!!error}/>)}
 </section>;
}
function CategoryGroup({direction,categories,saveCategory,disabled}:{direction:Category['direction'];categories:Category[];saveCategory:(name:string,direction:Category['direction'])=>Promise<void>;disabled:boolean}){
 const {t}=useLanguage();const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const confirmation=useUnsavedNavigation(!!name.trim());
 const defaults=direction==='income'?income:expenses;
 return <section className="category-group"><h3>{t(direction==='income'?'Income categories':'Expense categories')}</h3>
 <ul className="category-badges">{defaults.map(kind=><li key={kind}><CategoryBadge kind={kind} label={t(kind)}/></li>)}{categories.map(category=><li key={category.id}><CategoryBadge kind={category.id} label={category.name}/></li>)}</ul>
 <form className="category-create-form" onSubmit={async event=>{event.preventDefault();if(disabled||busy||!name.trim())return;setBusy(true);setError('');try{await saveCategory(name.trim(),direction);setName('');}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <label>{t(direction==='income'?'New income category':'New expense category')}<Input required maxLength={80} value={name} disabled={disabled||busy} placeholder={t(direction==='income'?'e.g. Freelance':'e.g. Leisure')} onChange={event=>setName(event.target.value)}/></label>
 <Button disabled={disabled||busy||!name.trim()}>{t(busy?'Saving…':direction==='income'?'Add income category':'Add expense category')}</Button></form>
 {error&&<p className="error" role="alert">{t(error)}</p>}{confirmation}</section>;
}
export function SplitTransactionDialog({record,tools,categories,onClose}:{record:Entry;tools:ToolsController;categories:Category[];onClose:()=>void}){
 const {t,locale}=useLanguage();const [initial]=useState(()=>tools.data.splits.filter(part=>part.record_id===record.id).map(({category_id,amount})=>({category_id,amount:Number(amount)})));
 const [parts,setParts]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useDiscardChanges(JSON.stringify(parts)!==JSON.stringify(initial),onClose,busy);
 const valid=parts.length===0||(parts.length>=2&&parts.every(part=>part.category_id&&part.amount>0)&&decimalTotalEquals(parts.map(part=>part.amount),record.amount));
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Split transaction')}</DialogTitle><DialogDescription>{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</DialogDescription><p>{record.name} · {formatMoney(record.amount,record.currency,locale)}</p><form className="record-form" onSubmit={async event=>{event.preventDefault();if(!valid)return;setBusy(true);setError('');try{await tools.save('split',{record_id:record.id,splits:parts});onClose();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">{parts.map((part,index)=><div className="inline-tool-form" key={index}><label>{t('Category')}<NativeSelect required value={part.category_id} onChange={event=>setParts(parts.map((item,i)=>i===index?{...item,category_id:event.target.value}:item))}><option value="">{t('Select category')}</option>{categories.filter(category=>category.direction===(income.includes(record.kind)?'income':'expense')).map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</NativeSelect></label><label>{t('Amount')}<FormattedNumberInput value={part.amount} max={1e15} onValueChange={amount=>setParts(parts.map((item,i)=>i===index?{...item,amount}:item))}/></label><Button type="button" variant="ghost" onClick={()=>setParts(parts.filter((_,i)=>i!==index))}>{t('Remove')}</Button></div>)}<Button type="button" variant="outline" disabled={parts.length>=50} onClick={()=>setParts([...parts,{category_id:'',amount:0}])}>{t('Add split')}</Button><Button type="button" variant="ghost" onClick={()=>setParts([])}>{t('Clear split')}</Button></fieldset>
 {!valid&&<p role="status">{t('Use at least two categories and make the amounts equal the transaction total.')}</p>}{!categories.length&&<p>{t('Add income or expense categories in Settings first.')}</p>}{error&&<p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!valid||!!tools.error||tools.loading}>{t(busy?'Saving…':'Save split')}</Button></div></form></DialogContent></Dialog>{guard.confirmation}</>;
}
