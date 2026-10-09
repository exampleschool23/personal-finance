"use client";
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Button } from '@/components/ui/button';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { marketEntry, type MarketData } from '@/lib/market';
import type { Entry } from '@/lib/finance';

export function MonthlyMortgagePayments({records,currency,market,loading,error,onPay,onEdit}:{records:Entry[];currency:string;market:MarketData|null;loading:boolean;error:string;onPay:(record:Entry)=>void;onEdit:(record:Entry)=>void}){
 const {t,locale}=useLanguage();
 const mortgages=records.filter(record=>record.kind==='Mortgage'&&record.amount>0);
 if(!loading&&!error&&!mortgages.length)return null;
 return <section className="panel monthly-mortgage-payments">
  <PanelTitle title={t('Monthly mortgage payments')} hint={t('Included in estimated monthly expenses. Record each payment after it happens to add it to transaction history.')}/>
  {loading?<LoadingPlaceholder label={t('Loading records…')}/>:error?<InlineError message={t(error)}/>:<><div className="table-scroll"><table className="stack-table"><thead><tr><th>{t('Name')}</th><th>{t('Estimated per month')}</th><th>{t('Outstanding balance')}</th><th>{t('Actions')}</th></tr></thead><tbody>{mortgages.map(original=>{
   // In the display currency; without a rate both figures read "—" with a note, never the loan's own currency.
   const record=marketEntry(original,currency,market),money=(amount:number)=>record?formatMoney(amount,currency,locale):'—';
   return <tr key={original.id}><td><div className="record-name"><CategoryIcon kind={original.kind}/><div><strong>{original.name}</strong><small>{t(original.kind)}</small></div></div></td><td>{(original.estimated_monthly_payment??0)>0?money(record?.estimated_monthly_payment??0):t('Not set')}</td><td>{money(record?.amount??0)}</td><td><div className="row-actions"><Button variant="outline" size="sm" onClick={()=>onPay(original)}>{t('Record payment')}</Button><RowMenu label={t('Actions for {name}',{name:original.name})} items={[{label:t('Edit'),onSelect:()=>onEdit(original)}]}/></div></td></tr>;
  })}</tbody></table></div>{mortgages.some(record=>!marketEntry(record,currency,market))&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}</>}
 </section>;
}
