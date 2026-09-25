"use client";
import { demoRecords, demoMarket } from '@/lib/demo-finance';
import {ReminderPanel} from '@/components/daily-finance-panel';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { DrawerLink } from '@/components/drawer-link';
import { DatabaseStatus } from '@/components/database-status';
import { applyRecordChange } from '@/lib/record-balance';
import { refreshRead } from '@/lib/refresh-read';
import { SettingsLayout } from '@/components/settings-layout';
import { InvestmentComparisonSettings } from '@/components/investment-comparison-settings';
import { requiresCashAccount } from '@/lib/cash-account-required';
import { useWorkspacePreferences } from '@/hooks/use-workspace-preferences';
import { DebtPayoffPanel } from '@/components/planning/debt-payoff-panel';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { TransactionInsights } from '@/components/transaction-insights';
import { SpendingWatchlists } from '@/components/spending-watchlists';
import { useRecordFilters } from '@/hooks/use-record-filters';
import { PartialTotal } from '@/components/partial-total';
import { useTransactionTools } from '@/hooks/use-transaction-tools';
import { TransactionToolsPanel, SplitTransactionDialog } from '@/components/transaction-tools-panel';
import { ImportHistory } from '@/components/import-history';
import { DataTools } from '@/components/data-tools';
import { MonthlyReview } from '@/components/financial-review';
import { activeFilterCount, filterRecords, recordsRequestKey, type RecordFiltersValue } from '@/lib/record-filters';
import { isTransactionHistory } from '@/lib/transaction-history';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { AccountsPage } from '@/components/planning/accounts-page';
import { UpcomingPage } from '@/components/planning/upcoming-page';
import { GoalsPage } from '@/components/planning/goals-page';
import { usePlanning } from '@/hooks/use-planning';
import { upcomingPayments } from '@/lib/planning';
import { RecordFilters, emptyRecordFilters } from '@/components/record-filters';
import { RecordDialog } from '@/components/record-dialog';
import { SignInScreen } from '@/components/sign-in-screen';
import { RecentlyDeleted } from '@/components/recently-deleted';
import type { DeletedItem } from '@/lib/deleted-items';
import { StopScheduleDialog } from '@/components/stop-schedule-dialog';
import { LoadingPlaceholder, WorkspaceSkeleton } from '@/components/loading-placeholder';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useEffectEvent } from 'react';
import { ArrowUpRight, ArrowDownLeft, ChartNoAxesCombined, Wallet, ShieldCheck, LayoutDashboard, Landmark, HandCoins, Plus, LogOut, Pencil, Trash2, ChevronRight, Building2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountAccessPanel } from '@/components/account-access-panel';
import { LanguageProvider, LanguageSelector, useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { formatMoney, formatNumber, formatDate as sharedFormatDate, formatDateTime } from '@/lib/format';
import { ExpensePlans } from '@/components/expense-plans';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useExpensePlans } from '@/hooks/use-expense-plans';
import { expensePlanMonth, monthlyBudgetTotals, type ExpensePlan } from '@/lib/expense-plans';
import { depositToday } from '@/lib/deposit-interest';
import { InvestmentTracker } from '@/components/investment-tracker';
import { trackedKinds } from '@/lib/investment-history';
import { IncomeSourcesPanel,IncomeSourceEditor } from '@/components/income-sources-panel';
import { useEarningSources } from '@/hooks/use-earning-sources';
import { withAssetIncomePlans,legacyEarningSources,sourceSchedule,selectEarningSource,resolveEarningSource } from '@/lib/earning-sources';
import { EstimatedIncomeSources } from '@/components/estimated-income-sources';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { DebtSummary } from '@/components/debt-summary';
import { MonthlyMortgagePayments } from '@/components/monthly-mortgage-payments';
import { AssetDashboard } from '@/components/asset-dashboard';
import { SettingsPanel } from '@/components/settings-panel';
import { resolveIncomeSource } from '@/lib/income-sources';
import { defaultPreferences, type Preferences } from '@/lib/currencies';
import { MortgagePaymentDialog, type MortgagePayment } from '@/components/mortgage-payment-dialog';
import { CategoryBadge } from '@/components/category-badge';
import { RecordIcon } from '@/components/record-icon';
import { categoryColor } from '@/lib/category-colors';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { instrumentFor, instrumentKey, convertAmount, marketEntry } from '@/lib/market';
import { usePortfolioSnapshots } from '@/hooks/use-portfolio-snapshots';
import { useMarket, fetchMarket } from '@/hooks/use-market';
import { compareRecordDates } from '@/lib/record-dates';
import { sortAssetsByWorth } from '@/lib/asset-sort';
import { Entry, normalizeEntry, kinds, assets, liabilities, assetRecordKinds, lendingRecordKinds, income, expenses, value, totalValue, financialTotals, estimatedCashFlow } from '@/lib/finance';
const today = depositToday;
const fresh = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), lent_date: today(), frequency: 'Once', notes: '', business_id: null, ownership_percentage: 100, estimated_monthly_income: 0, estimated_monthly_payment: 0 });
const sample = () => demoRecords(today());
const emptyHistoryPage={records:[] as Entry[],total:0,page:1};
const sections = [['Overview', LayoutDashboard, '/'], ['Assets & investments', ChartNoAxesCombined, '/assets'], ['Income & expenses', ArrowDownLeft, '/income-expenses'], ['Loans & debts', HandCoins, '/loans-debts'], ['Accounts', Wallet, '/accounts'], ['Upcoming payments', Landmark, '/upcoming'], ['Savings goals', HandCoins, '/goals'], ['Recently deleted', Trash2, '/recently-deleted'], ['Settings', Settings, '/settings']] as const;
export default function FinanceWorkspace() {
    return <LanguageProvider><WorkspaceContent /></LanguageProvider>;
}

function WorkspaceContent() {
    const pathname = usePathname();
    const router = useRouter();
    const section = sections.find(([, , path]) => path === pathname)?.[0] || 'Overview';
    const { t, locale, setDefaultLanguage, setLanguage } = useLanguage();
    const formatDate = (value: string) => sharedFormatDate(value, locale);
    const preferences = <div className="preferences"><LanguageSelector compact /><ThemeToggle /></div>;
    const [user, setUser] = useState<string | null>(null), [ready, setReady] = useState(false), [configured, setConfigured] = useState(true), [demo, setDemo] = useState(false), [rows, setRows] = useState<Entry[]>([]), [currency, setCurrency] = useState<string>('USD'), [editing, setEditing] = useState<Entry | null>(null), [deleting, setDeleting] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [preferencesData, setPreferencesData] = useState<Preferences>(defaultPreferences);
    useEffect(() => {
        if (ready && !user && !demo && pathname !== '/') router.replace('/');
    }, [ready, user, demo, pathname, router]);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsError, setSettingsError] = useState('');
    const [settingsRevision,setSettingsRevision]=useState(0);
    const retrySettings=()=>{setSettingsLoading(true);setSettingsError('');setSettingsRevision(n=>n+1);};
    function applyPreferences(next: Preferences) { setPreferencesData(next); if (demo) setLanguage(next.language); else setDefaultLanguage(next.language); setCurrency(next.currencies[0]); }
    const receivePreferences = useEffectEvent(applyPreferences);
    useEffect(() => {
        if (!user || demo) return;
        const controller = new AbortController();
        fetch('/api/settings', { signal: controller.signal }).then(async response => {
            const data = await response.json() as Preferences & { error?: string };
            if (!response.ok) throw Error(data.error);
            if (!controller.signal.aborted) { receivePreferences(data); setSettingsError(''); }
        }).catch(error => { if (!controller.signal.aborted) setSettingsError(error.message); }).finally(() => { if (!controller.signal.aborted) setSettingsLoading(false); });
        return () => controller.abort();
    }, [user, demo, settingsRevision]);
    const [deletedItems,setDeletedItems]=useState<DeletedItem[]>([]);
    const [stopping,setStopping]=useState<Entry|null>(null);
    async function stopRecord(end_date:string) {
        if(!stopping)return;
        const stopped={...stopping,end_date};
        if(demo)setRows(previous=>previous.map(row=>row.id===stopped.id?stopped:row));
        else {
            const response=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(stopped)});
            if(!response.ok)throw Error((await response.json() as {error:string}).error);
            refreshRecords();
        }
    }
    const [splitting,setSplitting]=useState<Entry|null>(null);
    const [tracking, setTracking] = useState<Entry | null>(null);
    const [payingMortgage, setPayingMortgage] = useState<Entry | null>(null);
    async function recordMortgagePayment(payment: MortgagePayment) {
        if (demo) {
            setRows(previous => {
                if (previous.some(row => row.id === payment.id)) return previous;
                const mortgage = previous.find(row => row.id === payment.mortgage_id)!;
                return [...previous.map(row => row.id === mortgage.id ? { ...row, amount: row.amount - payment.principal } : row), { ...fresh(), id: payment.id, name: mortgage.name, kind: 'Other expense', currency: mortgage.currency, amount: payment.principal + payment.interest, date: payment.date, notes: payment.notes, mortgage_payment_id: payment.id, payment_principal: payment.principal, payment_interest: payment.interest }];
            });
        } else {
            const crossCurrency=payment.exchange_rate!==undefined;
            const payload=crossCurrency?{...payment,record_id:payment.mortgage_id,type:'mortgage_payment',amount:payment.principal+payment.interest,balance:null}:payment;
            const response = await fetch(crossCurrency?'/api/investment-history/exchange':'/api/mortgage-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw Object.assign(new Error(result.error || 'Payment could not be confirmed. Retry with the same details.'),{confirmedFailure:response.status<500});
            refreshRecords();
        }
    }
    const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
    const [summary, setSummary] = useState<Entry[]>([]);
    const [demoHoldingAccounts,setDemoHoldingAccounts]=useState<HoldingAccount[]>([]);
    const [recordTotal, setRecordTotal] = useState(0);
    const [pageState, setPageState] = useState({ key: '', page: 1 });
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [loadedKey, setLoadedKey] = useState('');
    const recordReadError = useRef('');
    const [reload, setReload] = useState(0);
    const [summaryLoaded, setSummaryLoaded] = useState(false);
    const summaryCache = useRef({ loaded: false, revision: -1 });
    const [recordKinds, setRecordKinds] = useState<readonly string[]>(kinds);
    const { market: liveMarket, loading: marketLoading, error: marketError, refresh } = useMarket(summary, !!user && !demo);
    const market = demo ? demoMarket : liveMarket;
    const snapshots = usePortfolioSnapshots(demo ? null : user, market, summaryLoaded && !marketLoading, reload);
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const priceKey = JSON.stringify([editing?.id, editing?.name, editing?.currency]);
    const [priceResult, setPriceResult] = useState({key:'',message:''});
    const priceMessage = priceResult.key === priceKey ? priceResult.message : '';
    const setPriceMessage = (message:string) => setPriceResult({key:priceKey,message});
    async function fetchPrice() {
        if (!editing) return;
        const target = editing, instrument = instrumentFor(target);
        if (!instrument) return;
        setFetchingPrice(true); setPriceMessage('');
        try {
            const data = await fetchMarket([target]);
            const quote = data.quotes[instrumentKey(instrument)];
            if (!quote) throw Error(data.errors[instrumentKey(instrument)] || 'Price unavailable. Saved price is shown.');
            const amount = convertAmount(quote.usd, 'USD', target.currency, (data.rates ?? data.fx?.rate));
            if (amount === null) throw Error('Exchange rate unavailable.');
            setEditing(current => current?.id === target.id && current.name === target.name && current.currency === target.currency && current.kind === target.kind ? { ...current, amount } : current);
        } catch (error) { setPriceMessage((error as Error).message); }
        finally { setFetchingPrice(false); }
    }
    const quoteLabel = (entry: Entry) => {
        const instrument = instrumentFor(entry), quote = instrument && market?.quotes[instrumentKey(instrument)];
        if (!instrument) return t('Select a coin or enter a stock ticker to fetch prices.');
        if (!quote || convertAmount(quote.usd, 'USD', currency, market?.rates ?? market?.fx?.rate) === null) return t(market?.errors[instrumentKey(instrument)] || 'Saved price');
        const time = formatDateTime(quote.marketTime || quote.fetchedAt, locale);
        return t(quote.marketTime ? '{source} · Quote: {time}' : '{source} · Checked: {time}', { source: quote.source, time });
    };
    const money = (n: number, c = currency) => formatMoney(n, c, locale);
    const sectionKey = section === 'Assets & investments' ? 'assets' : section === 'Income & expenses' ? 'cashflow' : section === 'Loans & debts' ? 'debts' : 'all';
    const currencyFilter = sectionKey === 'assets' || market?.rates?.[currency] ? '' : currency;
    const {filters,setFilters:updateFilters}=useRecordFilters(sectionKey,demo?'demo':user);
    const setFilters=(next:RecordFiltersValue)=>{updateFilters(next);setPageState({key:'',page:1});};
    const filtersActive = sectionKey !== 'assets' && (activeFilterCount(filters) > 0);
    const historyOnly = sectionKey === 'cashflow';
    const useFilteredRecords = filtersActive || historyOnly;
    const remoteHistory = historyOnly && !demo;
    const paginationKey = user + ':' + sectionKey + ':' + currencyFilter + ':' + JSON.stringify(filters);
    const page = pageState.key === paginationKey ? pageState.page : 1;
    const historyParams=new URLSearchParams({...filters,page:String(page),currency:currencyFilter});
    const historyPage=useOwnerResource('/api/transaction-history?'+historyParams,user,remoteHistory,reload,emptyHistoryPage);
    const serverPage = useFilteredRecords ? 1 : page;
    const serverPaginationKey = recordsRequestKey(user,sectionKey,currencyFilter,0);
    const requestKey = recordsRequestKey(user,sectionKey,currencyFilter,serverPage);
    const refreshRecords = () => { setError(''); setReload(n => n + 1); };
    const basePlanning = usePlanning(user, demo, rows, reload, refreshRecords, demoHoldingAccounts, section==='Accounts'?'full':section==='Income & expenses'?'review':'workspace');
    const [debtPayment,setDebtPayment]=useState<Entry|null>(null);
    const [editingIncomeSource,setEditingIncomeSource]=useState<import('@/lib/earning-sources').EarningSource|null>(null);
    const earningSources=useEarningSources(user,demo,reload,refreshRecords,(source,original)=>{
        if(original&&rows.some(row=>row.earning_source_id===source.id||row.income_source_id===source.schedule_id)&&['kind','currency','mode','frequency','recurrence_days','start_date','end_date','linked_record_id'].some(key=>original[key as keyof typeof original]!==source[key as keyof typeof source]))throw Error('Keep the type, currency and schedule compatible with recorded payments.');
        const schedule=sourceSchedule(source);
        setRows(previous=>schedule?[...previous.filter(row=>row.id!==schedule.id),schedule]:previous.map(row=>row.id===source.schedule_id?{...row,source_paused:true}:row));
    },legacyEarningSources(rows));
    const planning={...basePlanning,data:{...basePlanning.data,occurrences:demo?[...basePlanning.data.occurrences,...rows.filter(row=>row.earning_source_id&&row.earning_due_on).flatMap(row=>{const source=earningSources.sources.find(source=>source.id===row.earning_source_id);return source?.schedule_id?[{id:row.id,record_id:source.schedule_id,due_on:row.earning_due_on!,status:'paid' as const}]:[];})]:basePlanning.data.occurrences}};
    const transactionTools=useTransactionTools(user,demo,reload,refreshRecords);
    const workspacePreferences=useWorkspacePreferences(user,demo,reload);
    const overdueCount = upcomingPayments(planning.data.records, planning.data.occurrences).filter(item => item.overdue).length;
    const lastLoadedKey = useEffectEvent(() => loadedKey);
    const receiveServerPage=useEffectEvent((next:number)=>{if(!useFilteredRecords&&next!==page)setPageState({key:paginationKey,page:next});});
    const forecastMonth = expensePlanMonth();
    const expensePlans = useExpensePlans(user, demo, rows, reload, refreshRecords, section === 'Savings goals' ? expensePlanMonth() : forecastMonth);
    useEffect(() => {
        if (!user || demo || section === 'Settings') return;
        const controller = new AbortController();
        const markLoading = setTimeout(() => { if (!controller.signal.aborted) setRecordsLoading(true); }, 0);
        const params = new URLSearchParams({ page: String(serverPage), section: sectionKey, summary: summaryCache.current.loaded && summaryCache.current.revision === reload ? '0' : '1' });
        if (currencyFilter) params.set('currency', currencyFilter);
        refreshRead('/api/records?' + params, { signal: controller.signal }).then(async response => {
            const data = await response.json() as { error?: string; records: Entry[]; total: number; page: number; summary?: Entry[]; businesses?: Array<{ id: string; name: string }> };
            if (!response.ok) throw Error(data.error);
            if (controller.signal.aborted) return;
            setError(previous => previous === recordReadError.current ? '' : previous);
            setRows(data.records.map(normalizeEntry)); setRecordTotal(data.total);
            if (data.summary) { setSummary(data.summary.map(normalizeEntry)); setBusinesses(data.businesses || []); setSummaryLoaded(true); summaryCache.current = {loaded:true,revision:reload}; }
            setLoadedKey(recordsRequestKey(user,sectionKey,currencyFilter,data.page)); receiveServerPage(data.page);
        }).catch(error => { if (!controller.signal.aborted) { recordReadError.current=error.message; setError(error.message); if (lastLoadedKey() !== requestKey) { setRows([]); setRecordTotal(0); setLoadedKey(requestKey); } } })
          .finally(() => { clearTimeout(markLoading); if (!controller.signal.aborted) setRecordsLoading(false); });
        return () => { clearTimeout(markLoading); controller.abort(); };
    }, [user, demo, serverPage, section, sectionKey, currencyFilter, reload, serverPaginationKey, requestKey]);
    useEffect(() => { const url = new URL(window.location.href); const authError = url.searchParams.get('auth_error'); if (authError) {
        const messages: Record<string, string> = { google_setup: 'Google sign-in is awaiting setup. You can still sign in with email.', google_unavailable: 'Google sign-in is temporarily unavailable. Please try again.', google_cancelled: 'Google sign-in was not completed. Please try again.', google_expired: 'Your sign-in attempt expired. Please start again.', google_failed: 'Google sign-in failed. Please try again or use email.' };
        queueMicrotask(() => setError(messages[authError] ?? 'Sign-in could not be completed. Please try again.'));
        url.searchParams.delete('auth_error');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } fetch('/api/auth').then(r => r.json() as Promise<{
        configured: boolean;
        user: null | {
            email: string;
        };
    }>).then(async (d) => { setConfigured(d.configured); if (d.user) {
        setUser(d.user.email);

    } }).catch(e => setError(e.message)).finally(() => setReady(true)); }, []);
    useEffect(() => { const ctx = (document as unknown as {
        modelContext?: {
            registerTool: (t: unknown, o: unknown) => void;
        };
    }).modelContext; if (!ctx)
        return; const controller = new AbortController(); try {
        ctx.registerTool({ name: 'start_finance_record', description: 'Open the finance record form. Does not save a record.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
                throw Error('No fields accepted.'); if (!user && !demo)
                throw Error('Sign in first.'); setRecordKinds(kinds); setEditing(fresh()); return { status: 'form_opened' }; } }, { signal: controller.signal });
    }
    catch { } return () => controller.abort(); }, [user, demo]);
    async function login(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); try {
        const f = new FormData(e.currentTarget);
        const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) });
        const d = await r.json() as {
            error?: string;
            user: {
                email: string;
            };
        };
        if (!r.ok)
            throw Error(d.error);
        setUser(d.user.email);

    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function save(e: React.FormEvent) { e.preventDefault(); if (!editing)
        return; if ((editing.kind === 'Money lent' && (!editing.lent_date || (editing.date && editing.date < editing.lent_date))) || (editing.kind !== 'Money lent' && !editing.date)) { setError('Check the record fields.'); return; } setBusy(true); setError(''); try {
        if (editing.expense_plan_id) {
            const plan = expensePlans.plans.find(p => p.id === editing.expense_plan_id);
            if (!plan || editing.currency !== plan.currency || editing.frequency !== 'Once' || !expenses.includes(editing.kind) || editing.business_id || editing.date < plan.start_date || (plan.end_date && editing.date > plan.end_date)) throw Error('Check the expense plan, currency and spending date.');
        }
        if(requiresCashAccount(editing)&&(!editing.account_id||planning.loading||planning.error||!planning.data.records.some(record=>record.id===editing.account_id&&record.kind==='Cash')))throw Error('Choose a cash account.');
        const previewRate=Number(new FormData(e.currentTarget as HTMLFormElement).get('account_exchange_rate'));
        const cashAccount=planning.data.records.find(record=>record.id===editing.account_id);
        if(editing.account_id&&cashAccount?.currency!==editing.currency&&(!Number.isFinite(previewRate)||previewRate<=0))throw Error('Historical exchange rates are unavailable.');
        const earningPatch=editing.earning_source_id?resolveEarningSource(editing,earningSources.sources,rows.find(row=>row.id===editing.id)):{};
        if(demo&&earningPatch.earning_due_on&&rows.some(row=>row.id!==editing.id&&row.earning_source_id===editing.earning_source_id&&row.earning_due_on===earningPatch.earning_due_on))throw Error('This scheduled payment is already recorded.');
        const incomeSourcePatch=editing.income_source_id?resolveIncomeSource(editing,planning.data.records):{};
        if(demo&&editing.kind==='Salary'&&editing.income_source_id&&rows.some(row=>row.id!==editing.id&&row.income_source_id===editing.income_source_id&&row.income_due_on===incomeSourcePatch.income_due_on))throw Error('This salary payment is already recorded.');
        const savedRecord={...editing,name:expenses.includes(editing.kind)&&!editing.name.trim()?(editing.notes.trim().slice(0,120)||planning.data.categories.find(category=>category.id===editing.custom_category_id)?.name||t(editing.kind)):editing.name,account_exchange_rate:editing.account_id&&cashAccount?.currency!==editing.currency?previewRate:undefined,...(liabilities.includes(editing.kind)&&!rows.some(row=>row.id===editing.id)?{opened_on:editing.opened_on??today()}:{})};
        Object.assign(savedRecord,incomeSourcePatch,earningPatch);
        if(liabilities.includes(savedRecord.kind)&&savedRecord.opened_on&&(savedRecord.opened_on>today()||savedRecord.date<savedRecord.opened_on))throw Error('Check the start and due dates.');
        if (!demo) {
            const r = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedRecord) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        if (demo) {
            const original=rows.find(record=>record.id===savedRecord.id);
            setRows(withAssetIncomePlans(applyRecordChange(rows,original,savedRecord),earningSources.sources));
        }
        else refreshRecords();
        setEditing(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function remove() { if (!deleting)
        return; if (demo && deleting.kind === 'Business' && rows.some(r => r.business_id === deleting.id)) { setError('This business has linked records. Unlink them before deleting or changing its category.'); return; } setBusy(true); setError(''); try {
        if (!demo) {
            const r = await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleting.id }) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        if (demo) {
            const original=rows.find(row=>row.id===deleting.id)||deleting;
            const updated=applyRecordChange(rows,original);
            setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'finance_records',data:original,deleted_at:new Date().toISOString()},...prev]);
            setRows(updated);
        }
        else refreshRecords();
        setDeleting(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function clearLocalSession() { setEditing(null); setDeleting(null); setStopping(null); setSplitting(null); setTracking(null); setPayingMortgage(null); setSettingsError(''); setPageState({key:'',page:1}); setRecordKinds(kinds); setPriceResult({key:'',message:''}); setLoadedKey(''); setSettingsLoading(true); setUser(null); setDemo(false); setDemoHoldingAccounts([]); setDeletedItems([]); setRows([]); setSummary([]); setBusinesses([]); setRecordTotal(0); setPreferencesData(defaultPreferences); setCurrency('USD'); setSummaryLoaded(false); summaryCache.current = {loaded:false,revision:-1}; setError(''); }
    async function logout() { if (!demo) {
        const r = await fetch('/api/auth', { method: 'DELETE' });
        if (!r.ok) {
            setError('Could not sign out. Please try again.');
            return;
        }
    } clearLocalSession(); }
    const brand = <div className="brand"><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span></div>;
    if (!ready || (!user && !demo && pathname !== '/'))
        return <main className="session-loading" aria-busy="true">{brand}<LoadingPlaceholder label={t("Loading your workspace…")} rows={3}/></main>;
    if (!user && !demo)
        return <SignInScreen brand={brand} preferences={preferences} busy={busy} configured={configured} error={error} onLogin={login} onDemo={() => { setRows(withAssetIncomePlans(sample())); setDemo(true); setError(''); }} />;
    const budget = monthlyBudgetTotals(expensePlans.plans, expensePlans.month, (amount, source) => convertAmount(amount, source, currency, market?.rates ?? market?.fx?.rate));
    const planProjection = budget.partial.projected;
    const forecastReady = !expensePlans.loading && !expensePlans.error;
    const excludedCurrencies=[...new Set((demo?rows:summary).filter(record=>[...assets,...liabilities].includes(record.kind)&&marketEntry(record,currency,market)===null).map(record=>record.currency))];
    const current = (demo ? rows : summary).map(r => marketEntry(r, currency, market)).filter((r): r is Entry => r !== null);
    const { totalAssets, totalDebt, netWorth } = financialTotals(current);
    const forecast = estimatedCashFlow(current, planProjection, forecastMonth);
    const sortRecords = (entries: Entry[]) => [...entries].sort((a,b) => compareRecordDates(a.kind === 'Money lent' ? a.lent_date || a.date : a.date, b.kind === 'Money lent' ? b.lent_date || b.date : b.date) || b.id.localeCompare(a.id));
    const demoVisible = (sectionKey === 'assets' ? sortAssetsByWorth : sortRecords)(current.filter(r => section === 'Overview' || (section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : [...income, ...expenses]).includes(r.kind)));
    const filteredRecords = filterRecords((demo ? rows : planning.data.records).filter(r => (!historyOnly || isTransactionHistory(r)) && (sectionKey === 'all' || (sectionKey === 'debts' ? lendingRecordKinds : [...income,...expenses]).includes(r.kind)) && (!currencyFilter || r.currency === currencyFilter)),filters,locale);
    const totalRecords = remoteHistory ? historyPage.data.total : useFilteredRecords ? filteredRecords.length : demo ? demoVisible.length : recordTotal;
    const pageCount = Math.max(1, Math.ceil(totalRecords / 10));
    const tablePage = remoteHistory ? historyPage.data.page : Math.min(page,pageCount);
    const tableLoading = remoteHistory ? historyPage.loading : !demo && (useFilteredRecords ? planning.loading : loadedKey !== requestKey);
    const workspaceLoading = !demo && (settingsLoading || (!summaryLoaded && tableLoading) || expensePlans.loading || (!market && marketLoading));
    const visible = remoteHistory ? historyPage.data.records.map(r=>marketEntry(normalizeEntry(r),currency,market)??normalizeEntry(r)) : useFilteredRecords ? filteredRecords.slice((tablePage-1)*10,tablePage*10).map(r=>marketEntry(r,currency,market)??r) : demo ? demoVisible.slice((page - 1) * 10, page * 10) : tableLoading ? [] : sectionKey === 'assets' ? sortAssetsByWorth(rows, r => marketEntry(r, currency, market)).slice((page - 1) * 10, page * 10).map(r => marketEntry(r, currency, market) ?? r) : rows.map(r => marketEntry(r, currency, market) ?? r);

    const allocation = assets.map(k => ({ kind: k, total: totalValue(current, [k]) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    const cashFlowSection = section === 'Income & expenses';
    const availableBusinesses = demo ? rows.filter(r => r.kind === 'Business') : businesses;
    const editingCashFlow = !!editing && [...income, ...expenses].includes(editing.kind);
    const linkedExpensePlan = expensePlans.plans.find(plan => plan.id === editing?.expense_plan_id);
    async function removePlan(id:string) {
        const plan=expensePlans.plans.find(plan=>plan.id===id);
        await expensePlans.remove(id);
        if(demo&&plan)setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'expense_plans',data:plan,deleted_at:new Date().toISOString()},...prev]);
    }
    function restoreDemoItem(item:DeletedItem) {
        if(item.source==='expense_plans')expensePlans.restoreDemo(item.data);
        else {
            const entry=item.data;
            if(entry.business_id&&!rows.some(row=>row.id===entry.business_id&&row.kind==='Business'))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');
            if(entry.expense_plan_id){const plan=expensePlans.plans.find(plan=>plan.id===entry.expense_plan_id);if(!plan||plan.currency!==entry.currency||entry.date<plan.start_date||(plan.end_date&&entry.date>plan.end_date))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');}
            setRows(applyRecordChange(rows,undefined,entry));
        }
        setDeletedItems(prev=>prev.filter(deleted=>deleted.id!==item.id));
    }
    const spendFromPlan = (plan: ExpensePlan) => {
        setError(''); setRecordKinds(expenses);
        const date = depositToday() < plan.start_date ? plan.start_date : plan.end_date && depositToday() > plan.end_date ? plan.end_date : depositToday();
        setEditing({ ...fresh(), name: plan.name, kind: plan.category === 'Groceries' || plan.category === 'Household' ? 'Living expense' : 'Other expense', currency: plan.currency, frequency: 'Once', expense_plan_id: plan.id, date });
    };

    const addCashFlow = (kind: Entry['kind']) => { setError(''); setRecordKinds(income.includes(kind) ? income : expenses); setEditing({ ...fresh(), currency, kind, frequency:'Once' }); };
    const addRecord = () => {
        if (cashFlowSection) { addCashFlow('Other expense'); return; }
        setError('');
        setRecordKinds(section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : kinds);
        setEditing({ ...fresh(), currency, kind: section === 'Loans & debts' ? 'Mortgage' : 'Cash' });
    };
    const addAccountRecord = (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', holdingAccountId?: string) => {
        setError(''); setRecordKinds(holdingAccountId ? [kind] : kind==='Cash'||kind==='Deposit' ? ['Cash','Deposit'] : ['Stock','Crypto']);
        const account=planning.data.holdingAccounts?.find(item=>item.id===holdingAccountId);
        setEditing({...fresh(),kind,is_investment:kind==='Cash'&&account?.kind==='Cash',currency:account&&preferencesData.currencies.includes(account.currency)?account.currency:currency,holding_account_id:holdingAccountId??null});
    };
    const saveHoldingAccount = async (account: HoldingAccount) => {
        if(demo){setDemoHoldingAccounts(items=>[...items.filter(item=>item.id!==account.id),account]);return;}
        const response=await fetch('/api/holding-accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',...account})});
        const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
        refreshRecords();
    };
    const assignHolding = async (record: Entry, accountId: string|null) => {
        if(demo){setRows(items=>items.map(item=>item.id===record.id?{...item,holding_account_id:accountId}:item));return;}
        const response=await fetch('/api/holding-accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',record_id:record.id,holding_account_id:accountId})});
        const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
        refreshRecords();
    };
    const editRecord = (record: Entry) => {
        const source=earningSources.sources.find(source=>source.schedule_id===record.id);
        if(source){setEditingIncomeSource(source);return;}
        setError('');
        setRecordKinds(income.includes(record.kind) ? income : expenses.includes(record.kind) ? expenses : assetRecordKinds.includes(record.kind) ? assetRecordKinds : lendingRecordKinds);
        setEditing({ ...(historyPage.data.records.find(r=>r.id===record.id) || planning.data.records.find(r=>r.id===record.id) || rows.find(r => r.id === record.id) || record) });
    };
    const field = (key: keyof Entry, v: string | number) => setEditing(p => p ? { ...p, [key]: v, ...(key === 'currency' ? {account_id: null} : {}) } : p);
    return <SidebarProvider><Sidebar><SidebarHeader className="p-6">{brand}</SidebarHeader><SidebarContent className="px-4 pt-8"><p className="nav-label">{t("WORKSPACE")}</p><SidebarMenu>{sections.map(([name, Icon, path]) => <SidebarMenuItem key={name}><SidebarMenuButton asChild className="nav-item" isActive={section === name}><DrawerLink href={path} aria-current={section === name ? 'page' : undefined}><Icon /><span>{t(name)}</span>{name === 'Upcoming payments' && overdueCount > 0 && <span className="count">{formatNumber(overdueCount, locale, 0)}</span>}</DrawerLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="p-5"><div className="user-line"><span className="avatar">{demo ? 'D' : user?.slice(0, 1).toUpperCase()}</span><div><strong>{demo ? t("Demo workspace") : t("Personal account")}</strong><p>{demo ? t("Sample data") : user}</p></div></div><Button variant="ghost" onClick={logout}><LogOut size={16}/>{demo ? t("Exit demo") : t("Sign out")}</Button></SidebarFooter></Sidebar><main className="workspace"><DatabaseStatus owner={user} demo={demo}/><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger aria-label={t('Toggle Sidebar')}/><span>{t("My workspace")}</span><ChevronRight size={14}/><span className="muted">{t(section)}</span></div><div className="topbar-actions"><Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="header-currency-trigger" aria-label={t('Display currency')}>{currency}<ChevronRight size={14} className="rotate-90" aria-hidden="true"/></Button></PopoverTrigger><PopoverContent align="end" className="header-currency-popover"><div className="header-currency-panel"><div className="currency-bar"><div className="currency-switch" aria-label={t("Display currency")}>{preferencesData.currencies.map(c => <button key={c} aria-pressed={currency === c} className={currency === c ? 'selected' : ''} onClick={() => setCurrency(c)}>{c === 'USD' ? '$ USD' : c}</button>)}</div><span>{t('Balances converted to {currency}.', { currency })}</span></div><div className="market-bar"><span>{demo ? t('Illustrative sample prices and exchange rates.') : market?.ratesDate && currency !== 'UZS' ? t('Daily exchange rates · {date}', { date: formatDate(market.ratesDate) }) : market?.fx ? t('1 USD = {rate} UZS · CBU · {date}', { rate: formatNumber(market.fx.rate, locale), date: formatDate(market.fx.date) }) : t(marketLoading ? 'Fetching prices…' : 'Exchange rate unavailable. Only records in the selected currency are included.')}</span><Button variant="outline" size="sm" disabled={marketLoading || demo} onClick={refresh}>{t(marketLoading ? 'Fetching prices…' : 'Refresh prices')}</Button></div>{market?.ratesDate && <p className="fx-attribution"><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a> · {formatDate(market.ratesDate)}</p>}</div></PopoverContent></Popover><Button variant="outline" size="sm" onClick={()=>{setRecordKinds(expenses);setEditing({...fresh(),currency,kind:'Other expense',frequency:'Once'});}}>{t('Quick expense')}</Button>{preferences}</div></header><div data-page={section} className={section === 'Overview' ? 'content overview-content' : section === 'Assets & investments' ? 'content assets-content' : 'content'}>{['Accounts','Upcoming payments','Savings goals'].includes(section) ? <>{planning.error && <div className="error" role="alert">{t(planning.error)} <Button onClick={refreshRecords}>{t('Retry')}</Button></div>}{planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : section === 'Accounts' ? <AccountsPage owner={demo?null:user} onSaved={refreshRecords} currency={currency} data={planning.data} save={planning.save} onAdd={addAccountRecord} onEdit={editRecord} onTrack={demo?undefined:setTracking} market={market} currencies={preferencesData.currencies} saveAccount={saveHoldingAccount} assignHolding={assignHolding}/> : section === 'Upcoming payments' ? <UpcomingPage data={planning.data} save={planning.save}/> : <GoalsPage currency={currency} preferences={workspacePreferences} owner={user} demo={demo} revision={reload} onSaved={refreshRecords} data={planning.data} save={planning.save} currencies={preferencesData.currencies} market={market} plans={expensePlans.plans} plansReady={!expensePlans.loading && !expensePlans.error} snapshots={snapshots.snapshots} historyError={snapshots.error}/>}</> : section === 'Recently deleted' ? <RecentlyDeleted demo={demo} demoItems={deletedItems} onRestore={restoreDemoItem} onDelete={item=>setDeletedItems(items=>items.filter(existing=>existing.id!==item.id))} onSaved={refreshRecords}/> : section === 'Settings' ? <SettingsLayout preferences={<><SettingsPanel key={String(user) + settingsLoading} initial={preferencesData} demo={demo} onSaved={applyPreferences} loading={!demo && settingsLoading} loadError={settingsError} onRetry={retrySettings}/>{planning.error&&<p className="error" role="alert">{t(planning.error)} <Button onClick={refreshRecords}>{t('Retry')}</Button></p>}</>} benchmarks={<InvestmentComparisonSettings demo={demo} currencies={preferencesData.currencies}/>} security={<AccountAccessPanel settings onSignedOut={clearLocalSession}/>} categories={<TransactionToolsPanel onDeleted={refreshRecords} categories={planning.data.categories} loading={planning.loading} error={planning.error} onRetry={refreshRecords} saveCategory={async (name,direction)=>{await planning.save('category',{id:crypto.randomUUID(),name,direction});}}/>} data={<><DataTools owner={user} currency={currency} market={market} preferences={workspacePreferences} records={planning.data.records} onSaved={refreshRecords} demo={demo}/><ImportHistory owner={user} demo={demo} revision={reload} onSaved={refreshRecords}/></>}/> : <>{demo && <div className="demo-banner"><span>{t("DEMO MODE")}</span> {t("Sample balances · Changes are not saved to an account.")}</div>}<div className={section === 'Overview' ? 'page-heading overview-welcome' : 'page-heading'}><div><h1>{section === 'Overview' ? <><span>{preferencesData.display_name?.trim() ? t("Hi, {name}!", { name: preferencesData.display_name.trim() }) : t("Hi there!")}</span><span className="welcome-wave" aria-hidden="true">👋</span></> : t(section)}</h1><p className="muted">{section === 'Overview' ? t("Everything you own, earn, and owe. In one place.") : cashFlowSection ? t("Plan recurring income and expenses, or add a one-time entry.") : t("Manage your records and keep your balances up to date.")}</p></div>{section !== 'Overview' && <div className="entry-actions">{cashFlowSection ? <><Button variant="outline" className="cashflow-action cashflow-action-income" onClick={() => addCashFlow('Other income')}><span>{t("Add income")}</span></Button><Button className="cashflow-action cashflow-action-expense" onClick={() => addCashFlow('Other expense')}><span>{t("Add expense")}</span></Button></> : <Button className="primary" onClick={addRecord}><Plus size={18}/>{t(section === 'Assets & investments' ? "Add asset" : "Add record")}</Button>}</div>}</div>{(demo ? rows : summary).some(r => marketEntry(r, currency, market) === null) && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}{marketError && <p role="status" className="muted">{t(marketError)}</p>}{!cashFlowSection && expensePlans.error && <p role="alert" className="error">{t(expensePlans.error)} <Button variant="outline" onClick={refreshRecords}>{t('Retry')}</Button></p>}{budget.missingCurrencies.length > 0 && <p className="muted">{t('Some expense plans could not be converted and are excluded from the forecast.')}</p>}{error && <div className="error" role="alert">{t(error)}</div>}{workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section={section}/> : section === 'Assets & investments' ? <AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={rows} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={addRecord} onEdit={editRecord} onTrack={setTracking} onDelete={record => {setError('');setDeleting(record);}} quoteLabel={quoteLabel}/> : <>{cashFlowSection&&!planning.loading&&!planning.error&&<MonthlyReview owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/>} {cashFlowSection&&transactionTools.error&&<p className="error" role="alert">{t(transactionTools.error)} <Button onClick={transactionTools.retry}>{t('Retry')}</Button></p>}{cashFlowSection ? <div className="metrics recurring-metrics"><article><p>{t("Estimated monthly income")} <ArrowDownLeft size={18}/></p><h2 className="positive">{money(forecast.plannedIncome)}</h2><small>{t("Includes asset estimates; linked business income counted once.")}</small></article><article><p>{t("Estimated monthly expenses")} <ArrowUpRight size={18}/></p><h2>{forecastReady ? money(forecast.monthlyExpenses + forecast.mortgagePayments) : '—'}</h2><small>{t("Recurring expenses, monthly plans and estimated mortgage payments")}</small></article><article><p>{t("Estimated monthly cash flow")} <ChartNoAxesCombined size={18}/></p><h2 className={forecast.forecast >= 0 ? 'positive' : 'negative'}>{forecastReady ? money(forecast.forecast) : '—'}</h2><small>{t("One-time entries are excluded")}</small></article></div> : section === 'Loans & debts' ? <DebtSummary entries={current} currency={currency}/> : <div className="metrics"><article className="net-worth"><p>{t("NET WORTH")} <Wallet size={18}/></p><h2>{money(netWorth)}</h2><PartialTotal currencies={excludedCurrencies}/><div className="net-line"/></article><article><p>{t("Total assets")} <Landmark size={18}/></p><h2>{money(totalAssets)}</h2><PartialTotal currencies={excludedCurrencies}/></article><article><p>{t("Outstanding debt")} <HandCoins size={18}/></p><h2>{money(totalDebt)}</h2><PartialTotal currencies={excludedCurrencies}/></article><article><p>{t("Estimated monthly cash flow")} <ArrowUpRight size={18}/></p><h2 className={forecast.forecast >= 0 ? 'positive' : 'negative'}>{forecastReady ? money(forecast.forecast) : '—'}</h2></article></div>}{section === 'Overview' && <PortfolioOverview onOpenActivity={demo ? undefined : activity=>{if(!activity.record)return;if(activity.tracker)setTracking(activity.record);else editRecord(activity.record);}} excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} revision={reload}/>}{(forecast.plannedIncome > 0 || forecast.monthlyExpenses > 0 || forecast.mortgagePayments > 0) && (section === 'Overview' || section === 'Loans & debts') && <section className="panel forecast-panel"><div><h2>{t('Estimated monthly cash flow')}</h2><p className="muted">{t('Asset income estimates plus other recurring income, minus recurring expenses and estimated mortgage payments. Linked business income is counted once.')}</p></div><div><strong>{forecastReady ? money(forecast.forecast) : '—'}</strong><small>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })}</small><small>{t('Other recurring income: {amount}', { amount: money(forecast.otherIncome) })}</small><small>{t('Recurring and planned expenses: {amount}', { amount: forecastReady ? money(forecast.monthlyExpenses) : '—' })}</small><small>{t('Estimated mortgage payments: {amount}', { amount: money(forecast.mortgagePayments) })}</small><small>{t('One-time entries are excluded')}</small></div></section>}{section === 'Overview' && <div className="insights"><section className="panel"><div className="panel-title"><h2>{t("Asset allocation")}</h2><span>{t("Current balances")}</span></div>{allocation.length ? <><div className="allocation-bar">{allocation.map(a => <div key={a.kind} style={{ width: `${a.total / totalAssets * 100}%`, background: categoryColor(a.kind) }}/>)}</div><div className="allocation-list">{allocation.map(a => <div key={a.kind}><span><i style={{ background: categoryColor(a.kind) }}/>{t(a.kind)}</span><strong>{money(a.total)}</strong><span>{formatNumber(a.total / totalAssets * 100, locale, 1)}%</span></div>)}</div></> : <div className="empty"><Landmark /><p>{t("Add your first asset to see its allocation.")}</p></div>}</section><section className="panel"><div className="panel-title"><h2>{t("Monthly commitments")}</h2><span>{t("Recurring and planned")}</span></div><div className="cash-row"><span className="icon-box"><ArrowDownLeft /></span><div><p>{t("Income")}</p><small>{t("Includes asset estimates; linked business income counted once.")}</small></div><strong className="positive">{money(forecast.plannedIncome)}</strong></div><div className="cash-row"><span className="icon-box outgoing"><ArrowUpRight /></span><div><p>{t("Expenses")}</p><small>{t("Rent, living costs & more")}</small></div><strong>{forecastReady ? money(forecast.monthlyExpenses) : '—'}</strong></div><div className="cash-row"><span className="icon-box outgoing"><Building2 /></span><div><p>{t("Estimated mortgage payments")}</p><small>{t("Principal and interest")}</small></div><strong>{money(forecast.mortgagePayments)}</strong></div><div className="cash-footer"><span>{t("Left after expenses")}</span><strong>{forecastReady ? money(forecast.forecast) : '—'}</strong></div><p className="footnote">{t("Yearly records are divided by 12. Linked plan spending is counted within its plan; other one-time records are excluded.")}</p></section></div>}{cashFlowSection&&<IncomeSourcesPanel controller={earningSources} currencies={preferencesData.currencies} records={planning.data.records} onRecord={(source,bonus)=>{const entry={...fresh(),kind:source.kind,currency:source.currency,frequency:'Once' as const};setRecordKinds(income);setEditing({...entry,...selectEarningSource(entry,source,bonus)});}}/>}{cashFlowSection && <EstimatedIncomeSources earningSources={earningSources.sources} entries={current} currency={currency} month={forecastMonth}/>}{cashFlowSection && <MonthlyMortgagePayments records={demo?rows:planning.data.records} currency={currency} market={market} loading={planning.loading} error={planning.error} onPay={setPayingMortgage} onEdit={editRecord}/>}{cashFlowSection && <ExpensePlans {...expensePlans} remove={removePlan} currency={currency} onSpend={spendFromPlan} onRetry={refreshRecords}/>}{section !== 'Overview' && <section id="workspace-records" className="panel records"><div className="panel-title"><h2>{historyOnly ? t('Transaction history') : t(section)} <span className="count">{tableLoading ? '—' : formatNumber(totalRecords, locale, 0)}</span></h2><span>{t(historyOnly ? "Recorded income and expenses" : "Fetched prices where available")}</span></div><RecordFilters value={filters} onChange={setFilters} categories={planning.data.categories} kinds={sectionKey === 'debts' ? lendingRecordKinds : sectionKey === 'cashflow' ? [...income,...expenses] : kinds}/>{remoteHistory&&historyPage.error&&<p role="alert" className="error">{t(historyPage.error)} <Button onClick={historyPage.retry}>{t('Retry')}</Button></p>}{useFilteredRecords&&planning.error&&<p role="alert" className="error">{t(planning.error)}</p>}{tableLoading ? <LoadingPlaceholder label={t("Loading records…")}/> : visible.length ? <div className="table-scroll"><table><thead><tr><th>{t("Name")}</th><th>{t("Category")}</th><th>{cashFlowSection ? t("Date") : t("Date / due date")}</th><th>{cashFlowSection ? t("Amount") : t("Value")}</th><th>{t("Actions")}</th></tr></thead><tbody>{visible.map(r => <tr key={r.id} style={{borderLeft: `3px solid ${categoryColor(r.kind)}`}}><td><div className="record-name"><RecordIcon record={r} /><div><strong>{r.name}</strong>{r.kind === 'Mortgage' && (r.estimated_monthly_payment ?? 0) > 0 && <small>{t("Estimated payment: {amount}/month", { amount: money(r.estimated_monthly_payment!, r.currency) })}</small>}{r.expense_plan_id && <small>{t('Expense plan: {name}', { name: expensePlans.plans.find(plan => plan.id === r.expense_plan_id)?.name || r.name })}</small>}{r.mortgage_payment_id && <small>{t("Mortgage payment · Principal: {principal} · Interest: {interest}", { principal: money(Number(r.payment_principal), r.currency), interest: money(Number(r.payment_interest), r.currency) })}</small>}{['Business', 'Property'].includes(r.kind) && (r.estimated_monthly_income ?? 0) > 0 && <small>{t("Estimated income: {amount}/month", { amount: money(r.estimated_monthly_income!, r.currency) })}</small>}{r.kind === 'Business' && <small>{t("Ownership: {percentage}%", { percentage: formatNumber(r.ownership_percentage ?? 100, locale) })}</small>}{r.business_id && <small>{t("Business: {name}", { name: availableBusinesses.find(b => b.id === r.business_id)?.name || t("Business") })}</small>}{<small>{['Stock', 'Crypto'].includes(r.kind) ? t('{quantity} units · Gain/loss {amount}', { quantity: formatNumber(r.quantity, locale), amount: money((r.amount - r.cost) * r.quantity, r.currency) }) : r.frequency === 'Once' ? (r.rate ? t('{rate}% annual interest', { rate: formatNumber(r.rate, locale) }) : r.notes || t("One-time record")) : t(r.frequency)}</small>}{['Stock', 'Crypto'].includes(r.kind) && <><small>{t('{price} per unit', { price: formatMoney(r.amount, r.currency, locale, true) })}</small><small>{quoteLabel(r)}</small></>}</div></div></td><td><CategoryBadge kind={r.kind} label={t(r.payment_type==='bonus'?'Bonus':r.kind)}/>{r.custom_category_id&&<CategoryBadge kind={r.custom_category_id} label={planning.data.categories.find(c=>c.id===r.custom_category_id)?.name??t('Custom category')}/>}</td><td className="muted">{r.kind === 'Money lent' ? <><div>{t("Lent: {date}", { date: formatDate(r.lent_date || '') })}</div><small>{r.date ? t("Due: {date}", { date: formatDate(r.date) }) : t("No due date")}</small></> : liabilities.includes(r.kind)?<><div>{t('Started: {date}',{date:formatDate(r.opened_on||'')})}</div><small>{t('Due: {date}',{date:formatDate(r.date)})}</small></>:formatDate(r.date)}</td><td className="amount">{money(value(r), r.currency)}</td><td><div className="row-actions">{[...income,...expenses].includes(r.kind)&&r.frequency!=='Once'&&!r.end_date&&<Button size="sm" variant="outline" onClick={()=>setStopping(rows.find(row=>row.id===r.id)||r)}>{t("Stop")}</Button>}{!demo && trackedKinds.includes(r.kind) && <Button size="sm" variant="outline" onClick={() => setTracking(rows.find(row => row.id === r.id) || r)}>{t("Tracker")}</Button>}{r.kind === 'Mortgage' && <Button size="sm" variant="outline" onClick={() => setPayingMortgage(rows.find(row => row.id === r.id) || r)}>{t("Record payment")}</Button>}{!r.movement_id && !r.operation_id && !r.mortgage_payment_id && !r.history_event_id && <>{isTransactionHistory(r)&&<Button variant="outline" size="sm" disabled={transactionTools.loading||!!transactionTools.error} onClick={()=>setSplitting(historyPage.data.records.find(record=>record.id===r.id)||planning.data.records.find(record=>record.id===r.id)||r)}>{t('Split')}</Button>}<Button size="icon" variant="ghost" aria-label={t('Edit {name}', { name: r.name })} onClick={() => editRecord(r)}><Pencil size={15}/></Button><Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: r.name })} onClick={() => {setError('');setDeleting(r);}}><Trash2 size={15}/></Button></>}</div></td></tr>)}</tbody></table></div> : <div className="empty"><Wallet /><h3>{t(filtersActive?'No matching records.':'A fresh start.')}</h3><p>{t(filtersActive?'Try another search or clear the filters.':'Add a record in {currency} to start building your overview.', { currency })}</p>{filtersActive&&<Button variant="outline" onClick={()=>setFilters(emptyRecordFilters)}>{t('Clear filters')}</Button>}<Button variant="outline" onClick={addRecord}><Plus />{cashFlowSection ? t("Add your first expense") : t("Add your first record")}</Button></div>}{!tableLoading && <nav className="records-pagination" aria-label={t('Record pages')}><span>{t('Page {page} of {pages} · {count} records', { page: formatNumber(tablePage, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(totalRecords, locale, 0) })}</span><div><Button variant="outline" disabled={tableLoading || recordsLoading || busy || tablePage <= 1} onClick={() => setPageState({ key: paginationKey, page: tablePage - 1 })}>{t('Previous')}</Button><Button variant="outline" disabled={tableLoading || recordsLoading || busy || tablePage >= pageCount} onClick={() => setPageState({ key: paginationKey, page: tablePage + 1 })}>{t('Next')}</Button></div></nav>}</section>}</>}</>}</div>
 {['Overview','Upcoming payments','Income & expenses'].includes(section)&&(workspacePreferences.error||planning.error||(section==='Overview'&&(transactionTools.error||expensePlans.error)))&&<div className="content"><p className="error" role="alert">{t('Daily finance tools could not load. Refresh before relying on their estimates.')} <Button onClick={refreshRecords}>{t('Retry')}</Button></p></div>}
 {['Overview','Upcoming payments','Income & expenses'].includes(section)&&!planning.loading&&!planning.error&&!workspacePreferences.loading&&!workspacePreferences.error&&<div className="content review-content" key={'daily:'+user+':'+section}>
 {section!=='Overview'&&section!=='Income & expenses'&&<ReminderPanel data={planning.data} preferences={workspacePreferences}/>}
 </div>}
 {['Assets & investments','Loans & debts','Income & expenses'].includes(section)&&!planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}>{section==='Assets & investments'&&<PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/>} {section==='Loans & debts'&&<DebtPayoffPanel records={planning.data.records} currency={currency} today={depositToday()} preferences={workspacePreferences}/>} {section==='Income & expenses'&&<TransactionInsights owner={user} demo={demo} revision={reload} records={planning.data.records} today={depositToday()} onReview={record=>{setRecordKinds([...income,...expenses]);setEditing(record);}}/>} {section==='Income & expenses'&&!transactionTools.loading&&!transactionTools.error&&<SpendingWatchlists data={planning.data} splits={transactionTools.data.splits} today={depositToday()} currency={currency} preferences={workspacePreferences}/>}</div>}
 {section==='Overview'&&!planning.loading&&!planning.error&&<div className="content review-content"><MonthlyReview owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/></div>}
<footer className="content workspace-privacy-footer"><p className="bottom-note"><ShieldCheck size={14}/>{demo ? t("Sample data for exploring the app.") : t("Private records · Only visible to your account.")}</p></footer>
</main>
 {splitting&&<SplitTransactionDialog key={splitting.id} record={splitting} tools={transactionTools} categories={planning.data.categories} onClose={()=>setSplitting(null)}/>}
 {editingIncomeSource&&<IncomeSourceEditor key={editingIncomeSource.id} initial={editingIncomeSource} currencies={preferencesData.currencies} records={planning.data.records} save={earningSources.save} close={()=>setEditingIncomeSource(null)}/>}
 <RecordDialog onDebtSaved={refreshRecords} onMortgageSave={recordMortgagePayment} onDebtPayment={record=>{setEditing(null);if(record.kind==='Mortgage')setPayingMortgage(record);else setDebtPayment(record);}} earningSources={earningSources} currencies={preferencesData.currencies} key={editing?.id??'closed'} accountMode={section==='Accounts'&&!!editing&&['Cash','Deposit','Stock','Crypto'].includes(editing.kind)} editing={editing} setEditing={setEditing} busy={busy} rows={planning.data.records.length ? planning.data.records : rows} save={save} editingCashFlow={editingCashFlow} recordKinds={recordKinds} demo={demo} summary={summary} field={field} linkedExpensePlan={linkedExpensePlan} availableBusinesses={availableBusinesses} expensePlans={expensePlans} money={money} fetchingPrice={fetchingPrice} fetchPrice={fetchPrice} priceMessage={priceMessage} error={error} planning={planning}/>
 {debtPayment&&<InvestmentTracker key={debtPayment.id} initialType="withdrawal" record={debtPayment} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={()=>setDebtPayment(null)} onSaved={refreshRecords} onPayment={()=>{}}/>}
 {tracking && <InvestmentTracker key={tracking.id} record={tracking} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={() => setTracking(null)} onSaved={refreshRecords} onPayment={() => { setPayingMortgage(rows.find(row => row.id === tracking.id) || tracking); setTracking(null); }}/>}
 {payingMortgage && <MortgagePaymentDialog key={payingMortgage.id} mortgage={payingMortgage} accounts={planning.data.records} onClose={() => setPayingMortgage(null)} onSave={recordMortgagePayment}/>}
 <AlertDialog open={!!deleting} onOpenChange={o => { if (!o && !busy)
        setDeleting(null); }}><AlertDialogContent><AlertDialogTitle>{t("Delete this record?")}</AlertDialogTitle><AlertDialogDescription>{t('Move {name} to Recently deleted? It will be removed from your records, totals and all planning months. Separate transactions stay unchanged. You can restore it from Recently deleted.',{name:deleting?.name||''})}{deleting?.frequency!=='Once'&&<span className="block">{t('To keep past planning and only end future repeats, choose Stop instead.')}</span>}</AlertDialogDescription>{error&&<p role="alert" className="error">{t(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Keep record")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>{t("Delete record")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{stopping&&<StopScheduleDialog name={stopping.name} start={stopping.date} onSave={stopRecord} onClose={()=>setStopping(null)}/>}</SidebarProvider>;
}
