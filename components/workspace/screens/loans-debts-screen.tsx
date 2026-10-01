"use client";
import { Plus } from 'lucide-react';
import { DebtSummary } from '@/components/debt-summary';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { DebtPayoffPanel } from '@/components/planning/debt-payoff-panel';
import { Button } from '@/components/ui/button';
import { depositToday } from '@/lib/deposit-interest';
import { RecordsTable } from '@/components/workspace/records-table';
import { DemoBanner, ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function LoansDebtsScreen() {
 const { t } = useLanguage();
 const { user, current, currency, planning, workspacePreferences, forecast, forecastReady, workspaceLoading, money, addRecord } = useWorkspace();
 const hasForecast = forecast.plannedIncome > 0 || forecast.monthlyExpenses > 0 || forecast.mortgagePayments > 0;
 return <>
  <div data-page="Loans & debts" className="content">
   <DemoBanner/>
   <PageHeader title={t('Loans & debts')} description={t("Manage your records and keep your balances up to date.")}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add record")}</Button></PageHeader>
   <ScreenNotices/>
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Loans & debts"/> : <>
    <DebtSummary entries={current} currency={currency}/>
    {hasForecast && <section className="panel forecast-panel"><div><h2>{t('Estimated monthly cash flow')}</h2><p className="muted">{t('Asset income estimates plus other recurring income, minus recurring expenses and estimated mortgage payments. Linked business income is counted once.')}</p></div><div><strong>{forecastReady ? money(forecast.forecast) : '—'}</strong><small>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })}</small><small>{t('Other recurring income: {amount}', { amount: money(forecast.otherIncome) })}</small><small>{t('Recurring and planned expenses: {amount}', { amount: forecastReady ? money(forecast.monthlyExpenses) : '—' })}</small><small>{t('Estimated mortgage payments: {amount}', { amount: money(forecast.mortgagePayments) })}</small><small>{t('One-time entries are excluded')}</small></div></section>}
    <RecordsTable title={t('Loans & debts')} caption={t("Fetched prices where available")}/>
   </>}
  </div>
  {planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {!planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><DebtPayoffPanel records={planning.data.records} currency={currency} today={depositToday()} preferences={workspacePreferences}/></div>}
 </>;
}
