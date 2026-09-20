"use client";
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { AssetIcon } from '@/components/asset-icon';
import { CategoryBadge } from '@/components/category-badge';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { categoryColor } from '@/lib/category-colors';
import { formatMoney, formatNumber } from '@/lib/format';
import { value, type Entry } from '@/lib/finance';
import { convertAmount, marketEntry, type MarketData } from '@/lib/market';

export function AssetAccounts({accounts,records,market,loading,error,onRetry,onAdd,children,accountCount,onEdit,onTrack,demo,currency,portfolioTotal}: {
 currency:string;portfolioTotal:number;onEdit:(record:Entry)=>void;onTrack:(record:Entry)=>void;demo:boolean;children:ReactNode;accountCount:number;accounts:HoldingAccount[];records:Entry[];market:MarketData|null;loading:boolean;error:string;
 onRetry:()=>void;onAdd:(kind:'Cash'|'Stock'|'Crypto',accountId:string)=>void;
}) {
 const {t,locale}=useLanguage();
 return <section className="asset-account-section">
  <div className="asset-holdings-heading"><h2>{t('Accounts')} <span className="count">{formatNumber(accounts.length+accountCount,locale,0)}</span></h2><Link href="/accounts">{t('Manage accounts')}</Link></div>
  {error ? <p role="alert" className="error">{t(error)} <Button variant="outline" onClick={onRetry}>{t('Retry')}</Button></p> : loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !accounts.length&&!accountCount ? <p className="muted">{t('No accounts yet.')}</p> : <div className="asset-card-grid">{children}{accounts.map(account=>{
   const {holdings,total}=holdingAccountValue(account,records,market);
   const converted=total===null?null:convertAmount(total,account.currency,currency,market?.rates??market?.fx?.rate);
   const share=converted!==null&&portfolioTotal>0?converted/portfolioTotal*100:null;
   return <article key={account.id} className="asset-card asset-account-card" style={{'--asset-color':categoryColor(account.kind)} as CSSProperties}>
    <header className="asset-card-header"><AssetIcon record={account}/><div><CategoryBadge kind={account.kind} label={t(holdingAccountLabel(account.kind))}/><h3>{account.name}</h3></div></header>
    <div className="asset-card-worth"><span>{t('Current value')}</span><strong>{total===null?'—':formatMoney(converted??total,converted===null?account.currency:currency,locale)}</strong></div>
    <div className="asset-card-insight"><span>{t('Holdings')}</span><strong>{formatNumber(holdings.filter(record=>record.kind===account.kind).length,locale,0)}</strong></div>
    <div className="asset-card-share"><span>{t('Share of holdings')}</span><strong>{share===null?'—':formatNumber(share,locale,1)+'%'}</strong><div aria-hidden="true"><i style={{width:`${Math.max(0,Math.min(100,share??0))}%`}}/></div></div>
    {total===null&&<p className="muted">{t('Exchange rates are missing. The account total is unavailable.')}</p>}
    <details className="asset-card-details"><summary>{t('Account details')}<ChevronDown size={15}/></summary>{holdings.length?<dl>{holdings.map(record=>{const priced=marketEntry(record,record.currency,market)??record;return <div key={record.id}><dt>{record.name}</dt><dd>{formatMoney(value(priced),record.currency,locale)}</dd><dd><Button variant="ghost" size="sm" onClick={()=>onEdit(record)}>{t('Edit')}</Button>{!demo&&<Button variant="outline" size="sm" onClick={()=>onTrack(record)}>{t('Tracker')}</Button>}</dd></div>;})}</dl>:<p className="muted">{t('Add a holding to start tracking this account.')}</p>}</details>
    <footer className="asset-card-actions"><Button variant="ghost" asChild><Link href="/accounts">{t('Manage account')}</Link></Button><Button variant="outline" onClick={()=>onAdd(account.kind,account.id)}>{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button></footer>
   </article>;
  })}</div>}
 </section>;
}
