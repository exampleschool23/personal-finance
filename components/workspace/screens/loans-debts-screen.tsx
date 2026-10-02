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
 const { user, current, currency, planning, workspacePreferences, workspaceLoading, addRecord } = useWorkspace();
 return <>
  <div data-page="Loans & debts" className="content">
   <DemoBanner/>
   <PageHeader title={t('Loans & debts')}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add record")}</Button></PageHeader>
   <ScreenNotices/>
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Loans & debts"/> : <>
    <DebtSummary entries={current} currency={currency}/>
    <RecordsTable title={t('Loans & debts')}/>
   </>}
  </div>
  {planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {!planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><DebtPayoffPanel records={planning.data.records} currency={currency} today={depositToday()} preferences={workspacePreferences}/></div>}
 </>;
}
