"use client";
import {ResourceState} from '@/components/presentation-foundation/resource-state';
import {useState} from 'react';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {emptyPlanning} from '@/lib/planning';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {formatDate,formatMoney,formatNumber} from '@/lib/format';
import {cadenceLabels,recurringPlanDraft,recurringSuggestions,suspectedDuplicates} from '@/lib/recurring-insights';
import type {Entry} from '@/lib/finance';
function TransactionInsightsContent({records,today,onReview}:{records:Entry[];today:string;onReview:(record:Entry)=>void}){
 const {t,locale}=useLanguage();const suggestions=recurringSuggestions(records,today),duplicates=suspectedDuplicates(records);
 if(!suggestions.length&&!duplicates.length)return null;
 return <section className="panel tools-panel"><h2>{t('Transaction review suggestions')}</h2><p>{t('Patterns are suggestions based on recorded transactions. Review dates and amounts before saving a recurring plan. No schedule or payment is created automatically.')}</p><ul className="tool-list">{suggestions.map(item=><li key={item.id}><div><strong>{item.record.name}</strong><p>{t(cadenceLabels[item.cadence])} · {formatMoney(item.record.amount,item.record.currency,locale)} · {formatDate(item.next,locale)}</p>{item.changed&&<p>{t('Last amount changed from {amount}.',{amount:formatMoney(item.previous,item.record.currency,locale)})}</p>}</div><Button variant="outline" onClick={()=>onReview(recurringPlanDraft(item.record,item.cadence,item.next,crypto.randomUUID()))}>{t('Review recurring plan')}</Button></li>)}</ul>
 {!!duplicates.length&&<details><summary>{t('Possible duplicate transactions')}</summary><p>{t('Identical purchases can be legitimate. Compare these records with your statement before editing or deleting anything.')}</p><ul className="tool-list">{duplicates.map(rows=><li key={rows[0].id}>{rows[0].name} · {formatDate(rows[0].date,locale)} · {formatMoney(rows[0].amount,rows[0].currency,locale)} · {t('{count} records',{count:formatNumber(rows.length,locale,0)})}</li>)}</ul></details>}</section>;
}

export function TransactionInsights({owner,demo=false,revision=0,...props}:{owner?:string|null;demo?:boolean;revision?:number;records:Entry[];today:string;onReview:(record:Entry)=>void}){
 const {t}=useLanguage();const [open,setOpen]=useState(false);
 const resource=useOwnerResource('/api/planning?scope=insights',owner??null,!!owner&&!demo&&open,revision,emptyPlanning);
 if(!owner||demo)return <TransactionInsightsContent {...props}/>;
 return <section className="panel tools-panel"><Button variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t('Transaction review suggestions')}</Button>{open&&<ResourceState loading={resource.loading} error={resource.error} onRetry={resource.retry}><TransactionInsightsContent {...props} records={resource.data.records}/></ResourceState>}</section>;
}
