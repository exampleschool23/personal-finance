"use client";
import { useMemo, useState } from 'react';
import { BusinessSettings, TagSettings } from '@/components/business-settings';
import { useLanguage } from '@/components/language-provider';
import { RuleDialog, RulesPanel, newRule } from '@/components/transactions-page';
import { useTransactionRules } from '@/hooks/use-transaction-rules';
import { nextPaletteColor } from '@/lib/business';
import { showNotice } from '@/lib/feedback';
import { tagsByRecord } from '@/lib/tags';
import type { TransactionRule } from '@/lib/transaction-rules';
import { AccountAccessPanel } from '@/components/account-access-panel';
import { DataTools } from '@/components/data-tools';
import { HouseholdPanel } from '@/components/household-panel';
import { ImportHistory } from '@/components/import-history';
import { InvestmentComparisonSettings } from '@/components/investment-comparison-settings';
import { SettingsLayout } from '@/components/settings-layout';
import { SettingsPanel } from '@/components/settings-panel';
import { TelegramPanel } from '@/components/telegram-panel';
import { TransactionToolsPanel } from '@/components/transaction-tools-panel';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function SettingsScreen() {
 const { household, user, demo, currency, market, reload, preferencesData, applyPreferences, settingsLoading, settingsError, retrySettings, planning, workspacePreferences, refreshRecords, clearLocalSession, restartOnboarding,
  businessList, tags, transactionTools, categorize, assignTransactionsBusiness, editRecord, requestDelete, setSettingUpBusinesses } = useWorkspace();
 const { t } = useLanguage();
 const tagMap = useMemo(() => tagsByRecord(tags.data.links), [tags.data.links]);
 const tagsOf = (id: string) => tagMap.get(id) ?? [];
 const rules = useTransactionRules(user, demo, reload, planning.data.records, transactionTools.data.splits, { categorize, assignBusiness: assignTransactionsBusiness, changeTags: tags.change, tagsOf }, refreshRecords);
 const [rule, setRule] = useState<TransactionRule | null>(null);
 const createTag = async (name: string) => { const id = crypto.randomUUID(); await tags.save({ id, name, color: nextPaletteColor(tags.data.tags.map(tag => tag.color)) }); return id; };
 return <div data-page="Settings" className="content">
  <SettingsLayout
   preferences={<><SettingsPanel key={String(user) + settingsLoading} initial={preferencesData} demo={demo} onSaved={applyPreferences} loading={!demo && settingsLoading} loadError={settingsError} onRetry={retrySettings} onRestartSetup={demo?undefined:restartOnboarding}/><TelegramPanel demo={demo}/><PlanningError/></>}
   household={<HouseholdPanel household={household} demo={demo}/>}
   benchmarks={<InvestmentComparisonSettings demo={demo} currencies={preferencesData.currencies}/>}
   security={<AccountAccessPanel settings onSignedOut={clearLocalSession}/>}
   categories={<TransactionToolsPanel preferences={workspacePreferences} owner={demo?null:user} demo={demo} onDeleted={refreshRecords} categories={planning.data.categories} loading={planning.loading} error={planning.error} onRetry={refreshRecords} saveCategory={async (name,direction)=>{await planning.save('category',{id:crypto.randomUUID(),name,direction});}}/>}
   businesses={<BusinessSettings businesses={businessList} records={planning.data.records} preferences={workspacePreferences} owner={demo?null:user} demo={demo} onEdit={editRecord} onDelete={requestDelete} onSetup={() => setSettingUpBusinesses(true)} onGuide={() => setSettingUpBusinesses('guide')}/>}
   tags={<TagSettings tags={tags} preferences={workspacePreferences} owner={demo?null:user} demo={demo}/>}
   rules={<><RulesPanel rules={rules.rules} categories={planning.data.categories} businesses={businessList} tags={tags.data.tags} onEdit={setRule} onAdd={() => setRule(newRule())} onRemove={item => rules.remove(item.id)}/>
    {rule && <RuleDialog key={rule.id} rule={rule} records={demo ? planning.data.records : undefined} categories={planning.data.categories} businesses={businessList} accounts={planning.data.records.filter(record => record.kind === 'Cash').map(record => ({ id: record.id, name: record.name }))} tags={tags.data.tags} tagsOf={tagsOf} onCreateTag={createTag} splits={transactionTools.data.splits} onSave={async (next, apply) => { const changed = await rules.save(next, apply); if (apply) showNotice(t('{changed} updated', { changed })); return changed; }} onClose={() => setRule(null)}/>}</>}
   data={<><DataTools owner={user} currency={currency} market={market} preferences={workspacePreferences} records={planning.data.records} onSaved={refreshRecords} demo={demo}/><ImportHistory owner={user} demo={demo} revision={reload} onSaved={refreshRecords}/></>}
  />
 </div>;
}
