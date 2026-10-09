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
import { useDisplayMoney } from '@/components/display-money';
import { formatMoney } from '@/lib/format';
import { incomeCardTotals, monthlyIncomeCards } from '@/lib/monthly-income-cards';
import { expensePlanTotals, planTotalsByCurrency, previewPlans, type ExpensePlan } from '@/lib/expense-plans';
import type { Entry } from '@/lib/finance';
import type { EarningSource } from '@/lib/earning-sources';
import { ExpensePlanChart } from '@/components/expense-plan-chart';

export function CashflowPreview({entries,sources,plans,month,currency,loading,error,onRetry,onIncome,onSpending,mortgages,watchlists}:{entries:Entry[];sources:EarningSource[];plans:ExpensePlan[];month:string;currency:string;loading:boolean;error:string;onRetry:()=>void;onIncome:()=>void;onSpending:()=>void;mortgages:ReactNode;watchlists:ReactNode}){
 const {t,locale}=useLanguage();
 const {show,showSum}=useDisplayMoney();
 // Five sources at first; Show more lists every source here, with what it brought in and its progress (CF-042).
 const [allSources,setAllSources]=useState(false);
 const allCards=monthlyIncomeCards(entries,month,sources);
 const cards=allSources?allCards:allCards.slice(0,5);
 const income=incomeCardTotals(allCards);
 const spending=planTotalsByCurrency(plans,month);
 // Plans in any currency count, in the display currency. Five at most, as income does; View all opens the rest.
 const selectedPlans=previewPlans(plans,month);
 if(error)return <InlineError message={t(error)} onRetry={onRetry}/>;
 if(loading)return <CashflowPreviewSkeleton label={t('Loading records…')}/>;
 return <div className="cashflow-preview-grid">
  <section className="panel cashflow-income-preview"><PanelTitle title={<>{t('Income this month')} {allCards.length>0&&<span className="panel-figure">{income.missing?'—':formatMoney(income.received,currency,locale)} / {formatMoney(income.estimate,currency,locale)}</span>}</>}><Button variant="link" onClick={onIncome}>{t('View all')}</Button></PanelTitle>
   <div className="table-scroll"><table className="stack-table"><thead><tr><th>{t('Source')}</th><th>{t('Monthly estimate')}</th><th>{t('Received this month')}</th><th>{t('Progress')}</th></tr></thead><tbody>{cards.map(card=><tr key={card.entry.id}><td><div className="record-name"><DoneTick done={card.received}/><CategoryIcon kind={card.entry.kind}/><div><strong>{card.entry.name||t(card.entry.kind)}</strong><small>{t(card.entry.kind)}</small></div></div></td><td>{card.excluded?'—':formatMoney(card.amount,currency,locale)}</td><td>{card.received&&!card.missing?formatMoney(card.receivedAmount,currency,locale): '—'}</td><td>{!card.excluded&&!card.missing&&<ProgressLine value={card.receivedAmount} target={card.amount} tone="income"/>}</td></tr>)}</tbody></table></div>
   {income.missing>0&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
   {!allSources&&allCards.length>cards.length&&<Button variant="link" onClick={()=>setAllSources(true)}>{t('Show more')}</Button>}
   {!cards.length&&<p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
   <footer><Button variant="ghost" onClick={onIncome}><Plus size={18} aria-hidden="true"/>{t('Add income source')}</Button></footer>
  </section>
  <div className="cashflow-spending-preview"><section className="panel"><PanelTitle title={<>{t('Spending plans')} {spending.length>0&&<span className="panel-figure">{showSum(spending.map(line=>({amount:line.spent,currency:line.currency})))} / {showSum(spending.map(line=>({amount:line.planned,currency:line.currency})))}</span>}</>}><Button variant="link" onClick={onSpending}>{t('View all')}</Button></PanelTitle>
   <div className="table-scroll"><table className="stack-table"><thead><tr><th>{t('Plan')}</th><th>{t('Spent / Planned')}</th><th>{t('Progress')}</th></tr></thead><tbody>{selectedPlans.map(plan=>{const totals=expensePlanTotals(plan,month);return <tr key={plan.id}><td><div className="record-name"><CategoryIcon kind={plan.category}/><div><strong>{plan.name}</strong><small>{t(plan.category)}</small></div></div></td><td>{show(totals.spent,plan.currency)} / {show(totals.planned,plan.currency)}</td><td><ExpensePlanChart name={plan.name} category={plan.category} planned={totals.planned} spent={totals.spent}/></td></tr>;})}</tbody></table></div>
   {!selectedPlans.length&&<p className="muted">{t('No monthly plans yet. Add groceries, Mum’s allowance or another regular expense.')}</p>}
   {mortgages}
  </section></div>
  {watchlists}
 </div>;
}
