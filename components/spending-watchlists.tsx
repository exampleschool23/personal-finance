"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import {ResourceState} from '@/components/presentation-foundation/resource-state';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {FormattedNumberInput} from '@/components/presentation-foundation/formatted-number-input';
import {formatMoney,formatNumber} from '@/lib/format';
import {watchlistSpending} from '@/lib/spending-watchlists';
import type {PlanningData} from '@/lib/planning';
import type {TransactionSplit} from '@/lib/transaction-tools';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
import type {Watchlist} from '@/lib/workspace-preferences';
export function SpendingWatchlists({data,splits,today,currency,currencies,preferences}:{data:PlanningData;splits:TransactionSplit[];today:string;currency:string;currencies:string[];preferences:PreferenceResource}){
 const {t,locale}=useLanguage();const lists=preferences.data.preferences.find(p=>p.key==='watchlists')?.data.items??[];const [name,setName]=useState(''),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[target,setTarget]=useState(0),[picked,setListCurrency]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const listCurrency=currencies.includes(picked)?picked:currency;
 const blocked=lists.length>=30?t('You can keep up to {count} watchlists.',{count:formatNumber(30,locale)}):!name.trim()?t('Enter a name.'):target<=0?t('Enter an amount greater than zero.'):undefined;
 async function save(items:Watchlist[]){setBusy(true);setError('');try{await preferences.save({key:'watchlists',data:{items}});return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 return <section className="panel tools-panel"><h2>{t('Spending watchlists')}<InfoHint>{t('Track actual spending by merchant text and category this month. Daily projections assume the same spending pace; overlapping watchlists are not added together.')}</InfoHint></h2><ResourceState loading={preferences.loading} error={preferences.error} onRetry={preferences.retry}><div className="review-grid">{lists.map(list=>{const result=watchlistSpending(list,data.records,splits,today);const money=(n:number)=>formatMoney(n,list.currency,locale);return <article key={list.id}><h3>{list.name}</h3><strong className={result.over?'negative':''}>{money(result.spent)} / {money(list.target)}</strong><p>{t('Remaining')}: {money(result.remaining)}</p><p>{t('Projected month total')}: {result.projected===null?'—':money(result.projected)}</p><DeleteButton disabled={busy} label={t('Remove {name}',{name:list.name})} onClick={()=>void save(lists.filter(item=>item.id!==list.id))}/></article>;})}</div>
 <details><summary>{t('Add spending watchlist')}</summary><form onSubmit={async event=>{event.preventDefault();if(await save([...lists,{id:crypto.randomUUID(),name,query,category,currency:listCurrency,target}])){setName('');setQuery('');setTarget(0);setListCurrency('');}}}><fieldset disabled={busy} className="tracker-fields"><label>{t('Name')}<Input value={name} required maxLength={80} onChange={event=>setName(event.target.value)}/></label><label>{t('Merchant contains')}<Input value={query} maxLength={120} onChange={event=>setQuery(event.target.value)}/></label><label>{t('Category')}<NativeSelect value={category} onChange={event=>setCategory(event.target.value)}><option value="">{t('All categories')}</option>{data.categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label><CurrencySelect value={listCurrency} currencies={currencies} onChange={setListCurrency}/><label>{t('Monthly target')}<FormattedNumberInput value={target} onValueChange={setTarget}/></label></fieldset><span title={busy?undefined:blocked}><Button disabled={busy||!!blocked}>{t('Save')}</Button></span></form></details></ResourceState>{error&&<p role="alert">{t(error)}</p>}</section>;
}
