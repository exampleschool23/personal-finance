"use client";
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DebtSummary } from '@/components/debt-summary';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { DebtPayoffPanel } from '@/components/planning/debt-payoff-panel';
import { Button } from '@/components/ui/button';
import { depositToday } from '@/lib/deposit-interest';
import { RecordsTable } from '@/components/workspace/records-table';
import { ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function LoansDebtsScreen() {
 const { t } = useLanguage();
 // Two views switched from the top bar: what is owed and lent, and the plan for paying it off.
 const [view, setView] = useState<'overview' | 'payoff'>('overview');
 const { user, current, currency, planning, workspacePreferences, workspaceLoading, addRecord } = useWorkspace();
 return <>
  <div data-page="Loans & debts" className="content">
   <PageHeader title={t('Loans & debts')} tabs={<Segmented className="page-tabs" as="nav" label={t('Loans & debts')} options={[{ value: 'overview', label: t('Overview') }, { value: 'payoff', label: t('Debt payoff planner') }] as const} value={view} onChange={setView}/>}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add record")}</Button></PageHeader>
   <ScreenNotices/>
   {view === 'overview' && (workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Loans & debts"/> : <>
    <DebtSummary entries={current} currency={currency}/>
    <RecordsTable title={t('Loans & debts')}/>
   </>)}
  </div>
  {view === 'payoff' && planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {view === 'payoff' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><DebtPayoffPanel records={planning.data.records} currency={currency} today={depositToday()} preferences={workspacePreferences}/></div>}
 </>;
}
