"use client";
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AssetCard } from '@/components/presentation-foundation/asset-card';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Count } from '@/components/presentation-foundation/count';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { useLanguage } from '@/components/language-provider';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { formatMoney, formatNumber } from '@/lib/format';
import { value, type Entry } from '@/lib/finance';
import { convertAmount, marketEntry, type MarketData } from '@/lib/market';

export function AssetAccounts({accounts,records,market,loading,error,onRetry,onAdd,children,accountCount,onEdit,onTrack,demo,currency,portfolioTotal}: {
 currency:string;portfolioTotal:number;onEdit:(record:Entry)=>void;onTrack:(record:Entry)=>void;demo:boolean;children:ReactNode;accountCount:number;accounts:HoldingAccount[];records:Entry[];market:MarketData|null;loading:boolean;error:string;
 onRetry:()=>void;onAdd:(kind:'Cash'|'Stock'|'Crypto',accountId:string)=>void;
}) {
 const {t,locale}=useLanguage();
 return <section className="asset-account-section">
  <div className="asset-holdings-heading"><h2>{t('Accounts')}<Count value={accounts.length+accountCount}/></h2><Link href="/accounts">{t('Manage accounts')}</Link></div>
  {error ? <InlineError message={t(error)} onRetry={onRetry}/> : loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !accounts.length&&!accountCount ? <p className="muted">{t('No accounts yet.')}</p> : <div className="asset-card-grid">{children}{accounts.map(account=>{
   const {holdings,total}=holdingAccountValue(account,records,market);
   const converted=total===null?null:convertAmount(total,account.currency,currency,market?.rates??market?.fx?.rate);
   const share=converted!==null&&portfolioTotal>0?converted/portfolioTotal*100:null;
   return <AssetCard key={account.id} record={account} label={t(holdingAccountLabel(account.kind))} worth={total===null?'—':formatMoney(converted??total,converted===null?account.currency:currency,locale)}
    fact={{label:t('Holdings'),value:formatNumber(holdings.filter(record=>record.kind===account.kind).length,locale,0)}} share={share}
    note={total===null&&<small>{t('Exchange rates are missing. The account total is unavailable.')}</small>}
    detailsLabel={t('Account details')}
    details={holdings.length?<dl className="asset-card-holdings">{holdings.map(record=>{const priced=marketEntry(record,record.currency,market)??record;return <div key={record.id}><dt>{record.name}</dt><dd>{formatMoney(value(priced),record.currency,locale)}</dd><dd><Button variant="ghost" size="sm" onClick={()=>onEdit(record)}>{t('Edit')}</Button>{!demo&&<Button variant="outline" size="sm" onClick={()=>onTrack(record)}>{t('Tracker')}</Button>}</dd></div>;})}</dl>:<p className="muted">{t('Add a holding to start tracking this account.')}</p>}>
    <Button variant="ghost" asChild><Link href="/accounts">{t('Manage account')}</Link></Button><Button variant="outline" onClick={()=>onAdd(account.kind,account.id)}>{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button>
   </AssetCard>;
  })}</div>}
 </section>;
}
