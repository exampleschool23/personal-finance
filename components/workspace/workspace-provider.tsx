"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { showError } from '@/lib/feedback';
import { demoMarket, type DemoWorkspace } from '@/lib/demo-finance';
import { useWorkspacePreferences } from '@/hooks/use-workspace-preferences';
import { useTransactionTools } from '@/hooks/use-transaction-tools';
import { usePlanning } from '@/hooks/use-planning';
import { upcomingPayments } from '@/lib/planning';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { useExpensePlans } from '@/hooks/use-expense-plans';
import { useCategoryIcons } from '@/hooks/use-category-icons';
import { CategoryHueContext, CategoryIconsContext } from '@/components/category-icons-context';
import { expensePlanMonth, monthlyBudgetTotals } from '@/lib/expense-plans';
import { useEarningSources } from '@/hooks/use-earning-sources';
import { withAssetIncomePlans, legacyEarningSources, sourceSchedule } from '@/lib/earning-sources';
import { saveTrackingStartRequest } from '@/hooks/use-comparison-profile';
import { convertAmount } from '@/lib/market';
import { usePortfolioSnapshots } from '@/hooks/use-portfolio-snapshots';
import { useMarket } from '@/hooks/use-market';
import { type Entry, normalizeEntry, kinds, income, expenses, estimatedCashFlow } from '@/lib/finance';
import { storedEntry } from '@/lib/record-table';
import { inAccountOrder } from '@/lib/account-directory';
import { sectionFor } from '@/components/workspace/navigation';
import { businessesIn } from '@/lib/business';
import { orderedGoals as orderById } from '@/lib/goal-order';
import { savedOrder } from '@/lib/workspace-preferences';
import { useTags } from '@/hooks/use-tags';
import { useRecordAttachments } from '@/hooks/use-record-attachments';
import { useHousehold } from '@/hooks/use-household';
import { canEdit } from '@/lib/household';
import { quoteLabel as describeQuote } from '@/lib/quote-label';
import { freshEntry as fresh } from '@/lib/record-save';
import { useAuth } from './state/use-auth';
import { useInviteLink } from './state/use-invite-link';
import { useSessionRouting } from './state/use-session-routing';
import { useAccountSettings } from './state/use-account-settings';
import { usePriceFetch } from './state/use-price-fetch';
import { useRecordActions } from './state/use-record-actions';
import { useArchive, useDeleteSchedule } from './state/use-archive';
import { useDemoBin } from './state/use-demo-bin';
import { useRecordFormTool } from './state/use-record-form-tool';
import { useRecordSave } from './state/use-record-save';
import { useOpenDialogs } from './state/use-open-dialogs';
import { useSampleWorkspace } from './state/use-sample-workspace';
import { workspaceLoading, workspaceTotals } from '@/lib/workspace-totals';
import { useRecordTable } from './state/use-record-table';
import { recordForms } from './state/record-forms';


/** Session, records and actions shared by the drawer, the top bar, the dialogs and every screen. */
function useWorkspaceState() {
    const pathname = usePathname();
    const router = useRouter();
    const section = sectionFor(pathname);
    const { t, locale } = useLanguage();
    const [demo, setDemo] = useState(false), [rows, setRows] = useState<Entry[]>([]), [editing, setEditing] = useState<Entry | null>(null), [deleting, setDeleting] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const { user, setUser, ready, configured, login } = useAuth({ setError, setBusy });
    const { pendingInvite, dismissInvite } = useInviteLink();
    const preview = useSessionRouting({ ready, user, demo, pathname, router, pendingInvite, startDemo });
    const household = useHousehold(user, demo);
    // A viewer of someone's household reads everything and changes nothing; the database refuses writes either way.
    const readOnly = !canEdit(household.state);
    const settings = useAccountSettings(user, demo);
    const { currency, preferencesData, settingsLoading } = settings;
    const { closeRecordDialogs, ...dialogs } = useOpenDialogs();
    const { stopping, setEditingIncomeSource } = dialogs;
    const sample = useSampleWorkspace();
    const { demoHoldingAccounts, setDemoHoldingAccounts } = sample;
    const [reload, setReload] = useState(0);
    // A household that is no longer available closed while the first reads were under way: read again from the person's own workspace.
    const workspaceReset = !!household.state?.reset;
    useEffect(() => { if (workspaceReset) queueMicrotask(() => setReload(n => n + 1)); }, [workspaceReset]);
    const [recordKinds, setRecordKinds] = useState<readonly string[]>(kinds);
    const refreshRecords = () => { setError(''); setReload(n => n + 1); };
    const [summary, setSummary] = useState<Entry[]>([]);
    const { market: liveMarket, loading: marketLoading, error: marketError, refresh } = useMarket(summary, !!user && !demo);
    const market = demo ? demoMarket : liveMarket;
    const price = usePriceFetch(editing, setEditing);
    const quoteLabel = (entry: Entry) => describeQuote(entry, market, currency, t, locale);
    const money = (n: number, c = currency) => formatMoney(n, c, locale);
    const [forecastMonth,setForecastMonth] = useState(expensePlanMonth);
    const basePlanning = usePlanning(user, demo, rows, reload, refreshRecords, demoHoldingAccounts, section==='Accounts'?'full':section==='Income & expenses'?'review':'workspace',section==='Income & expenses'?forecastMonth:undefined,sample.demoPlanning);
    const earningSources=useEarningSources(user,demo,reload,refreshRecords,(source,original)=>{
        if(original&&rows.some(row=>row.earning_source_id===source.id||row.income_source_id===source.schedule_id)&&['kind','currency','mode','frequency','recurrence_days','start_date','end_date','linked_record_id'].some(key=>original[key as keyof typeof original]!==source[key as keyof typeof source]))throw Error('Keep the type, currency and schedule compatible with recorded payments.');
        const schedule=sourceSchedule(source);
        setRows(previous=>schedule?[...previous.filter(row=>row.id!==schedule.id),schedule]:previous.map(row=>row.id===source.schedule_id?{...row,source_paused:true}:row));
    },legacyEarningSources(rows));
    const workspacePreferences=useWorkspacePreferences(user,demo,reload);
    // Accounts in the person's own order (Accounts page), wherever an account is picked.
    const planning={...basePlanning,data:{...basePlanning.data,records:inAccountOrder(basePlanning.data.records,savedOrder(workspacePreferences.data.preferences,'account_order')),occurrences:demo?[...basePlanning.data.occurrences,...rows.filter(row=>row.earning_source_id&&row.earning_due_on).flatMap(row=>{const source=earningSources.sources.find(source=>source.id===row.earning_source_id);return source?.schedule_id?[{id:row.id,record_id:source.schedule_id,due_on:row.earning_due_on!,status:'paid' as const}]:[];})]:basePlanning.data.occurrences}};
    const transactionTools=useTransactionTools(user,demo,reload,refreshRecords);
    const categoryIcons=useCategoryIcons(workspacePreferences,user,demo,planning.data.categories);
    const tagResource=useTags(user,demo,reload,planning.data.records,sample.demoTags);
    const attachments=useRecordAttachments(user,demo,reload);
    // Tags in the person's own order (Settings), wherever they are listed.
    const tags={...tagResource,data:{...tagResource.data,tags:orderById(tagResource.data.tags,savedOrder(workspacePreferences.data.preferences,'tag_order'))}};
    // Businesses in the person's own order (Settings), shared by filters, reports and the dashboard.
    const businessList=orderById(businessesIn(planning.data.records),savedOrder(workspacePreferences.data.preferences,'business_order'));
    const overdueCount = upcomingPayments(planning.data.records, planning.data.occurrences, undefined, undefined, planning.data.debtPayments).filter(item => item.overdue).length;
    // The month picker belongs to Cash flow. Every other screen plans for the current month.
    const planningMonth = section === 'Income & expenses' ? forecastMonth : expensePlanMonth();
    const expensePlans = useExpensePlans(user, demo, rows, reload, refreshRecords, planningMonth);
    const bin = useDemoBin({ demo, rows, setRows, expensePlans });
    const actions = useRecordActions({ demo, rows, setRows, refreshRecords, splits: transactionTools.data.splits, household, demoHoldingAccounts, setDemoHoldingAccounts, stopping });
    const archiveSchedule = useArchive({ demo, setRows, restoreDemoPlan: expensePlans.restoreDemo, refreshRecords });
    const deleteSchedule = useDeleteSchedule({ demo, rows, setRows, occurrences: planning.data.occurrences, bin, dropDemoPlan: expensePlans.dropDemo, refreshRecords });
    useRecordFormTool({ user, demo, openForm: () => { setRecordKinds(kinds); setEditing(fresh()); } });
    // A repeated message leaves the error state unchanged, so show the popup directly as well.
    const fail = (message: string) => { const shown = readOnly ? 'This shared workspace is view-only.' : message; setError(shown); showError(shown); };
    /** Opens a form only where the person may change the workspace. */
    const editable = () => { if (readOnly) showError('This shared workspace is view-only.'); return !readOnly; };
    const { save, remove } = useRecordSave({ demo, rows, setRows, editing, setEditing, deleting, setDeleting, setBusy, setError, fail, planning, plans: expensePlans.plans, sources: earningSources.sources, refreshRecords, setAccountBusiness: actions.setAccountBusiness, binRecord: bin.binRecord });
    function clearLocalSession() { setEditing(null); setDeleting(null); closeRecordDialogs(); setRecordKinds(kinds); price.resetPrice(); settings.resetSettings(); table.resetTable(); setSummary([]); setUser(null); setDemo(false); sample.clearSample(); bin.emptyBin(); setRows([]); setError(''); }
    async function logout() {
        if (!demo) {
            const r = await fetch('/api/auth', { method: 'DELETE' });
            if (!r.ok) { setError('Could not sign out. Please try again.'); return; }
        }
        clearLocalSession();
    }
    const budget = monthlyBudgetTotals(expensePlans.plans, expensePlans.month, (amount, source) => convertAmount(amount, source, currency, market?.rates ?? market?.fx?.rate));
    const planProjection = budget.partial.projected;
    const forecastReady = !expensePlans.loading && !expensePlans.error;
    const { current, monthlyIncomeEntries, excludedCurrencies, totalDebt, netWorth } = workspaceTotals({ records: demo ? rows : summary, planningRecords: planning.data.records, currency, market });
    // Full planning rows, as on Goals: summary rows leave out loan and debt payments.
    const forecast = estimatedCashFlow(monthlyIncomeEntries, planProjection, planningMonth);
    const table = useRecordTable({ user, demo, section, locale, currency, market, reload, rows, setRows, setSummary, setError, current, planning });
    const { sectionKey, historyPage, tableLoading, summaryLoaded } = table;
    // Viewing someone's household as a viewer records no daily snapshot; wait to know the role first.
    const snapshots = usePortfolioSnapshots(demo ? null : user, market, summaryLoaded && !marketLoading && (household.state ? !readOnly : !household.loading), reload);
    const loading = workspaceLoading({ demo, settingsLoading, summaryLoaded, tableLoading, plansLoading: expensePlans.loading, marketReady: !!market, marketLoading });

    const cashFlowSection = section === 'Income & expenses';
    const availableBusinesses = demo ? rows.filter(r => r.kind === 'Business') : table.businesses;
    const editingCashFlow = !!editing && [...income, ...expenses].includes(editing.kind);
    const linkedExpensePlan = expensePlans.plans.find(plan => plan.id === editing?.expense_plan_id);
    // Tables show display-currency copies. Dialogs must work on the saved record, in its own
    // currency. Transaction history returns raw rows, so normalize to the record shape forms expect.
    const storedRecord = (record: Entry) => storedEntry(record, { history: historyPage.data.records, planning: planning.data.records, rows, summary }, demo);
    const navigate = (path: string) => router.push(path);
    const forms = recordForms({ editable, setError, setRecordKinds, setEditing, setDeleting, setEditingIncomeSource, currency, section, cashFlowSection, holdingAccounts: planning.data.holdingAccounts, preferredCurrencies: preferencesData.currencies, sources: earningSources.sources, storedRecord });

    const seedSample = sample.seedSample;
    async function startDemo() {
        setBusy(true); setError('');
        try {
            // The sample workspace comes from the backend, like a signed-in account's records.
            const response = await fetch('/api/demo', { cache: 'no-store' });
            if (!response.ok) throw Error();
            const sample = await response.json() as DemoWorkspace;
            setRows(withAssetIncomePlans(sample.records.map(normalizeEntry))); seedSample(sample); expensePlans.seedDemo(sample.expensePlans); setDemo(true);
        } catch { setError('Connection unavailable. Please try again.'); }
        finally { setBusy(false); }
    }
    return {
        // Session
        ready, user, demo, preview, pathname, section, sectionKey, cashFlowSection, busy, configured, error, login, logout, startDemo, clearLocalSession,
        // Household sharing
        household, readOnly, pendingInvite, dismissInvite, assignRecordOwner: actions.assignRecordOwner, setAccountOwner: actions.setAccountOwner,
        // Preferences
        currency, setCurrency: settings.setCurrency, preferencesData, applyPreferences: settings.applyPreferences, savePreferences: settings.savePreferences, settingsLoading, settingsError: settings.settingsError, retrySettings: settings.retrySettings, workspacePreferences, onboardingNeeded: settings.onboardingNeeded, restartOnboarding: settings.restartOnboarding, saveTrackingStart: saveTrackingStartRequest,
        // Records and market data
        rows, summary, current, categoryIcons, market, marketLoading, marketError, refresh, quoteLabel, money, planning, earningSources, transactionTools, expensePlans, snapshots,
        reload, refreshRecords, budget, forecast, forecastReady, forecastMonth, setForecastMonth, excludedCurrencies, netWorth, totalDebt, monthlyIncomeEntries,
        availableBusinesses, businessList, tags, attachments, overdueCount, workspaceLoading: loading, deletedItems: bin.deletedItems, restoreDemoItem: bin.restoreDemoItem, discardDeletedItem: bin.discardDeletedItem,
        // Record table
        filters: table.filters, setFilters: table.setFilters, filtersActive: table.filtersActive, historyOnly: table.historyOnly, useFilteredRecords: table.useFilteredRecords, remoteHistory: table.remoteHistory, historyPage, visible: table.visible, totalRecords: table.totalRecords, pageCount: table.pageCount, tablePage: table.tablePage, tableLoading,
        recordsLoading: table.recordsLoading, showFirstPage: table.showFirstPage, showPage: table.showPage,
        // Actions
        ...forms, storedRecord, navigate, removePlan: bin.removePlan,
        saveHoldingAccount: actions.saveHoldingAccount, assignHolding: actions.assignHolding, recordMortgagePayment: actions.recordMortgagePayment, save, remove, stopRecord: actions.stopRecord, archiveSchedule, deleteSchedule, categorize: actions.categorize, assignTransactionsBusiness: actions.assignTransactionsBusiness, setAccountBusiness: actions.setAccountBusiness, saveBusiness: actions.saveBusiness, fetchPrice: price.fetchPrice, fetchingPrice: price.fetchingPrice, priceMessage: price.priceMessage,
        // Open dialogs
        editing, setEditing, editingCashFlow, recordKinds, linkedExpensePlan, deleting, setDeleting, ...dialogs,
    };
}

export type Workspace = ReturnType<typeof useWorkspaceState>;
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const workspace = useWorkspaceState();
    // Every category icon in the workspace shows the icon chosen for it in Settings.
    return <WorkspaceContext.Provider value={workspace}><CategoryIconsContext.Provider value={workspace.categoryIcons.emojiOf}><CategoryHueContext.Provider value={workspace.categoryIcons.hueOf}>{children}</CategoryHueContext.Provider></CategoryIconsContext.Provider></WorkspaceContext.Provider>;
}

export function useWorkspace() {
    const workspace = useContext(WorkspaceContext);
    if (!workspace) throw new Error('useWorkspace must be used within WorkspaceProvider');
    return workspace;
}
