"use client";
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { InstrumentPicker } from '@/components/instrument-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';
import { instrumentFor } from '@/lib/market';
import type { HoldingAccount } from '@/lib/holding-accounts';
import type { InvestmentTarget } from '@/lib/planning';

export function GoalInvestmentEditor({targets,accounts,onChange,busy}:{targets:InvestmentTarget[];accounts:HoldingAccount[];onChange:(targets:InvestmentTarget[])=>void;busy:boolean}){
 const {t,locale}=useLanguage();
 const update=(index:number,target:InvestmentTarget)=>onChange(targets.map((item,i)=>i===index?target:item));
 const add=()=>{const account=accounts[0];if(account)onChange([...targets,{holding_account_id:account.id,asset_kind:account.kind,asset_symbol:'',target:0,monthly_contribution:null}]);};
 return <div className="investment-target-editor">
  <p className="muted">{t('Add coins or stocks to this goal. Each holding has its own account and target quantity.')}</p>
  {targets.map((target,index)=>{
   const duplicate=targets.some((other,i)=>i!==index&&other.holding_account_id===target.holding_account_id&&other.asset_symbol===target.asset_symbol&&!!target.asset_symbol);
   return <fieldset className="investment-target-row" key={index} disabled={busy}>
    <legend>{t('Holding {number}',{number:formatNumber(index+1,locale,0)})}</legend>
    <label>{t('Investment account')}<NativeSelect required value={target.holding_account_id} onChange={event=>{const account=accounts.find(item=>item.id===event.target.value);if(account)update(index,{holding_account_id:account.id,asset_kind:account.kind,asset_symbol:'',target:0,monthly_contribution:null});}}><option value="">{t('Select account')}</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {t(account.kind==='Crypto'?'Crypto account':'Stock account')}</option>)}</NativeSelect></label>
    <InstrumentPicker key={target.holding_account_id} kind={target.asset_kind} value={target.asset_symbol} disabled={busy} onChange={name=>{const symbol=instrumentFor({kind:target.asset_kind,name})?.symbol??'';if(symbol!==target.asset_symbol)update(index,{...target,asset_symbol:symbol,target:0,monthly_contribution:null});}}/>
    <label>{t('Target quantity')}{target.asset_symbol?` · ${target.asset_symbol}`:''}<FormattedNumberInput max={1e12} value={target.target} onValueChange={quantity=>update(index,{...target,target:quantity})}/></label>
    {duplicate&&<p className="error" role="alert">{t('This holding is already included for this account.')}</p>}
    <Button type="button" variant="ghost" disabled={targets.length===1} onClick={()=>onChange(targets.filter((_,i)=>i!==index))} aria-label={t('Remove holding')+': '+(target.asset_symbol||formatNumber(index+1,locale,0))}><Trash2 size={16} aria-hidden="true"/>{t('Remove holding')}</Button>
   </fieldset>;
  })}
  <Button type="button" variant="outline" disabled={busy||!accounts.length||targets.length>=50} onClick={add}><Plus size={16} aria-hidden="true"/>{t('Add another holding')}</Button>
  {!accounts.length&&<p className="muted">{t('Add a stock or crypto account first. You can set a goal before buying any holdings.')} <Link href="/accounts">{t('Accounts')}</Link></p>}
 </div>;
}
