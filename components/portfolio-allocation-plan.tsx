"use client";
import {ResourceState} from '@/components/presentation-foundation/resource-state';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import {DatePicker} from '@/components/presentation-foundation/date-picker';
import {CurrencySelect} from '@/components/presentation-foundation/currency-select';
import {useState} from 'react';
import {useLanguage} from '@/components/language-provider';
import {FormattedNumberInput} from '@/components/presentation-foundation/formatted-number-input';
import {Button} from '@/components/ui/button';
import {useUnsavedNavigation} from '@/components/discard-changes';
import {assets,value,type Entry} from '@/lib/finance';
import {marketEntry,type MarketData} from '@/lib/market';
import {allocationDrift,currentAllocationWeights} from '@/lib/portfolio-performance';
import {formatMoney,formatNumber,formatPercent} from '@/lib/format';
import {CategoryBadge} from '@/components/presentation-foundation/category-badge';
import type {PreferenceResource} from '@/hooks/use-workspace-preferences';
export function PortfolioAllocationPlan({records,currency,currencies,market,preferences}:{currencies:string[];records:Entry[];currency:string;market:MarketData|null;preferences:PreferenceResource}){
 const {t}=useLanguage();const saved=preferences.data.preferences.find(p=>p.key==='allocation');
 return <section className="panel tools-panel"><h2>{t('Target allocation')}<InfoHint>{t('Compare current asset values with your target weights. New cash is distributed among underweight categories; no trades are executed. Missing exchange rates block the comparison. Recorded prices are used when quotes are unavailable.')}<p>{t('Set your overall net-worth goal separately from your asset allocation weights. Leave blank to remove the goal.')}</p><p>{t('Positive adjustments indicate a shortfall; negative adjustments indicate an excess. Display rounding can make suggested contributions differ slightly from the cash total.')}</p></InfoHint></h2><ResourceState loading={preferences.loading} error={preferences.error} onRetry={preferences.retry}><AllocationEditor currencies={currencies} initialTarget={saved?.data.target_net_worth??null} key={JSON.stringify(saved)} records={records} currency={currency} market={market} initial={saved?.data.weights??null} save={preferences.save}/></ResourceState></section>;
}
function AllocationEditor({records,currency,currencies,market,initial,initialTarget,save}:{currencies:string[];initialTarget:{amount:number;currency:string;date?:string|null}|null;records:Entry[];currency:string;market:MarketData|null;initial:Record<string,number>|null;save:PreferenceResource['save']}){
 const {t,locale}=useLanguage();const [chosen,setWeights]=useState(initial),[saved,setSaved]=useState(initial),[cash,setCash]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const [targetAmount,setTargetAmount]=useState(initialTarget?.amount??0),[targetCurrency,setTargetCurrency]=useState(initialTarget?.currency??currency),[targetDate,setTargetDate]=useState(initialTarget?.date??''),[savedTarget,setSavedTarget]=useState(initialTarget?{...initialTarget,date:initialTarget.date??null}:null);const target=targetAmount>0?{amount:targetAmount,currency:targetCurrency,date:targetDate||null}:null;const guard=useUnsavedNavigation(JSON.stringify(chosen)!==JSON.stringify(saved)||JSON.stringify(target)!==JSON.stringify(savedTarget));
 const values:Record<string,number|null>={};for(const row of records.filter(r=>assets.includes(r.kind))){const converted=marketEntry(row,currency,market);values[row.kind]=values[row.kind]===null||!converted?null:(values[row.kind]??0)+value(converted);}
 // Until targets are saved, they start from today's mix rather than an arbitrary split.
 const weights=chosen??currentAllocationWeights(values)??{Cash:100};
 const plan=allocationDrift(values,weights,cash);const total=Object.values(weights).reduce((sum,n)=>sum+n,0),valid=Math.abs(total-100)<1e-8;const money=(n:number)=>formatMoney(n,currency,locale);
 return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await save({key:'allocation',data:{weights,target_net_worth:target}});setSaved(weights);setSavedTarget(target);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields"><div className="allocation-net-worth-target"><label>{t('Target net worth')}<FormattedNumberInput value={targetAmount} required={false} max={1e15} onValueChange={setTargetAmount}/></label><CurrencySelect value={targetCurrency} currencies={currencies} savedCurrency={initialTarget?.currency} onChange={setTargetCurrency}/><label>{t('Target date')}<DatePicker value={targetDate} required={false} onChange={setTargetDate}/></label></div>{[...new Set([...assets,...Object.keys(weights)])].map(kind=><label key={kind}>{t(kind)} (%)<FormattedNumberInput value={weights[kind]??0} max={100} required={false} onValueChange={weight=>setWeights({...weights,[kind]:weight})}/></label>)}<label>{t('Additional cash to allocate')} ({currency})<FormattedNumberInput value={cash} required={false} onValueChange={setCash}/></label></fieldset>
 <p role="status">{t('Target weights total: {total}%',{total:formatNumber(total,locale,2)})}</p>
 {!valid?<p>{t('Target weights must add up to 100%.')}</p>:!plan?<p>{t('Add asset values and provide all exchange rates to calculate allocation drift.')}</p>:<div className="table-scroll"><table><thead><tr>{['Category','Current weight','Target weight','Adjustment at target','Suggested new contribution'].map((label,index)=><th key={label} className={index?'amount':undefined}>{t(label)}</th>)}</tr></thead><tbody>{plan.rows.map(row=><tr key={row.key}><td><CategoryBadge kind={row.key} label={t(row.key)}/></td><td className="amount">{formatPercent(row.actual,locale,1,1)}</td><td className="amount">{formatPercent(row.target,locale,1,1)}</td><td className="amount">{money(row.delta)}</td><td className="amount">{money(row.contribution)}</td></tr>)}</tbody></table></div>}
 <Button disabled={busy||!valid}>{t('Save targets')}</Button>{error&&<p role="alert">{t(error)}</p>}{guard}</form>;
}
