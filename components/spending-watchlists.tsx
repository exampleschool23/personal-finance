"use client";
import { CurrencyValue } from '@/components/currency-value';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {formatMoney} from '@/lib/format';
import {watchlistSpending} from '@/lib/spending-watchlists';
import type {PlanningData} from '@/lib/planning';
import type {TransactionSplit} from '@/lib/transaction-tools';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import type {Watchlist} from '@/lib/workspace-preferences';
export function SpendingWatchlists({data,splits,today,currency,preferences}:{data:PlanningData;splits:TransactionSplit[];today:string;currency:string;preferences:PreferenceResource}){
 const {t,locale}=useLanguage();const lists=preferences.data.preferences.find(p=>p.key==='watchlists')?.data.items??[];const [name,setName]=useState(''),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[target,setTarget]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(items:Watchlist[]){setBusy(true);setError('');try{await preferences.save({key:'watchlists',data:{items}});return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 return <section className="panel tools-panel"><h2>{t('Spending watchlists')}</h2><p className="muted">{t('Track actual spending by merchant text and category this month. Daily projections assume the same spending pace; overlapping watchlists are not added together.')}</p>{preferences.loading?<p>{t('Loading records…')}</p>:preferences.error?<p role="alert">{t(preferences.error)} <Button onClick={preferences.retry}>{t('Retry')}</Button></p>:<><div className="review-grid">{lists.map(list=>{const result=watchlistSpending(list,data.records,splits,today);const money=(n:number)=>formatMoney(n,list.currency,locale);return <article key={list.id}><h3>{list.name}</h3><strong className={result.over?'negative':''}>{money(result.spent)} / {money(list.target)}</strong><p>{t('Remaining')}: {money(result.remaining)}</p><p>{t('Projected month total')}: {result.projected===null?'—':money(result.projected)}</p><Button type="button" variant="outline" disabled={busy} onClick={()=>void save(lists.filter(item=>item.id!==list.id))}>{t('Remove')}</Button></article>;})}</div>
 <details><summary>{t('Add spending watchlist')}</summary><form onSubmit={async event=>{event.preventDefault();if(await save([...lists,{id:crypto.randomUUID(),name,query,category,currency,target}])){setName('');setQuery('');setTarget(0);}}}><fieldset disabled={busy} className="tracker-fields"><label>{t('Name')}<Input value={name} required maxLength={80} onChange={event=>setName(event.target.value)}/></label><label>{t('Merchant contains')}<Input value={query} maxLength={120} onChange={event=>setQuery(event.target.value)}/></label><label>{t('Category')}<NativeSelect value={category} onChange={event=>setCategory(event.target.value)}><option value="">{t('All categories')}</option>{data.categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label><CurrencyValue currency={currency}/><label>{t('Monthly target')}<FormattedNumberInput value={target} onValueChange={setTarget}/></label></fieldset><Button disabled={busy||target<=0||!name.trim()||lists.length>=30}>{t('Save')}</Button></form></details></>}{error&&<p role="alert">{t(error)}</p>}</section>;
}
