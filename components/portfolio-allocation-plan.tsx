"use client";
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {FormattedNumberInput} from '@/components/formatted-number-input';
import {Button} from '@/components/ui/button';
import {useUnsavedNavigation} from '@/components/discard-changes';
import {assets,value,type Entry} from '@/lib/finance';
import {marketEntry,type MarketData} from '@/lib/market';
import {allocationDrift} from '@/lib/portfolio-performance';
import {formatMoney,formatNumber} from '@/lib/format';
import {CategoryBadge} from '@/components/category-badge';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
export function PortfolioAllocationPlan({records,currency,market,preferences}:{records:Entry[];currency:string;market:MarketData|null;preferences:PreferenceResource}){
 const {t}=useLanguage();const saved=preferences.data.preferences.find(p=>p.key==='allocation');
 return <section className="panel tools-panel"><h2>{t('Target allocation')}</h2><p className="muted">{t('Compare current asset values with your target weights. New cash is distributed among underweight categories; no trades are executed. Missing exchange rates block the comparison. Recorded prices are used when quotes are unavailable.')}</p>{preferences.loading?<p>{t('Loading records…')}</p>:preferences.error?<p role="alert">{t(preferences.error)} <Button onClick={preferences.retry}>{t('Retry')}</Button></p>:<AllocationEditor key={JSON.stringify(saved)} records={records} currency={currency} market={market} initial={saved?.data.weights??{Cash:100}} save={preferences.save}/>}</section>;
}
function AllocationEditor({records,currency,market,initial,save}:{records:Entry[];currency:string;market:MarketData|null;initial:Record<string,number>;save:PreferenceResource['save']}){
 const {t,locale}=useLanguage();const [weights,setWeights]=useState(initial),[saved,setSaved]=useState(initial),[cash,setCash]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const guard=useUnsavedNavigation(JSON.stringify(weights)!==JSON.stringify(saved));
 const values:Record<string,number|null>={};for(const row of records.filter(r=>assets.includes(r.kind))){const converted=marketEntry(row,currency,market);values[row.kind]=values[row.kind]===null||!converted?null:(values[row.kind]??0)+value(converted);}
 const plan=allocationDrift(values,weights,cash);const total=Object.values(weights).reduce((sum,n)=>sum+n,0),valid=Math.abs(total-100)<1e-8;const money=(n:number)=>formatMoney(n,currency,locale);
 return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save({key:'allocation',data:{weights}});setSaved(weights);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">{[...new Set([...assets,...Object.keys(weights)])].map(kind=><label key={kind}>{t(kind)} (%)<FormattedNumberInput value={weights[kind]??0} max={100} required={false} onValueChange={weight=>setWeights({...weights,[kind]:weight})}/></label>)}<label>{t('Additional cash to allocate')} ({currency})<FormattedNumberInput value={cash} required={false} onValueChange={setCash}/></label></fieldset>
 <p role="status">{t('Target weights total: {total}%',{total:formatNumber(total,locale,2)})}</p>
 {!valid?<p>{t('Target weights must add up to 100%.')}</p>:!plan?<p>{t('Add asset values and provide all exchange rates to calculate allocation drift.')}</p>:<div className="table-scroll"><table><thead><tr>{['Category','Current weight','Target weight','Adjustment at target','Suggested new contribution'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{plan.rows.map(row=><tr key={row.key}><td><CategoryBadge kind={row.key} label={t(row.key)}/></td><td>{formatNumber(row.actual,locale,1)}%</td><td>{formatNumber(row.target,locale,1)}%</td><td>{money(row.delta)}</td><td>{money(row.contribution)}</td></tr>)}</tbody></table></div>}
 <p className="muted">{t('Positive adjustments indicate a shortfall; negative adjustments indicate an excess. Display rounding can make suggested contributions differ slightly from the cash total.')}</p><Button disabled={busy||!valid}>{t('Save targets')}</Button>{error&&<p role="alert">{t(error)}</p>}{guard}</form>;
}
