"use client";
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { DoneTick } from '@/components/presentation-foundation/done-tick';
import { ProgressLine } from '@/components/presentation-foundation/progress-line';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { CashflowPreviewSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { useDisplayMoney } from '@/components/display-money';
import { incomeCardTotals, monthlyIncomeCards } from '@/lib/monthly-income-cards';
import type { Entry } from '@/lib/finance';
import type { EarningSource } from '@/lib/earning-sources';
import type { RateTable } from '@/lib/money';

/** Cash flow's overview: the month's income by source beside this month's budget and mortgage payments. `rates` converts
 * a payment no rate converted into the display currency into its card's; without one its amount is missing. */
export function CashflowPreview({entries,sources,month,currency,rates,loading,error,onRetry,onIncome,budget,mortgages,watchlists}:{entries:Entry[];sources:EarningSource[];month:string;currency:string;rates?:RateTable|null;loading:boolean;error:string;onRetry:()=>void;onIncome:()=>void;budget:ReactNode;mortgages:ReactNode;watchlists:ReactNode}){
 const {t,locale}=useLanguage();
 const {convert}=useDisplayMoney();
 // Five sources at first; Show more lists every source here, with what it brought in and its progress (CF-042).
 const [allSources,setAllSources]=useState(false);
 const allCards=monthlyIncomeCards(entries,month,sources,undefined,rates);
 const cards=allSources?allCards:allCards.slice(0,5);
 // Each card in its source's own currency; the headline adds them in the display currency.
 const income=incomeCardTotals(allCards,convert);
 if(error)return <InlineError message={t(error)} onRetry={onRetry}/>;
 if(loading)return <CashflowPreviewSkeleton label={t('Loading records…')}/>;
 return <div className="cashflow-preview-grid">
  <section className="panel cashflow-income-preview"><PanelTitle title={<>{t('Income this month')} {allCards.length>0&&<span className="panel-figure">{income.missing?'—':formatMoney(income.received,currency,locale)} / {formatMoney(income.estimate,currency,locale)}</span>}</>}><Button variant="link" onClick={onIncome}>{t('View all')}</Button></PanelTitle>
   <div className="table-scroll"><table className="stack-table"><thead><tr><th>{t('Source')}</th><th>{t('Monthly estimate')}</th><th>{t('Received this month')}</th><th>{t('Progress')}</th></tr></thead><tbody>{cards.map(card=><tr key={card.entry.id}><td><div className="record-name"><DoneTick done={card.received}/><CategoryIcon kind={card.entry.kind}/><div><strong>{card.entry.name||t(card.entry.kind)}</strong><small>{t(card.entry.kind)}</small></div></div></td><td>{card.excluded?'—':formatMoney(card.amount,card.entry.currency,locale)}</td><td>{card.received&&!card.missing?(card.entered?formatMoney(card.entered.amount,card.entered.currency,locale):formatMoney(card.receivedAmount,card.entry.currency,locale)): '—'}</td><td>{!card.excluded&&!card.missing&&<ProgressLine value={card.receivedAmount} target={card.amount} tone="income"/>}</td></tr>)}</tbody></table></div>
   {income.missing>0&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
   {!allSources&&allCards.length>cards.length&&<Button variant="link" onClick={()=>setAllSources(true)}>{t('Show more')}</Button>}
   {!cards.length&&<p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
   <footer><Button variant="ghost" onClick={onIncome}><Plus size={18} aria-hidden="true"/>{t('Add income source')}</Button></footer>
  </section>
  <div className="cashflow-spending-preview">{budget}{mortgages}</div>
  {watchlists}
 </div>;
}
