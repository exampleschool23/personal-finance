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
import { formatMoney, formatNumber } from '@/lib/format';
import { decimalTotalEquals } from '@/lib/decimal-amounts';
import type { Category } from '@/lib/planning';
import type { Entry } from '@/lib/finance';
import type { CategoryRule, TransactionTools } from '@/lib/transaction-tools';
export type ToolsController={data:TransactionTools;loading:boolean;error:string;save:(action:string,data:unknown)=>Promise<void>;retry:()=>void};
export function TransactionToolsPanel({tools,categories,saveCategory}:{tools:ToolsController;categories:Category[];saveCategory:(name:string)=>Promise<void>}){
 const {t,locale}=useLanguage();const [name,setName]=useState(''),[pattern,setPattern]=useState(''),[category,setCategory]=useState(''),[direction,setDirection]=useState<CategoryRule['direction']>('expense'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const confirmation=useUnsavedNavigation(!!name.trim()||!!pattern.trim());
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <section className="panel tools-panel"><h2>{t('Categorization rules')}</h2><p className="muted">{t('Rules match transaction names, including bank imports. The first enabled match wins. Existing transactions and manually selected categories stay unchanged.')}</p>
 {tools.error&&<p role="alert" className="error">{t(tools.error)} <Button onClick={tools.retry}>{t('Retry')}</Button></p>}
 <form className="inline-tool-form" onSubmit={event=>{event.preventDefault();void run(async()=>{await saveCategory(name.trim());setName('');});}}><label>{t('New category')}<Input value={name} required maxLength={80} onChange={event=>setName(event.target.value)}/></label><Button disabled={busy||!name.trim()}>{t('Add category')}</Button></form>
 <form className="inline-tool-form" onSubmit={event=>{event.preventDefault();void run(async()=>{await tools.save('rule',{id:crypto.randomUUID(),pattern:pattern.trim(),category_id:category,direction,priority:Math.min(1000,tools.data.rules.length),enabled:true});setPattern('');});}}>
 <label>{t('Name contains')}<Input required maxLength={120} value={pattern} onChange={event=>setPattern(event.target.value)}/></label><label>{t('Type')}<NativeSelect value={direction} onChange={event=>setDirection(event.target.value as CategoryRule['direction'])}><option value="expense">{t('Expenses')}</option><option value="income">{t('Income')}</option><option value="all">{t('All')}</option></NativeSelect></label><label>{t('Category')}<NativeSelect required value={category} onChange={event=>setCategory(event.target.value)}><option value="">{t('Select category')}</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label><Button disabled={busy||tools.loading||!!tools.error||!pattern.trim()||!category}>{t('Add rule')}</Button></form>
 <ul className="tool-list">{[...tools.data.rules].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).map(rule=><li key={rule.id}><div><strong>{rule.pattern}</strong> · {t(rule.direction==='all'?'All':rule.direction==='income'?'Income':'Expenses')} <CategoryBadge kind={rule.category_id} label={categories.find(item=>item.id===rule.category_id)?.name??t('Category')}/></div><RulePriority key={rule.id+':'+rule.priority} rule={rule} busy={busy} save={priority=>run(()=>tools.save('rule',{...rule,priority}))}/><Button variant="outline" disabled={busy} onClick={()=>void run(()=>tools.save('rule',{...rule,enabled:!rule.enabled}))}>{t(rule.enabled?'Disable':'Enable')}</Button><Button variant="ghost" disabled={busy} onClick={()=>void run(()=>tools.save('delete_rule',{id:rule.id}))}>{t('Delete')}</Button></li>)}</ul>
 {!tools.loading&&!tools.data.rules.length&&<p className="muted">{t('No categorization rules yet.')}</p>}{error&&<p className="error" role="alert">{t(error)}</p>}<p className="muted">{t('{count} rules',{count:formatNumber(tools.data.rules.length,locale,0)})}</p>
 {confirmation}</section>;
}
export function SplitTransactionDialog({record,tools,categories,onClose}:{record:Entry;tools:ToolsController;categories:Category[];onClose:()=>void}){
 const {t,locale}=useLanguage();const [initial]=useState(()=>tools.data.splits.filter(part=>part.record_id===record.id).map(({category_id,amount})=>({category_id,amount:Number(amount)})));
 const [parts,setParts]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useDiscardChanges(JSON.stringify(parts)!==JSON.stringify(initial),onClose,busy);
 const valid=parts.length===0||(parts.length>=2&&parts.every(part=>part.category_id&&part.amount>0)&&decimalTotalEquals(parts.map(part=>part.amount),record.amount));
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Split transaction')}</DialogTitle><DialogDescription>{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</DialogDescription><p>{record.name} · {formatMoney(record.amount,record.currency,locale)}</p><form className="record-form" onSubmit={async event=>{event.preventDefault();if(!valid)return;setBusy(true);setError('');try{await tools.save('split',{record_id:record.id,splits:parts});onClose();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">{parts.map((part,index)=><div className="inline-tool-form" key={index}><label>{t('Category')}<NativeSelect required value={part.category_id} onChange={event=>setParts(parts.map((item,i)=>i===index?{...item,category_id:event.target.value}:item))}><option value="">{t('Select category')}</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</NativeSelect></label><label>{t('Amount')}<FormattedNumberInput value={part.amount} max={1e15} onValueChange={amount=>setParts(parts.map((item,i)=>i===index?{...item,amount}:item))}/></label><Button type="button" variant="ghost" onClick={()=>setParts(parts.filter((_,i)=>i!==index))}>{t('Remove')}</Button></div>)}<Button type="button" variant="outline" disabled={parts.length>=50} onClick={()=>setParts([...parts,{category_id:'',amount:0}])}>{t('Add split')}</Button><Button type="button" variant="ghost" onClick={()=>setParts([])}>{t('Clear split')}</Button></fieldset>
 {!valid&&<p role="status">{t('Use at least two categories and make the amounts equal the transaction total.')}</p>}{!categories.length&&<p>{t('Add custom categories in Settings first.')}</p>}{error&&<p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={guard.close}>{t('Cancel')}</Button><Button disabled={busy||!valid||!!tools.error||tools.loading}>{t(busy?'Saving…':'Save split')}</Button></div></form></DialogContent></Dialog>{guard.confirmation}</>;
}

function RulePriority({rule,busy,save}:{rule:CategoryRule;busy:boolean;save:(priority:number)=>Promise<void>}){
 const {t}=useLanguage();const [priority,setPriority]=useState(rule.priority);
 return <form className="inline-tool-form" onSubmit={event=>{event.preventDefault();if(Number.isInteger(priority))void save(priority);}}><fieldset disabled={busy} className="tracker-fields"><label>{t('Priority')}<FormattedNumberInput value={priority} max={1000} required={false} onValueChange={setPriority}/></label></fieldset><Button disabled={busy||priority===rule.priority||!Number.isInteger(priority)}>{t('Save')}</Button></form>;
}
