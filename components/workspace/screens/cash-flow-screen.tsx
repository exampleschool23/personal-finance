"use client";
import { useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { CashflowPreview } from '@/components/cashflow-preview';
import { DatePicker } from '@/components/date-picker';
import { EstimatedIncomeSources } from '@/components/estimated-income-sources';
import { ExpensePlans } from '@/components/expense-plans';
import { MonthlyReview } from '@/components/financial-review';
import { IncomeSourcesPanel } from '@/components/income-sources-panel';
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, WorkspaceSkeleton } from '@/components/loading-placeholder';
import { MonthlyMortgagePayments } from '@/components/monthly-mortgage-payments';
import { PageHeader } from '@/components/page-header';
import { SpendingWatchlists } from '@/components/spending-watchlists';
import { TransactionInsights } from '@/components/transaction-insights';
import { Button } from '@/components/ui/button';
import { depositToday } from '@/lib/deposit-interest';
import { RecordsTable } from '@/components/workspace/records-table';
import { DemoBanner, ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

const tabs = ['Overview', 'Income', 'Spending', 'Transactions'] as const;

export function CashFlowScreen() {
 const { t } = useLanguage();
 const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
 const { user, demo, rows, currency, market, reload, preferencesData, planning, earningSources, expensePlans, transactionTools, workspacePreferences, snapshots, forecast, forecastReady, forecastMonth, setForecastMonth, monthlyIncomeEntries, workspaceLoading, refreshRecords,
  addCashFlow, editRecord, setPayingMortgage, recordFromSource, reviewRecurring, spendFromPlan, removePlan, showFirstPage } = useWorkspace();
 const mortgages = <MonthlyMortgagePayments records={demo?rows:planning.data.records} currency={currency} market={market} loading={planning.loading} error={planning.error} onPay={setPayingMortgage} onEdit={editRecord}/>;
 const watchlists = !transactionTools.loading&&!transactionTools.error ? <SpendingWatchlists data={planning.data} splits={transactionTools.data.splits} today={depositToday()} currency={currency} preferences={workspacePreferences}/> : null;
 return <>
  <div data-page="Income & expenses" className="content">
   <DemoBanner/>
   <PageHeader title={t('Cash flow')} description={t("Income, spending, and plans in one place.")}>
    <DatePicker mode="month" value={forecastMonth} max={depositToday()} onChange={setForecastMonth}/>
    <Button variant="outline" className="cashflow-action" onClick={() => addCashFlow('Other income')}><Plus size={17} aria-hidden="true"/>{t("Add income")}</Button>
    <Button className="cashflow-action" onClick={() => addCashFlow('Other expense')}><Plus size={17} aria-hidden="true"/>{t("Add expense")}</Button>
   </PageHeader>
   <nav className="segmented cashflow-tabs" aria-label={t('Cash flow')}>{tabs.map(name=><button type="button" key={name} aria-pressed={tab===name} onClick={()=>{setTab(name);if(name==='Overview')showFirstPage();}}>{t(name)}</button>)}</nav>
   <ScreenNotices planErrors={false}/>
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Income & expenses"/> : <>
    {!planning.loading&&!planning.error&&<MonthlyReview compact selectedMonth={forecastMonth} estimates={forecastReady?{income:forecast.plannedIncome,spending:forecast.monthlyExpenses+forecast.mortgagePayments,net:forecast.forecast}:null} owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/>}
    {transactionTools.error&&<p className="error" role="alert">{t(transactionTools.error)} <Button onClick={transactionTools.retry}>{t('Retry')}</Button></p>}
    {tab==='Overview'&&<CashflowPreview entries={monthlyIncomeEntries} sources={earningSources.sources} plans={expensePlans.plans} month={forecastMonth} currency={currency} loading={planning.loading||earningSources.loading||expensePlans.loading} error={planning.error||earningSources.error||expensePlans.error} onRetry={refreshRecords} onIncome={()=>setTab('Income')} onSpending={()=>setTab('Spending')} mortgages={mortgages} watchlists={watchlists}/>}
    {tab==='Income'&&<IncomeSourcesPanel controller={earningSources} currencies={preferencesData.currencies} records={planning.data.records} onRecord={recordFromSource}/>}
    {tab==='Income'&&(planning.loading || earningSources.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : planning.error || earningSources.error ? <div className="error" role="alert">{t(planning.error || earningSources.error)} <Button onClick={refreshRecords}>{t('Retry')}</Button></div> : <EstimatedIncomeSources earningSources={earningSources.sources} entries={monthlyIncomeEntries} currency={currency} month={forecastMonth}/>)}
    {tab==='Spending'&&mortgages}
    {tab==='Spending'&&<ExpensePlans {...expensePlans} remove={removePlan} currency={currency} currencies={preferencesData.currencies} onSpend={spendFromPlan} onRetry={refreshRecords}/>}
    {tab==='Overview'&&<RecordsTable transactions title={t('Recent transactions')} caption={t("Recorded income and expenses")} limit={4} pagination={false}><Button variant="link" className="cashflow-view-history" onClick={()=>setTab('Transactions')}>{t('View full transactions')} <ArrowUpRight size={16}/></Button></RecordsTable>}
    {tab==='Transactions'&&<RecordsTable transactions title={t('Transaction history')} caption={t("Recorded income and expenses")}/>}
   </>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
  {!planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}>
   {tab==='Transactions'&&<TransactionInsights owner={user} demo={demo} revision={reload} records={planning.data.records} today={depositToday()} onReview={reviewRecurring}/>}
   {tab==='Spending'&&watchlists}
  </div>}
 </>;
}
