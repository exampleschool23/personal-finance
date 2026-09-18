"use client";
import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { useLanguage } from '@/components/language-provider';
import { formatMoney,formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import type { ForecastAssignment } from '@/lib/transaction-tools';
import type { ToolsController } from '@/components/transaction-tools-panel';
export function ForecastAccountAssignment({record,accounts,assignment,today,tools}:{record:Entry;accounts:Entry[];assignment?:ForecastAssignment;today:string;tools:ToolsController}){
 const {t,locale}=useLanguage();
 const [accountId,setAccountId]=useState(assignment?.account_id??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const account=accounts.find(item=>item.id===accountId);
 const fx=useDatedExchangeRate(record.currency,account?.currency,today);
 async function save(){
  setBusy(true);setError('');
  try{await tools.save('forecast',{record_id:record.id,account_id:accountId||null,...(account?{exchange_rate:fx.rate,from_currency:record.currency,to_currency:account.currency}:{})});}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 return <div className="grid gap-2"><label>{record.name} · {record.currency}<NativeSelect disabled={busy} value={accountId} onChange={event=>setAccountId(event.target.value)}><option value="">{t('Unassigned')}</option>{accounts.map(item=><option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</NativeSelect></label>
  {account&&account.currency!==record.currency&&<><ExchangeRatePreview fx={fx}/>{fx.rate&&<p className="muted">{t('Projected amount')}: {formatMoney(record.amount*fx.rate,account.currency,locale)}</p>}{assignment?.account_id===accountId&&assignment.exchange_rate&&<small className="muted">{t('Saved forecast rate')}: {formatNumber(1,locale)} {assignment.from_currency} = {formatNumber(Number(assignment.exchange_rate),locale,8)} {assignment.to_currency}</small>}</>}
  <Button type="button" variant="outline" disabled={busy||(!!accountId&&(!account||!fx.rate||fx.loading||!!fx.error))} onClick={()=>void save()}>{t(busy?'Saving…':'Save assignment')}</Button>
  {error&&<p role="alert" className="error">{t(error)}</p>}
 </div>;
}
