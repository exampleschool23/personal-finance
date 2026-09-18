"use client";
import { requiresCashAccount } from '@/lib/cash-account-required';
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { ExchangeRatePreview } from '@/components/exchange-rate-preview';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { formatMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';

export function CashAccountField({entry,records,loading,error,busy,onChange}:{entry:Entry;records:Entry[];loading:boolean;error:string;busy:boolean;onChange:(id:string|null)=>void}){
 const {t,locale}=useLanguage();
 const accounts=records.filter(record=>record.kind==='Cash');
 const account=accounts.find(record=>record.id===entry.account_id);
 const original=records.find(record=>record.id===entry.id);
 const savedRate=original?.account_id===account?.id&&original?.currency===entry.currency&&original?.date===entry.date&&original?.account_currency===account?.currency?original?.account_exchange_rate:null;
 const fx=useDatedExchangeRate(savedRate?undefined:account?.currency,entry.currency,entry.date);
 const cross=!!account&&account.currency!==entry.currency;
 const rate=savedRate??fx.rate;
 return <div className="cash-account-field"><label>{t('Cash account')}<NativeSelect required={requiresCashAccount(entry)} disabled={busy||loading||!!error||entry.frequency!=='Once'} value={entry.account_id||''} onChange={event=>onChange(event.target.value||null)}><option value="" disabled>{t('Choose a cash account')}</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {formatMoney(account.amount,account.currency,locale)} · {account.currency}</option>)}</NativeSelect></label>
  {!loading&&!error&&!accounts.length&&<p className="muted">{t('Add a cash account to record this transaction.')}</p>}
  {loading&&<p className="muted">{t('Waiting for current cash account balances.')}</p>}
  {error&&<p className="error" role="alert">{t(error)}</p>}
  {entry.frequency!=='Once'&&<p className="muted">{t('Choose a cash account when recording the actual payment.')}</p>}
  <input type="hidden" name="account_exchange_rate" value={cross&&rate?rate:''}/>
  {cross&&<>{!savedRate&&<ExchangeRatePreview fx={fx}/>} {rate&&<p className="muted">{t('Account amount')}: <strong>{formatMoney(entry.amount/rate,account.currency,locale)}</strong></p>}</>}
 </div>;
}
