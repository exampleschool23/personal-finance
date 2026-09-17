"use client";
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { marketEntry, type MarketData } from '@/lib/market';
import type { Entry } from '@/lib/finance';

export function MonthlyMortgagePayments({records,currency,market,loading,error,onPay,onEdit}:{records:Entry[];currency:string;market:MarketData|null;loading:boolean;error:string;onPay:(record:Entry)=>void;onEdit:(record:Entry)=>void}){
 const {t,locale}=useLanguage();
 const mortgages=records.filter(record=>record.kind==='Mortgage'&&record.amount>0);
 if(!loading&&!error&&!mortgages.length)return null;
 return <section className="panel monthly-mortgage-payments">
  <div className="panel-title"><div><h2>{t('Monthly mortgage payments')}</h2><p className="muted">{t('Included in estimated monthly expenses. Record each payment after it happens to add it to transaction history.')}</p></div></div>
  {loading?<LoadingPlaceholder label={t('Loading records…')}/>:error?<p className="error" role="alert">{t(error)}</p>:<div className="table-scroll"><table><thead><tr><th>{t('Name')}</th><th>{t('Estimated per month')}</th><th>{t('Outstanding balance')}</th><th>{t('Actions')}</th></tr></thead><tbody>{mortgages.map(original=>{
   const record=marketEntry(original,currency,market)??original;
   return <tr key={original.id}><td>{original.name}</td><td>{(record.estimated_monthly_payment??0)>0?formatMoney(record.estimated_monthly_payment!,record.currency,locale):t('Not set')}</td><td>{formatMoney(record.amount,record.currency,locale)}</td><td><div className="row-actions"><Button variant="ghost" size="sm" onClick={()=>onEdit(original)}>{t('Edit')}</Button><Button variant="outline" size="sm" onClick={()=>onPay(original)}>{t('Record payment')}</Button></div></td></tr>;
  })}</tbody></table></div>}
 </section>;
}
