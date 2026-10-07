"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption, formatMoney } from '@/lib/format';
import { lendingAccounts } from '@/lib/record-balance';
import type { Entry } from '@/lib/finance';

/** The cash account new money lent was paid from: it leaves that account when the loan is saved. Optional, so a loan
 * made before the accounts were tracked can be entered without moving cash. */
export function LentFromField({entry,records,loading,error,busy,onChange}:{entry:Entry;records:Entry[];loading:boolean;error:string;busy:boolean;onChange:(id:string|null)=>void}){
 const {t,locale}=useLanguage();
 const accounts=lendingAccounts(records,entry.currency);
 const account=accounts.find(record=>record.id===entry.lent_from);
 const after=account?Number(account.amount)-entry.amount:null;
 return <div className="cash-account-field"><label>{t('Lent from account (optional)')}<NativeSelect disabled={busy||loading||!!error} value={account?.id??''} onChange={event=>onChange(event.target.value||null)}><option value="">{t('Not from an account')}</option>{accounts.map(option=><option key={option.id} value={option.id}>{formatAccountOption(option,locale)}</option>)}</NativeSelect></label>
  {!loading&&!error&&!accounts.length&&<p className="muted">{t('No cash account in {currency}.',{currency:entry.currency})}</p>}
  {error&&<p className="error" role="alert">{t(error)}</p>}
  {account&&after!==null&&<div className="ownership-summary" aria-live="polite"><p>{t('Cash deducted from {account}: {amount}',{account:account.name,amount:formatMoney(entry.amount,account.currency,locale)})}</p><p>{t('Cash balance after update')}: {formatMoney(after,account.currency,locale)}</p>{after<0&&<InlineError message={t('Not enough money in the selected cash account.')}/>}</div>}
 </div>;
}
