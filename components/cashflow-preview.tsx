"use client";
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { monthlyIncomeCards } from '@/lib/monthly-income-cards';
import { expensePlanTotals, type ExpensePlan } from '@/lib/expense-plans';
import type { Entry } from '@/lib/finance';
import type { EarningSource } from '@/lib/earning-sources';
import { ExpensePlanChart } from '@/components/expense-plan-chart';

export function CashflowPreview({entries,sources,plans,month,currency,loading,error,onRetry,onIncome,onSpending,mortgages,watchlists}:{entries:Entry[];sources:EarningSource[];plans:ExpensePlan[];month:string;currency:string;loading:boolean;error:string;onRetry:()=>void;onIncome:()=>void;onSpending:()=>void;mortgages:ReactNode;watchlists:ReactNode}){
 const {t,locale}=useLanguage();
 const cards=monthlyIncomeCards(entries,month,sources).slice(0,5);
 const selectedPlans=plans.filter(plan=>plan.currency===currency&&expensePlanTotals(plan,month).active).slice(0,3);
 if(error)return <p className="error" role="alert">{t(error)} <Button onClick={onRetry}>{t('Retry')}</Button></p>;
 if(loading)return <p role="status">{t('Loading records…')}</p>;
 return <div className="cashflow-preview-grid">
  <section className="panel cashflow-income-preview"><header className="panel-title"><h2>{t('Income this month')}</h2><Button variant="link" onClick={onIncome}>{t('View all')}</Button></header>
   <div className="table-scroll"><table><thead><tr><th>{t('Source')}</th><th>{t('Monthly estimate')}</th><th>{t('Received this month')}</th></tr></thead><tbody>{cards.map(card=><tr key={card.entry.id}><td><div className="cashflow-source-name"><span className="cashflow-source-icon" style={{'--source-color':categoryColor(card.entry.kind)} as CSSProperties}><ArrowDownLeft size={19} aria-hidden="true"/></span><div><strong>{card.entry.name||t(card.entry.kind)}</strong><small className="muted">{t(card.entry.kind)}</small></div></div></td><td>{card.excluded?'—':formatMoney(card.amount,currency,locale)}</td><td>{card.received?formatMoney(card.receivedAmount,currency,locale): '—'}</td></tr>)}</tbody></table></div>
   {!cards.length&&<p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
   <footer><Button variant="ghost" onClick={onIncome}><Plus size={18} aria-hidden="true"/>{t('Add income source')}</Button></footer>
  </section>
  <div className="cashflow-spending-preview"><section className="panel"><header className="panel-title"><h2>{t('Spending plans')}</h2><Button variant="link" onClick={onSpending}>{t('Manage')}</Button></header>
   <div className="table-scroll"><table><thead><tr><th>{t('Plan')}</th><th>{t('Spent / Planned')}</th><th>{t('Progress')}</th></tr></thead><tbody>{selectedPlans.map(plan=>{const totals=expensePlanTotals(plan,month);return <tr key={plan.id}><td>{plan.name}</td><td>{formatMoney(totals.spent,plan.currency,locale)} / {formatMoney(totals.planned,plan.currency,locale)}</td><td><ExpensePlanChart name={plan.name} category={plan.category} planned={totals.planned} spent={totals.spent}/></td></tr>;})}</tbody></table></div>
   {!selectedPlans.length&&<p className="muted">{t('No monthly plans yet. Add groceries, Mum’s allowance or another regular expense.')}</p>}
   <p className="cashflow-plan-note muted">{t('Selected {currency} plans.',{currency})}</p>{mortgages}
  </section>{watchlists}</div>
 </div>;
}
